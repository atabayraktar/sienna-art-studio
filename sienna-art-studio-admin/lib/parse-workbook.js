// Turns the import Excel into a validated plan: { categories, products, errors, warnings }.
// Pure functions only (no I/O), so it runs in the browser and in node tests.
// "-" in a cell means "nothing / leave as is".

export const DASH = '-';
const GALLERY_COLS = 5;

// Optional tab: which products the home page shows under "Best sellers" and "New arrivals" (max 5 each, by SKU).
export const FEATURED_TAB = 'Best Sellers & New Arrivals';
export const FEATURED_MAX = 5;
export const TOPBAR_MAX = 3; // messages in the moving bar at the top of the site
export const TOPBAR_TEXT_MAX = 80;
const FEATURED_SECTIONS = { 'best sellers': 'best_sellers', 'new arrivals': 'new_arrivals', 'top bar': 'top_bar' };
const FEATURED_LABEL = { best_sellers: 'Best sellers', new_arrivals: 'New arrivals' };

export function cellText(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') {
    if (v.richText) return v.richText.map(t => t.text).join('');
    if (v.text !== undefined) return String(v.text); // hyperlink cell
    if (v.result !== undefined) return String(v.result); // formula cell
  }
  return String(v);
}

// exceljs worksheet -> array of { _row, <header>: value } (empty rows skipped)
export function sheetToObjects(ws) {
  const headers = [];
  ws.getRow(1).eachCell({ includeEmpty: true }, (c, i) => { headers[i] = cellText(c.value).trim(); });
  const rows = [];
  ws.eachRow({ includeEmpty: false }, (row, n) => {
    if (n === 1) return;
    const o = { _row: n };
    let any = false;
    headers.forEach((h, i) => {
      if (!h) return;
      const t = cellText(row.getCell(i).value).trim();
      o[h] = t;
      if (t) any = true;
    });
    if (any) rows.push(o);
  });
  return { headers: headers.filter(Boolean), rows };
}

const blank = s => s === '' || s === DASH;
const isUrl = s => /^https:\/\/\S+$/.test(s);
const num = s => (s !== '' && !Number.isNaN(Number(s)) ? Number(s) : NaN);

