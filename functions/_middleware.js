// Every /api route: CORS preflight, then the token. Static files are open —
// the brain and transcripts are not secrets, and the extension reads them.
import { authed, json, CORS } from './api/_util.js';

export async function onRequest({ request, env, next }) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/')) return next();
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (url.pathname === '/api/health') return next();
  if (!authed(request, env)) return json({ error: 'unauthorized: set TA_TOKEN in the desk and paste it into the panel' }, 401);
  return next();
}
