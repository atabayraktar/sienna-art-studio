// Server-side import steps. Each step is one small request so it fits the free hosting time limits;
// the browser calls them one by one and shows progress. dryRun = read from Shopify, write nothing.
import { gql, userErrors } from './shopify.js';
import { buildProductSetInput, buildCollectionMetafields, collectionHandle, stripQuery } from './payload.js';

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
