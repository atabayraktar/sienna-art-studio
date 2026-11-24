import { guard } from '@/lib/auth';
import { upsertCollection } from '@/lib/import-logic';

export const maxDuration = 30;

export async function POST(request) {
  const g = await guard(request);
  if (g) return g;
  try {
    const { category, dryRun, publicationId } = await request.json();
    return Response.json(await upsertCollection(category, Boolean(dryRun), publicationId || null));
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
