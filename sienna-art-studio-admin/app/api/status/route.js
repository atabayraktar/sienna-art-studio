import { guard } from '@/lib/auth';
import { shopifyConfigured } from '@/lib/shopify';
import { prepare } from '@/lib/import-logic';

export async function GET(request) {
  const g = await guard(request);
  if (g) return g;
  if (!shopifyConfigured()) return Response.json({ connected: false, error: 'Shopify credentials are not set on the server (see SETUP.md).' });
  try {
    return Response.json({ connected: true, ...(await prepare()) });
  } catch (e) {
    return Response.json({ connected: false, error: e.message });
  }
}
