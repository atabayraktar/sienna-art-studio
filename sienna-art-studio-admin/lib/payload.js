// Pure builders: parsed Excel rows -> Shopify GraphQL inputs. No network, so they are unit-tested.

// Collections that already exist on the live store (matched by handle, not by title,
// so the import updates them instead of creating duplicates). New names fall back to a slug.
export const EXISTING_COLLECTION_HANDLES = {
  'home & lighting': 'all-lamps',
  'mosaic & stained glass': 'mosaic-stained-glass',
  'animal stained glass lamps': 'animal-stained-glass-lamps',
  'modern lamps': 'modern',
  'rechargeable lamps': 'rechargeable',
  'crystal glow lamps': 'crystal-glow-lamps',
  'personalized gifts': 'personalized-gifts',
  'custom art': 'custom-art-personalized-gifts',
  'custom products': 'custom-products',
  'toys & kids': 'toys-kids',
  'squishy toys': 'squishy-toys',
  'mini figures': 'mini-figures',
  'kids’ night lights': 'kids-night-lights',
  'home decor': 'home-decor',
  'wall art': 'wall-art',
  'decorative accents': 'decorative-accents',
  'seasonal decor': 'seasonal-decor',
  'gift ideas': 'gift-ideas',
};

export function slugify(s) {
  return s.toLowerCase().replace(/&/g, ' and ').replace(/[’']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
export const collectionHandle = name => EXISTING_COLLECTION_HANDLES[name.toLowerCase()] || slugify(name);

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export function toHtml(text) {
  if (!text) return '';
  return text.split(/\n{2,}/).map(par => '<p>' + esc(par.trim()).replace(/\n/g, '<br>') + '</p>').join('');
}

export const stripQuery = u => u.split('?')[0];

// existingMedia: Map<url without query, MediaImage id> of the product being updated (empty for a new product)
// Size and weight block added under the description (what the customer sees). Same values for every variant = one line, else one line per variant.
const fmt = n => String(Math.round(n * 100) / 100);
export function specsHtml(p) {
  const rows = p.variants.map(v => ({
    label: v.options && v.options.length ? v.options.map(o => o.value).join(' / ') : v.sku,
    size: v.size ? `${fmt(v.size.l)} × ${fmt(v.size.w)} × ${fmt(v.size.h)} in` : '',
    weight: v.weightLb !== null && v.weightLb !== undefined ? `${fmt(v.weightLb)} lb` : '',
  })).filter(r => r.size || r.weight);
  if (!rows.length) return '';
  const same = rows.length === p.variants.length && rows.every(r => r.size === rows[0].size && r.weight === rows[0].weight);
  if (same) {
    return '<p>' + [rows[0].size && `<strong>Dimensions (L × W × H):</strong> ${rows[0].size}`, rows[0].weight && `<strong>Weight:</strong> ${rows[0].weight}`].filter(Boolean).join('<br>') + '</p>';
  }
  return '<p><strong>Dimensions (L × W × H) and weight</strong><br>' + rows.map(r => `${esc(r.label)}: ${[r.size, r.weight].filter(Boolean).join(', ')}`).join('<br>') + '</p>';
}

export function buildProductSetInput(p, { locationId, collectionIds = [], existingMedia = new Map(), vendor = 'Sienna Art Studio' }) {
  const multi = p.variants.length > 1;
  const fileRef = url => {
    const id = existingMedia.get(stripQuery(url));
    return id ? { id } : { originalSource: url, contentType: 'IMAGE', alt: p.name };
  };

  const input = { title: p.name, vendor, status: p.status.toUpperCase() };
  const specs = specsHtml(p);
  if (p.description || specs) input.descriptionHtml = (p.description ? toHtml(p.description) : '') + specs;
  if (p.tags.length) input.tags = p.tags;
  if (collectionIds.length) input.collections = collectionIds;

  if (multi) {
    input.productOptions = p.optionNames.map((name, i) => {
      const seen = [];
      for (const v of p.variants) if (!seen.includes(v.options[i].value)) seen.push(v.options[i].value);
      return { name, values: seen.map(n => ({ name: n })) };
    });
  } else {
    input.productOptions = [{ name: 'Title', values: [{ name: 'Default Title' }] }];
  }

  input.variants = p.variants.map(v => {
    const out = {
      optionValues: multi ? v.options.map(o => ({ optionName: o.name, name: o.value })) : [{ optionName: 'Title', name: 'Default Title' }],
      sku: v.sku,
      price: v.price.toFixed(2),
      inventoryItem: { sku: v.sku, tracked: true },
    };
    if (v.compareAt !== null) out.compareAtPrice = v.compareAt.toFixed(2);
    if (v.weightLb !== null) out.inventoryItem.measurement = { weight: { value: v.weightLb, unit: 'POUNDS' } };
    if (v.stock !== null && locationId) out.inventoryQuantities = [{ locationId, name: 'available', quantity: v.stock }];
    if (v.image) out.file = fileRef(v.image);
    return out;
  });

  const variantImages = new Set(p.variants.map(v => v.image).filter(Boolean).map(stripQuery));
  const gallery = p.gallery.filter(u => !variantImages.has(stripQuery(u)));
  if (gallery.length) input.files = gallery.map(fileRef);

  const metafields = [];
  if (p.custom) {
    metafields.push({ namespace: 'sienna', key: 'is_custom', type: 'boolean', value: 'true' });
    metafields.push({ namespace: 'sienna', key: 'customer_fields', type: 'json', value: JSON.stringify(p.customFields) });
  }
  if (metafields.length) input.metafields = metafields;
  return input;
}

export function buildCollectionMetafields(cat, collectionId) {
  const mf = [];
  const add = (key, value) => { if (value) mf.push({ ownerId: collectionId, namespace: 'sienna', key, type: 'single_line_text_field', value }); };
  add('tagline', cat.tagline);
  add('header_image', cat.headerImage);
  add('parent', cat.parent);
  return mf;
}

// Menu tree for the theme: one JSON in the shop metafield sienna.menu, in Excel order.
// Top level = Category rows, children = their Subcategory rows.
export function buildMenu(categories) {
  const node = c => ({ name: c.name, handle: collectionHandle(c.name), tagline: c.tagline || '' });
  const tops = categories.filter(c => c.type === 'Category').map(c => ({ ...node(c), headerImage: c.headerImage || '', children: [] }));
  for (const c of categories.filter(c => c.type === 'Subcategory')) {
    const top = tops.find(t => t.name.toLowerCase() === c.parent.toLowerCase());
    if (top) top.children.push(node(c));
  }
  return tops;
}
