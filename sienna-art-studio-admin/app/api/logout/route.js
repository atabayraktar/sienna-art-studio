import { destroySession, guard } from '@/lib/auth';

export async function POST(request) {
  const g = await guard(request);
  if (g) return g;
  await destroySession();
  return Response.json({ ok: true });
}
