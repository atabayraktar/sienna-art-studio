import { guard } from '@/lib/auth';
import { upsertProduct } from '@/lib/import-logic';

export const maxDuration = 60;

export async function POST(request) {
  const g = await guard(request);
  if (g) return g;
  try {
    const { product, collectionIds, locationId, publicationId, dryRun } = await request.json();
    return Response.json(await upsertProduct(product, { collectionIds: collectionIds || [], locationId, publicationId, dryRun: Boolean(dryRun) }));
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
