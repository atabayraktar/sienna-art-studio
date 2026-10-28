// npm test: parser + payload builders + import steps against a fake Shopify. Includes known-bad inputs that MUST be rejected.
import ExcelJS from 'exceljs';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { parseWorkbook, sheetToObjects } from '../lib/parse-workbook.js';
import { buildProductSetInput, buildMenu, collectionHandle, toHtml } from '../lib/payload.js';

let pass = 0;
const t = (name, fn) => Promise.resolve().then(fn).then(() => { pass++; console.log('ok  ', name); }, e => { console.error('FAIL', name, '\n    ', e.message); process.exitCode = 1; });

async function load(mutate) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(fileURLToPath(new URL('../samples/sienna-products-import.xlsx', import.meta.url)));
  if (mutate) mutate(wb);
  return parseWorkbook({ categoriesSheet: sheetToObjects(wb.getWorksheet('Categories')), productsSheet: sheetToObjects(wb.getWorksheet('Products')) });
}
const col = (ws, h) => { let n = 0; ws.getRow(1).eachCell((c, i) => { if (c.value === h) n = i; }); return n; };

const real = await load();

await t('real workbook: no errors, expected counts', () => {
  assert.deepEqual(real.errors, []);
  assert.equal(real.categories.length, 18);
  assert.equal(real.products.length, 38);
  assert.equal(real.products.reduce((n, p) => n + p.variants.length, 0), 55);
});

// ---- known-bad inputs: each must produce an error mentioning the expected text
const bad = (name, mutate, expect) => t('rejects: ' + name, async () => {
  const r = await load(mutate);
  assert.ok(r.errors.some(e => e.msg.includes(expect)), `expected an error containing "${expect}", got: ${JSON.stringify(r.errors.slice(0, 3))}`);
});
await bad('unknown category', wb => { const ws = wb.getWorksheet('Products'); ws.getCell(2, col(ws, 'Category')).value = 'Nope'; }, 'is not a Category');
await bad('subcategory of another category', wb => { const ws = wb.getWorksheet('Products'); ws.getCell(2, col(ws, 'Subcategory')).value = 'Squishy Toys'; }, 'belongs to');
await bad('duplicate SKU', wb => { const ws = wb.getWorksheet('Products'); ws.getCell(3, col(ws, 'SKU')).value = ws.getCell(2, col(ws, 'SKU')).value; }, 'already used');
await bad('price text', wb => { const ws = wb.getWorksheet('Products'); ws.getCell(2, col(ws, 'Price (USD)')).value = '$10'; }, 'Price must be a number');
await bad('stock decimal', wb => { const ws = wb.getWorksheet('Products'); ws.getCell(2, col(ws, 'Stock Qty')).value = 1.5; }, 'whole number');
await bad('image not https', wb => { const ws = wb.getWorksheet('Products'); ws.getCell(3, col(ws, 'Image 1')).value = 'C:\\pics\\a.jpg'; }, 'not an https link');
await bad('renamed column', wb => { const ws = wb.getWorksheet('Products'); ws.getCell(1, col(ws, 'Price (USD)')).value = 'Price'; }, 'Missing column');
await bad('product rows split apart', wb => { const ws = wb.getWorksheet('Products'); const c = col(ws, 'Product Code'); const a = ws.getCell(46, c).value; ws.getCell(46, c).value = ws.getCell(10, c).value; ws.getCell(10, c).value = a; }, 'not together');
await bad('custom product without fields', wb => { const ws = wb.getWorksheet('Products'); ws.getCell(2, col(ws, 'Customer Fields')).value = '-'; }, 'Customer Fields is empty');
await bad('bad status', wb => { const ws = wb.getWorksheet('Products'); ws.getCell(2, col(ws, 'Status')).value = 'live'; }, 'active or draft');
await bad('subcategory without parent', wb => { const ws = wb.getWorksheet('Categories'); ws.getCell(3, col(ws, 'Parent Category')).value = '-'; }, 'needs a Parent');

// ---- payload builder
const by = code => real.products.find(p => p.code === code);
const LOC = 'gid://shopify/Location/1';

