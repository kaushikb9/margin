// Shared helpers for all API routes. Underscore prefix = not routed by Pages.
import { Brain } from '../../desk/ask.js';

export const json = (obj, status = 200, extra = {}) => new Response(JSON.stringify(obj), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', ...CORS, ...extra },
});
export const bad = (msg, status = 400) => json({ error: msg }, status);

// The extension calls from a moz-extension:// origin, so the origin is not a
// useful gate; the token header is. Everything under /api requires it.
export const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'content-type, x-ta-token',
  'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
};

export function authed(request, env) {
  if (!env.TA_TOKEN) return false;
  return request.headers.get('x-ta-token') === env.TA_TOKEN;
}

// Brain and transcripts are static assets; load once per isolate.
let brainCache = null;
const txCache = new Map();

export async function loadBrain(env, origin) {
  if (brainCache) return brainCache;
  const docs = [];
  for (const id of ['d1', 'd2']) {
    const res = await env.ASSETS.fetch(new URL(`/brain/${id}.json`, origin));
    if (res.ok) docs.push(await res.json());
  }
  if (!docs.length) throw new Error('brain: no site/brain/d*.json served by ASSETS');
  brainCache = new Brain(docs);
  return brainCache;
}

export async function loadTranscript(env, origin, id) {
  if (!/^[A-Za-z0-9_-]{6,20}$/.test(id)) return null;
  if (txCache.has(id)) return txCache.get(id);
  const res = await env.ASSETS.fetch(new URL(`/transcripts/${id}.json`, origin));
  const tx = res.ok ? await res.json() : null;
  txCache.set(id, tx);
  return tx;
}

export async function loadTranscripts(env, origin) {
  const res = await env.ASSETS.fetch(new URL('/brain/sources.json', origin));
  const { sources } = await res.json();
  const out = {};
  for (const s of sources) out[s.id] = await loadTranscript(env, origin, s.id);
  return out;
}

// KV keys. One writer per key: the extension owns note:*, the desk owns reply:*.
export const noteKey = (src, noteId) => `note:${src}:${noteId}`;
export const replyKey = (src, noteId, seq) => `reply:${src}:${noteId}:${String(seq).padStart(3, '0')}`;
export const replyPrefix = (src, noteId) => `reply:${src}:${noteId}:`;
export const ID_RE = /^[A-Za-z0-9_-]{4,40}$/;

export async function listPrefix(kv, prefix) {
  const out = [];
  let cursor;
  do {
    const page = await kv.list({ prefix, cursor });
    for (const k of page.keys) {
      const v = await kv.get(k.name, 'json');
      if (v) out.push(v);
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return out;
}

export const log = (env, line) => { if (env.TA_LOG !== '0') console.log(`[ta] ${line}`); };
