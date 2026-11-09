// Server-side import steps. Each step is one small request so it fits the free hosting time limits;
// the browser calls them one by one and shows progress. dryRun = read from Shopify, write nothing.
import { gql, userErrors } from './shopify.js';
import { buildProductSetInput, buildCollectionMetafields, buildMenu, collectionHandle, stripQuery } from './payload.js';

export async function prepare() {
  const d = await gql(`{
    shop { name myshopifyDomain }
    locations(first: 10) { nodes { id name isActive fulfillsOnlineOrders } }
    publications(first: 20) { nodes { id name } }
  }`);
  const locs = d.locations.nodes.filter(l => l.isActive);
  const loc = locs.find(l => l.fulfillsOnlineOrders) || locs[0];
  const pub = d.publications.nodes.find(p => p.name === 'Online Store');
  return {
    shopName: d.shop.name,
    domain: d.shop.myshopifyDomain,
    locationId: loc ? loc.id : null,
    locationName: loc ? loc.name : null,
    publicationId: pub ? pub.id : null,
  };
}

export async function upsertCollection(cat, dryRun) {
  const handle = collectionHandle(cat.name);
  const d = await gql(`query($h: String!) {
    collectionByIdentifier(identifier: { handle: $h }) { id title image { url } ruleSet { appliedDisjunctively } }
  }`, { h: handle });
  const ex = d.collectionByIdentifier;
  const smart = Boolean(ex && ex.ruleSet);
  if (dryRun) return { action: ex ? 'update' : 'create', handle, id: ex ? ex.id : null, smart };

  let id;
  const wantImage = cat.image && (!ex || !ex.image || stripQuery(ex.image.url) !== stripQuery(cat.image));
  if (ex) {
    id = ex.id;
    const input = { id, title: cat.name };
    if (wantImage) input.image = { src: cat.image, altText: cat.name };
    const r = await gql(`mutation($input: CollectionInput!) { collectionUpdate(input: $input) { collection { id } userErrors { field message } } }`, { input });
    const e = userErrors(r.collectionUpdate.userErrors);
    if (e.length) throw new Error(e.join('; '));
  } else {
    const input = { title: cat.name, handle };
    if (cat.image) input.image = { src: cat.image, altText: cat.name };
    const r = await gql(`mutation($input: CollectionInput!) { collectionCreate(input: $input) { collection { id } userErrors { field message } } }`, { input });
    const e = userErrors(r.collectionCreate.userErrors);
    if (e.length) throw new Error(e.join('; '));
    id = r.collectionCreate.collection.id;
  }
  const mf = buildCollectionMetafields(cat, id);
  if (mf.length) {
    const r = await gql(`mutation($m: [MetafieldsSetInput!]!) { metafieldsSet(metafields: $m) { userErrors { field message } } }`, { m: mf });
    const e = userErrors(r.metafieldsSet.userErrors);
    if (e.length) throw new Error('metafields: ' + e.join('; '));
  }
  return { action: ex ? 'updated' : 'created', handle, id, smart };
}

async function findExistingProduct(skus) {
  const q = skus.map(s => `sku:"${s.replace(/"/g, '')}"`).join(' OR ');
  const d = await gql(`query($q: String!) {
    productVariants(first: 20, query: $q) { nodes { sku product { id handle media(first: 100) { nodes { id ... on MediaImage { image { url } } } } } } }
  }`, { q });
  const nodes = d.productVariants.nodes;
  if (!nodes.length) return null;
  const ids = new Set(nodes.map(n => n.product.id));
  const product = nodes[0].product;
  const media = new Map();
  for (const m of product.media.nodes) if (m.image) media.set(stripQuery(m.image.url), m.id);
  return { id: product.id, handle: product.handle, media, conflict: ids.size > 1 };
}

