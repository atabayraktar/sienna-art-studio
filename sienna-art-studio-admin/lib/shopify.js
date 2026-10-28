// Server-only Shopify Admin GraphQL client. Credentials come from env vars, never from the browser.
// Auth: Dev Dashboard app + client credentials grant (token lives 24h, cached in memory).
// Alternative: SHOPIFY_ADMIN_TOKEN (shpat_...) from a legacy custom app.

const API_VERSION = process.env.SHOPIFY_API_VERSION || '2026-07';

function shop() {
  const s = (process.env.SHOPIFY_STORE || '').replace(/^https?:\/\//, '').replace(/\.myshopify\.com.*$/, '').replace(/\/$/, '');
  if (!s) throw new Error('SHOPIFY_STORE is not set');
  return s;
}

export function shopifyConfigured() {
  return Boolean(process.env.SHOPIFY_STORE && (process.env.SHOPIFY_ADMIN_TOKEN || (process.env.SHOPIFY_CLIENT_ID && process.env.SHOPIFY_CLIENT_SECRET)));
}

let cached = { token: null, expiresAt: 0, scope: '' };

async function getToken() {
  if (process.env.SHOPIFY_ADMIN_TOKEN) return process.env.SHOPIFY_ADMIN_TOKEN;
  if (cached.token && Date.now() < cached.expiresAt - 60_000) return cached.token;
  const res = await fetch(`https://${shop()}.myshopify.com/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: process.env.SHOPIFY_CLIENT_ID, client_secret: process.env.SHOPIFY_CLIENT_SECRET }),
  });
  if (!res.ok) throw new Error(`Shopify token request failed (${res.status}). Check SHOPIFY_STORE, SHOPIFY_CLIENT_ID, SHOPIFY_CLIENT_SECRET and that the app is installed on the store.`);
  const j = await res.json();
  cached = { token: j.access_token, expiresAt: Date.now() + (j.expires_in || 86399) * 1000, scope: j.scope || '' };
  return cached.token;
}

export function grantedScopes() { return cached.scope; }

export async function gql(query, variables = {}) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(`https://${shop()}.myshopify.com/admin/api/${API_VERSION}/graphql.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': await getToken() },
      body: JSON.stringify({ query, variables }),
    });
    if (res.status === 429 || res.status >= 500) { await new Promise(r => setTimeout(r, 800 * (attempt + 1))); continue; }
    if (!res.ok) throw new Error(`Shopify HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const j = await res.json();
    if (j.errors) {
      const throttled = JSON.stringify(j.errors).includes('THROTTLED');
      if (throttled && attempt < 3) { await new Promise(r => setTimeout(r, 1200 * (attempt + 1))); continue; }
      throw new Error('Shopify GraphQL: ' + j.errors.map(e => e.message).join('; '));
    }
    return j.data;
  }
  throw new Error('Shopify did not answer (rate limited or down). Try again in a minute.');
}

export function userErrors(list) {
  return (list || []).map(e => `${(e.field || []).join('.')}: ${e.message}`.replace(/^: /, ''));
}