await t('swan lamp: 12 variants, one Pattern option, variant files, stock + location', () => {
  const i = buildProductSetInput(by('SAS-SWAN'), { locationId: LOC, collectionIds: ['gid://c/1'] });
  assert.equal(i.variants.length, 12);
  assert.deepEqual(i.productOptions.map(o => o.name), ['Pattern']);
  assert.equal(i.productOptions[0].values.length, 12);
  assert.ok(i.variants.every(v => v.file && v.file.originalSource.startsWith('https://')));
  assert.deepEqual(i.variants[0].inventoryQuantities, [{ locationId: LOC, name: 'available', quantity: 1 }]);
  assert.equal(i.files, undefined); // all its pictures are variant pictures
  assert.deepEqual(i.collections, ['gid://c/1']);
  assert.equal(i.metafields.find(m => m.key === 'dimensions').value, '13 x 12 x H38cm');
});
await t('marble lamp: two options, both named', () => {
  const i = buildProductSetInput(by('SAS-LED'), { locationId: LOC });
  assert.deepEqual(i.productOptions.map(o => o.name), ['Color', 'Size']);
  assert.equal(i.variants.length, 4);
  assert.equal(i.variants[1].price, '179.95');
});
await t('single product: Default Title, gallery files, no description when "-"', () => {
  const i = buildProductSetInput(by('SAS-LAMP-RCG'), { locationId: LOC });
  assert.deepEqual(i.productOptions, [{ name: 'Title', values: [{ name: 'Default Title' }] }]);
  assert.equal(i.variants[0].optionValues[0].name, 'Default Title');
  assert.equal(i.files.length, 3);
  assert.equal(i.descriptionHtml, undefined);
  assert.equal(i.variants[0].inventoryItem.measurement.weight.unit, 'GRAMS');
  assert.equal(i.status, 'ACTIVE');
});
await t('custom product: metafields + description html', () => {
  const i = buildProductSetInput(by('SAS-CUSTOM-01'), { locationId: LOC });
  assert.equal(i.metafields.find(m => m.key === 'is_custom').value, 'true');
  const f = JSON.parse(i.metafields.find(m => m.key === 'customer_fields').value);
  assert.deepEqual(f.map(x => x.type), ['file', 'text', 'textarea']);
  assert.ok(i.descriptionHtml.startsWith('<p>') && i.descriptionHtml.includes('<br>'));
});
await t('existing media is reused by id (no duplicate uploads)', () => {
  const p = by('SAS-LAMP-RCG');
  const url = p.gallery[0].split('?')[0];
  const i = buildProductSetInput(p, { locationId: LOC, existingMedia: new Map([[url, 'gid://shopify/MediaImage/9']]) });
  assert.deepEqual(i.files[0], { id: 'gid://shopify/MediaImage/9' });
  assert.ok(i.files[1].originalSource);
});
await t('no stock quantity without a location; no crash', () => {
  const i = buildProductSetInput(by('SAS-TOY-01'), { locationId: null });
  assert.equal(i.variants[0].inventoryQuantities, undefined);
});
await t('collection handles: known names map to live handles, new names get a slug', () => {
  assert.equal(collectionHandle('Home & Lighting'), 'all-lamps');
  assert.equal(collectionHandle('Modern Lamps'), 'modern');
  assert.equal(collectionHandle('Kids\u2019 Night Lights'), 'kids-night-lights');
  assert.equal(collectionHandle('Garden & Patio'), 'garden-and-patio');
});
await t('html escaping', () => assert.equal(toHtml('a <b> & c\n\nsecond'), '<p>a &lt;b&gt; &amp; c</p><p>second</p>'));

// ---- import steps against a fake Shopify
process.env.SHOPIFY_STORE = 'test-store';
process.env.SHOPIFY_ADMIN_TOKEN = 'shpat_test';
const { upsertProduct, upsertCollection, writeMenu, prepare } = await import('../lib/import-logic.js');
const calls = [];
let existing = null;
globalThis.fetch = async (url, init) => {
  const { query, variables } = JSON.parse(init.body);
  calls.push({ query, variables });
  const ok = data => ({ ok: true, status: 200, json: async () => ({ data }), text: async () => '' });
  if (query.includes('productVariants(')) return ok({ productVariants: { nodes: existing ? [{ sku: 'x', product: existing }] : [] } });
  if (query.includes('productSet(')) return ok({ productSet: { product: { id: 'gid://shopify/Product/5', handle: 'h' }, userErrors: [] } });
  if (query.includes('publishablePublish')) return ok({ publishablePublish: { userErrors: [] } });
  if (query.includes('collectionByIdentifier')) return ok({ collectionByIdentifier: variables.h === 'all-lamps' ? { id: 'gid://shopify/Collection/1', title: 'All Lamps', image: null, ruleSet: null } : variables.h === 'smart-one' ? { id: 'gid://shopify/Collection/3', title: 's', image: null, ruleSet: {} } : null });
  if (query.includes('collectionCreate')) return ok({ collectionCreate: { collection: { id: 'gid://shopify/Collection/2' }, userErrors: [] } });
  if (query.includes('collectionUpdate')) return ok({ collectionUpdate: { collection: { id: 'gid://shopify/Collection/1' }, userErrors: [] } });
  if (query.includes('metafieldsSet')) return ok({ metafieldsSet: { userErrors: [] } });
  if (query.trim() === '{ shop { id } }') return ok({ shop: { id: 'gid://shopify/Shop/1' } });
  if (query.includes('locations(')) return ok({ shop: { name: 'S', myshopifyDomain: 'd' }, locations: { nodes: [{ id: LOC, name: 'Shop', isActive: true, fulfillsOnlineOrders: true }] }, publications: { nodes: [{ id: 'gid://pub/1', name: 'Online Store' }] } });
  throw new Error('unexpected query ' + query.slice(0, 40));
};

