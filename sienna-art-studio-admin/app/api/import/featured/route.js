import { guard } from '@/lib/auth';
import { writeFeatured } from '@/lib/import-logic';

export const maxDuration = 30;

export async function POST(request) {
  const g = await guard(request);
  if (g) return g;
  try {
    const { featured, handles, draftSkus, knownSkus, dryRun } = await request.json();
    return Response.json(await writeFeatured(featured, { handles, draftSkus, knownSkus }, Boolean(dryRun)));
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