export function parseWorkbook({ categoriesSheet, productsSheet, featuredSheet }) {
  const errors = [];
  const warnings = [];
  const err = (where, msg) => errors.push({ where, msg });

  const needCat = ['Type', 'Name', 'Parent Category', 'Short Description', 'Image URL', 'Header Image URL (wide)'];
  const needProd = ['Product Code', 'Product Name', 'Category', 'Subcategory', 'Description', 'Length (in)', 'Width (in)', 'Height (in)', 'Tags', 'Status', 'Custom Product',
    'Customer Fields', 'Option 1 Name', 'Option 1 Value', 'Option 2 Name', 'Option 2 Value', 'SKU', 'Price (USD)', 'Compare-at Price', 'Stock Qty',
    'Weight (lb)', 'Variant Image URL', ...Array.from({ length: GALLERY_COLS }, (_, i) => 'Image ' + (i + 1))];
  for (const h of needCat) if (!categoriesSheet.headers.includes(h)) err('Categories', `Missing column "${h}". Column titles must not be renamed.`);
  for (const h of needProd) if (!productsSheet.headers.includes(h)) err('Products', `Missing column "${h}". Column titles must not be renamed.`);
  if (errors.length) return { categories: [], products: [], errors, warnings };

  // ---------- categories
  const categories = [];
  const catByName = new Map();
  let curTop = null;
  for (const r of categoriesSheet.rows) {
    const where = `Categories row ${r._row}`;
    const name = r['Name'];
    if (!name) { err(where, 'Name is empty'); continue; }
    if (catByName.has(name.toLowerCase())) { err(where, `Duplicate name "${name}"`); continue; }
    const type = r['Type'];
    const c = {
      name, type, row: r._row,
      tagline: blank(r['Short Description']) ? '' : r['Short Description'],
      image: blank(r['Image URL']) ? '' : r['Image URL'],
      headerImage: blank(r['Header Image URL (wide)']) ? '' : r['Header Image URL (wide)'],
      parent: '',
    };
    if (type === 'Category') {
      curTop = name;
      if (!blank(r['Parent Category'])) err(where, 'A Category must have Parent Category "-"');
    } else if (type === 'Subcategory') {
      c.parent = blank(r['Parent Category']) ? '' : r['Parent Category'];
      if (!c.parent) err(where, 'A Subcategory needs a Parent Category');
      else {
        const p = catByName.get(c.parent.toLowerCase());
        if (!p || p.type !== 'Category') err(where, `Parent Category "${c.parent}" is not a Category row above this one`);
      }
      if (curTop === null) err(where, 'Subcategory before any Category');
    } else err(where, `Type must be Category or Subcategory (got "${type}")`);
    for (const k of ['image', 'headerImage']) if (c[k] && !isUrl(c[k])) err(where, `${k === 'image' ? 'Image URL' : 'Header Image URL'} is not an https link`);
    catByName.set(name.toLowerCase(), c);
    categories.push(c);
  }
  if (!categories.length) err('Categories', 'No categories found');

  // ---------- products (rows with the same Product Code = variants of one product)
  const products = [];
  const byCode = new Map();
  const skuSeen = new Map();
  let prev = null;
  for (const r of productsSheet.rows) {
    const where = `Products row ${r._row}`;
    const code = r['Product Code'];
    if (!code) { err(where, 'Product Code is empty'); continue; }
    let p = byCode.get(code);
    if (p && prev !== code) { err(where, `Rows of product ${code} are not together. Keep all rows of one product directly under each other.`); }
    const first = !p;
    if (first) {
      p = { code, row: r._row, variants: [], gallery: [] };
      byCode.set(code, p);
      products.push(p);
      p.name = r['Product Name'];
      p.category = r['Category'];
      p.subcategory = blank(r['Subcategory']) ? '' : r['Subcategory'];
      p.description = blank(r['Description']) ? '' : r['Description'];
      p.tags = blank(r['Tags']) ? [] : r['Tags'].split(',').map(s => s.trim()).filter(Boolean);
      p.status = (r['Status'] || '').toLowerCase();
      p.custom = (r['Custom Product'] || 'No') === 'Yes';
      p.customFields = [];
      if (!p.name) err(where, 'Product Name is empty');
      if (!['active', 'draft'].includes(p.status)) err(where, `Status must be active or draft (got "${r['Status']}")`);
      if (!['Yes', 'No', ''].includes(r['Custom Product'])) err(where, 'Custom Product must be Yes or No');
      const cat = catByName.get((p.category || '').toLowerCase());
      if (!cat || cat.type !== 'Category') err(where, `Category "${p.category}" is not a Category in the Categories tab`);
      if (!p.subcategory) err(where, `Subcategory is empty. Products are listed in a sub-category, never directly in the main category "${p.category}": pick a Subcategory`);
      if (p.subcategory) {
        const sub = catByName.get(p.subcategory.toLowerCase());
        if (!sub || sub.type !== 'Subcategory') err(where, `Subcategory "${p.subcategory}" is not a Subcategory in the Categories tab`);
        else if (cat && sub.parent !== cat.name) err(where, `Subcategory "${p.subcategory}" belongs to "${sub.parent}", not to "${p.category}"`);
      }
      for (let i = 1; i <= GALLERY_COLS; i++) {
        const u = r['Image ' + i];
        if (blank(u)) continue;
        if (!isUrl(u)) err(where, `Image ${i} is not an https link`); else p.gallery.push(u);
      }
      if (p.custom) {
        const cf = r['Customer Fields'];
        if (blank(cf)) err(where, 'Custom Product = Yes but Customer Fields is empty');
        else cf.split('\n').map(s => s.trim()).filter(Boolean).forEach(line => {
          const [label, type, req] = line.split('|').map(s => s.trim());
          if (!label || !['text', 'textarea', 'file', 'select', 'number', 'date'].includes(type) || !['required', 'optional'].includes(req)) err(where, `Customer Fields line "${line}" must be: Label | type | required or optional`);
          else p.customFields.push({ label, type, required: req === 'required' });
        });
      } else if (!blank(r['Customer Fields'])) warnings.push({ where, msg: 'Customer Fields filled but Custom Product is No: ignored' });
      p.optionNames = [];
    } else {
      for (const h of ['Product Name', 'Category', 'Description', 'Status']) if (r[h]) warnings.push({ where, msg: `${h} is filled on a variant row of ${code}: ignored (only the first row counts)` });
    }
    prev = code;

    // variant (every row)
    const v = { row: r._row, sku: r['SKU'], options: [] };
    if (!v.sku || v.sku === DASH) err(where, 'SKU is empty');
    else if (skuSeen.has(v.sku)) err(where, `SKU ${v.sku} is already used on row ${skuSeen.get(v.sku)}`);
    else skuSeen.set(v.sku, r._row);
    v.price = num(r['Price (USD)']);
    if (Number.isNaN(v.price) || v.price < 0) err(where, `Price must be a number (got "${r['Price (USD)']}")`);
    const cmp = r['Compare-at Price'];
    v.compareAt = blank(cmp) ? null : num(cmp);
    if (Number.isNaN(v.compareAt)) err(where, 'Compare-at Price must be a number or -');
    const st = r['Stock Qty'];
    v.stock = st === '' ? null : num(st);
    if (v.stock !== null && (!Number.isInteger(v.stock) || v.stock < 0)) err(where, `Stock Qty must be a whole number 0 or more (got "${st}")`);
    if (v.stock === null) warnings.push({ where, msg: 'Stock Qty is empty: stock will not be changed' });
    // Product size (inches) and weight (pounds) of this SKU: shown on the product page, weight also goes to Shopify (shipping).
    const dimCols = ['Length (in)', 'Width (in)', 'Height (in)'];
    const dimRaw = dimCols.map(h => r[h]);
    const dimFilled = dimRaw.filter(x => !blank(x)).length;
    v.size = null;
    if (dimFilled === 3) {
      const [l, w, h] = dimRaw.map(num);
      if ([l, w, h].some(x => Number.isNaN(x) || x <= 0)) err(where, `Length, Width and Height must be numbers above 0 (got ${dimRaw.join(' x ')})`);
      else v.size = { l, w, h };
    } else if (dimFilled > 0) err(where, 'Length, Width and Height must ALL be filled (or all be -)');
    const wt = r['Weight (lb)'];
    v.weightLb = blank(wt) ? null : num(wt);
    if (Number.isNaN(v.weightLb) || (v.weightLb !== null && v.weightLb <= 0)) err(where, `Weight (lb) must be a number above 0 or - (got "${wt}")`);
    v.image = blank(r['Variant Image URL']) ? '' : r['Variant Image URL'];
    if (v.image && !isUrl(v.image)) err(where, 'Variant Image URL is not an https link');
    for (const i of [1, 2]) {
      const n = r[`Option ${i} Name`], val = r[`Option ${i} Value`];
      if (blank(n) && blank(val)) continue;
      if (blank(n) || blank(val)) { err(where, `Option ${i} Name and Value must both be filled (or both -)`); continue; }
      v.options.push({ name: n, value: val });
    }
    if (first) p.optionNames = v.options.map(o => o.name);
    else if (JSON.stringify(v.options.map(o => o.name)) !== JSON.stringify(p.optionNames)) err(where, `Option names differ from the first row of ${code}`);
    p.variants.push(v);
  }

  for (const p of products) {
    if (p.variants.length > 1) {
      if (!p.optionNames.length) err(`Products row ${p.row}`, `${p.code} has several rows but no Option Name/Value: variants need an option (Color, Size...)`);
      const combos = new Set();
      for (const v of p.variants) {
        const k = JSON.stringify(v.options.map(o => o.value.toLowerCase()));
        if (combos.has(k)) err(`Products row ${v.row}`, `${p.code}: two variants have the same option values`);
        combos.add(k);
      }
    } else if (p.optionNames.length) warnings.push({ where: `Products row ${p.row}`, msg: `${p.code} has a single row with an option: option is ignored` });
    if (!p.gallery.length && !p.variants.some(v => v.image)) warnings.push({ where: `Products row ${p.row}`, msg: `${p.code} has no images` });
  }
  if (!products.length) err('Products', 'No products found');

  // ---------- home page sections (optional tab; no tab = the home page lists stay as they are)
  let featured = null;
  if (featuredSheet) {
    featured = { best_sellers: [], new_arrivals: [], top_bar: [] };
    const known = new Set(products.flatMap(p => [p.code, ...p.variants.map(v => v.sku)]).map(x => String(x).toLowerCase()));
    for (const h of ['Section', 'SKU']) if (!featuredSheet.headers.includes(h)) err(FEATURED_TAB, `Missing column "${h}". Column titles must not be renamed.`);
    if (featuredSheet.headers.includes('Section') && featuredSheet.headers.includes('SKU')) {
      for (const r of featuredSheet.rows) {
        const where = `${FEATURED_TAB} row ${r._row}`;
        const key = FEATURED_SECTIONS[(r['Section'] || '').toLowerCase()];
        if (!key) { err(where, `Section must be "Best sellers", "New arrivals" or "Top bar" (got "${r['Section']}")`); continue; }
        if (key === 'top_bar') {
          // the moving bar at the top of the site: plain text, no SKU
          const text = (r['Top Bar Text'] || '').trim();
          if (blank(text)) { err(where, 'Top bar row has no text. Write the message in the "Top Bar Text" column'); continue; }
          if (text.length > TOPBAR_TEXT_MAX) { err(where, `Top bar text is too long (${text.length} characters, max ${TOPBAR_TEXT_MAX})`); continue; }
          if (featured.top_bar.some(x => x.toLowerCase() === text.toLowerCase())) { err(where, `Top bar text "${text}" is listed twice`); continue; }
          featured.top_bar.push(text);
          continue;
        }
        const sku = r['SKU'];
        if (blank(sku)) { err(where, 'SKU is empty'); continue; }
        if (featured[key].some(x => x.toLowerCase() === sku.toLowerCase())) { err(where, `${sku} is listed twice in ${FEATURED_LABEL[key]}`); continue; }
        featured[key].push(sku);
        if (!known.has(sku.toLowerCase())) warnings.push({ where, msg: `${sku} is not in the Products tab: it must already exist in the store (checked at upload)` });
      }
      if (featured.top_bar.length > TOPBAR_MAX) err(FEATURED_TAB, `The top bar can show at most ${TOPBAR_MAX} messages (found ${featured.top_bar.length})`);
      for (const key of ['best_sellers', 'new_arrivals']) {
        if (featured[key].length > FEATURED_MAX) err(FEATURED_TAB, `${FEATURED_LABEL[key]} can show at most ${FEATURED_MAX} products (found ${featured[key].length})`);
      }
    }
  }
  const vs = products.flatMap(p => p.variants);
  const noSize = vs.filter(v => !v.size).length, noWeight = vs.filter(v => v.weightLb === null).length;
  if (noSize || noWeight) warnings.push({ where: 'Products', msg: `${noSize} variant(s) have no Length/Width/Height and ${noWeight} have no Weight: nothing is shown or sent to Shopify for them` });
  return { categories, products, featured, errors, warnings };
}