await t('prepare finds location + Online Store channel', async () => {
  const p = await prepare();
  assert.equal(p.locationId, LOC); assert.equal(p.publicationId, 'gid://pub/1');
});
await t('new product: productSet without identifier, then publish', async () => {
  calls.length = 0; existing = null;
  const r = await upsertProduct(by('SAS-TOY-01'), { collectionIds: [], locationId: LOC, publicationId: 'gid://pub/1', dryRun: false });
  assert.equal(r.action, 'created');
  const ps = calls.find(c => c.query.includes('productSet('));
  assert.equal(ps.variables.identifier, undefined);
  assert.ok(calls.some(c => c.query.includes('publishablePublish')));
});
await t('existing product (found by SKU): productSet WITH identifier', async () => {
  calls.length = 0; existing = { id: 'gid://shopify/Product/77', handle: 'old', media: { nodes: [] } };
  const r = await upsertProduct(by('SAS-TOY-01'), { collectionIds: [], locationId: LOC, publicationId: 'gid://pub/1', dryRun: false });
  assert.equal(r.action, 'updated');
  assert.deepEqual(calls.find(c => c.query.includes('productSet(')).variables.identifier, { id: 'gid://shopify/Product/77' });
});
await t('dry run: reads but never writes', async () => {
  calls.length = 0; existing = null;
  const r = await upsertProduct(by('SAS-TOY-01'), { collectionIds: [], locationId: LOC, publicationId: 'gid://pub/1', dryRun: true });
  assert.equal(r.action, 'create');
  assert.ok(calls.every(c => !c.query.includes('mutation')));
  calls.length = 0;
  await upsertCollection(real.categories[0], true);
  assert.ok(calls.every(c => !c.query.includes('mutation')));
});
await t('SKUs split across two store products are refused', async () => {
  existing = null;
  const orig = globalThis.fetch;
  globalThis.fetch = async (u, init) => {
    const { query } = JSON.parse(init.body);
    if (query.includes('productVariants(')) return { ok: true, status: 200, json: async () => ({ data: { productVariants: { nodes: [{ sku: 'a', product: { id: 'P1', handle: 'a', media: { nodes: [] } } }, { sku: 'b', product: { id: 'P2', handle: 'b', media: { nodes: [] } } }] } } }) };
    return orig(u, init);
  };
  await assert.rejects(upsertProduct(by('SAS-SWAN'), { collectionIds: [], locationId: LOC, publicationId: null, dryRun: false }), /different products/);
  globalThis.fetch = orig;
});
await t('collection: existing live handle is updated, new one is created, metafields set', async () => {
  calls.length = 0;
  const a = await upsertCollection(real.categories.find(c => c.name === 'Home & Lighting'), false);
  assert.equal(a.action, 'updated');
  const b = await upsertCollection({ name: 'Garden', type: 'Category', tagline: 't', image: '', headerImage: 'https://x/y.jpg', parent: '' }, false);
  assert.equal(b.action, 'created');
  assert.ok(calls.some(c => c.query.includes('metafieldsSet') && c.variables.m.some(m => m.key === 'header_image')));
});

await t('menu: 4 top categories in Excel order, children grouped, handles kept', () => {
  const m = buildMenu(real.categories);
  assert.deepEqual(m.map(g => g.name), ['Home & Lighting', 'Personalized Gifts', 'Toys & Kids', 'Home Decor']);
  assert.equal(m[0].handle, 'all-lamps');
  assert.deepEqual(m[2].children.map(c => c.handle), ['squishy-toys', 'mini-figures', 'kids-night-lights']);
  assert.equal(m.reduce((n, g) => n + g.children.length, 0), 14);
});
await t('writeMenu: dry run writes nothing, live run sets shop metafield sienna.menu', async () => {
  calls.length = 0;
  const d = await writeMenu(real.categories, true);
  assert.equal(d.groups, 4);
  assert.equal(calls.length, 0);
  const w = await writeMenu(real.categories, false);
  assert.equal(w.action, 'written');
  const mf = calls.find(c => c.query.includes('metafieldsSet')).variables.m[0];
  assert.equal(mf.key, 'menu');
  assert.equal(mf.type, 'json');
  assert.equal(JSON.parse(mf.value).length, 4);
});

console.log(`\n${pass} checks passed${process.exitCode ? ', SOME FAILED' : ''}`);