export async function upsertProduct(p, { collectionIds, locationId, publicationId, dryRun }) {
  const ex = await findExistingProduct(p.variants.map(v => v.sku));
  if (ex && ex.conflict) throw new Error(`The SKUs of ${p.code} already belong to different products on the store. Fix the SKUs first.`);
  const input = buildProductSetInput(p, { locationId, collectionIds, existingMedia: ex ? ex.media : new Map() });
  if (dryRun) return { action: ex ? 'update' : 'create', handle: ex ? ex.handle : null, variants: input.variants.length, newImages: countNew(input) };

  const r = await gql(`mutation($input: ProductSetInput!, $identifier: ProductSetIdentifiers) {
    productSet(synchronous: true, input: $input, identifier: $identifier) {
      product { id handle }
      userErrors { field message code }
    }
  }`, { input, identifier: ex ? { id: ex.id } : undefined });
  const e = userErrors(r.productSet.userErrors);
  if (e.length) throw new Error(e.join('; '));
  const product = r.productSet.product;

  let published = false;
  if (p.status === 'active' && publicationId) {
    const pr = await gql(`mutation($id: ID!, $pub: ID!) { publishablePublish(id: $id, input: [{ publicationId: $pub }]) { userErrors { field message } } }`, { id: product.id, pub: publicationId });
    const pe = userErrors(pr.publishablePublish.userErrors).filter(m => !/already/i.test(m));
    if (pe.length) throw new Error('saved, but publishing failed: ' + pe.join('; '));
    published = true;
  }
  return { action: ex ? 'updated' : 'created', handle: product.handle, id: product.id, variants: input.variants.length, published };
}

function countNew(input) {
  let n = (input.files || []).filter(f => f.originalSource).length;
  for (const v of input.variants) if (v.file && v.file.originalSource) n++;
  return n;
}

// Writes the whole menu tree to the shop metafield sienna.menu (the theme reads it).
export async function writeMenu(categories, dryRun) {
  const menu = buildMenu(categories);
  if (dryRun) return { action: 'write', groups: menu.length };
  const d = await gql(`{ shop { id } }`);
  const r = await gql(`mutation($m: [MetafieldsSetInput!]!) { metafieldsSet(metafields: $m) { userErrors { field message } } }`, {
    m: [{ ownerId: d.shop.id, namespace: 'sienna', key: 'menu', type: 'json', value: JSON.stringify(menu) }],
  });
  const e = userErrors(r.metafieldsSet.userErrors);
  if (e.length) throw new Error(e.join('; '));
  return { action: 'written', groups: menu.length };
}

// Which products the home page shows under "Best sellers" and "New arrivals" (max 5 each).
// Writes the product HANDLES to the shop metafield sienna.featured (the theme reads it).
// handles = sku -> handle of the products this same import just saved; any other SKU is looked up in the store.
export async function writeFeatured(featured, { handles = {}, draftSkus = [], knownSkus = [] } = {}, dryRun) {
  const known = new Set(knownSkus.map(x => x.toLowerCase()));
  const drafts = new Set(draftSkus.map(x => x.toLowerCase()));
  const value = { best_sellers: [], new_arrivals: [] };
  const missing = [];
  const hidden = [];
  for (const key of Object.keys(value)) {
    for (const sku of featured[key] || []) {
      let handle = handles[sku] || null;
      let hide = drafts.has(sku.toLowerCase());
      if (!handle) {
        const d = await gql(`query($q: String!) { productVariants(first: 5, query: $q) { nodes { sku product { handle status } } } }`, { q: `sku:"${sku.replace(/"/g, '')}"` });
        const hit = d.productVariants.nodes.find(n => (n.sku || '').toLowerCase() === sku.toLowerCase());
        if (hit) { handle = hit.product.handle; hide = hit.product.status !== 'ACTIVE'; }
      }
      if (!handle) { if (!(dryRun && known.has(sku.toLowerCase()))) missing.push(sku); continue; }
      if (hide) hidden.push(sku);
      value[key].push(handle);
    }
  }
  if (missing.length) throw new Error(`These SKUs are not in the store: ${missing.join(', ')}. Check the spelling, or add the product to the Products tab.`);
  const counts = { bestSellers: (featured.best_sellers || []).length, newArrivals: (featured.new_arrivals || []).length };
  if (dryRun) return { action: 'write', ...counts, hidden };
  const d = await gql(`{ shop { id } }`);
  const r = await gql(`mutation($m: [MetafieldsSetInput!]!) { metafieldsSet(metafields: $m) { userErrors { field message } } }`, {
    m: [{ ownerId: d.shop.id, namespace: 'sienna', key: 'featured', type: 'json', value: JSON.stringify(value) }],
  });
  const e = userErrors(r.metafieldsSet.userErrors);
  if (e.length) throw new Error(e.join('; '));
  return { action: 'written', ...counts, hidden };
}
