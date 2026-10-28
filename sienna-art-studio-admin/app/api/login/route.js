import { checkCredentials, createSession } from '@/lib/auth';

// Best-effort brute-force brake (per server instance): 5 failures -> 5 minute lock for that IP.
const fails = new Map();

export async function POST(request) {
  const ip = (request.headers.get('x-forwarded-for') || 'local').split(',')[0].trim();
  const rec = fails.get(ip) || { n: 0, until: 0 };
  if (rec.until > Date.now()) return Response.json({ error: 'Too many attempts. Try again in a few minutes.' }, { status: 429 });
  let body = {};
  try { body = await request.json(); } catch {}
  if (checkCredentials(body.username, body.password)) {
    fails.delete(ip);
    await createSession();
    return Response.json({ ok: true });
  }
  rec.n += 1;
  if (rec.n >= 5) { rec.until = Date.now() + 5 * 60_000; rec.n = 0; }
  fails.set(ip, rec);
  await new Promise(r => setTimeout(r, 600));
  return Response.json({ error: 'Wrong username or password' }, { status: 401 });
}
