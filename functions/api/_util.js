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

// A transcript comes from, in order: the shipped asset, KV (fetched earlier),
// or a fetch from YouTube's InnerTube endpoint right now. A video the desk
// has never seen therefore works from the first note; the panel's page-side
// fetch (PUT /api/transcript) is the fallback when YouTube refuses the worker.
export async function loadTranscript(env, origin, id) {
  if (!/^[A-Za-z0-9_-]{6,20}$/.test(id)) return null;
  if (txCache.has(id)) return txCache.get(id);
  let tx = null;
  const res = await env.ASSETS.fetch(new URL(`/transcripts/${id}.json`, origin));
  if (res.ok) tx = await res.json();
  if (!tx && env.TA_KV) tx = await env.TA_KV.get(transcriptKey(id), 'json');
  if (!tx) {
    tx = await fetchTranscript(id).catch(e => { console.log(`[ta] transcript ${id}: fetch failed: ${e.message}`); return null; });
    if (tx && env.TA_KV) await env.TA_KV.put(transcriptKey(id), JSON.stringify(tx));
  }
  txCache.set(id, tx);
  return tx;
}

export async function loadTranscripts(env, origin, extra = []) {
  const res = await env.ASSETS.fetch(new URL('/brain/sources.json', origin));
  const { sources } = await res.json();
  const ids = new Set([...sources.map(s => s.id), ...extra]);
  const out = {};
  for (const id of ids) { const tx = await loadTranscript(env, origin, id); if (tx) out[id] = tx; }
  return out;
}

// Same path scripts/transcript.mjs uses. Returns {id, title, segments, chapters, fetchedAt}.
export async function fetchTranscript(id) {
  const body = { context: { client: { clientName: 'ANDROID', clientVersion: '20.10.38', androidSdkVersion: 30, hl: 'en', gl: 'US' } }, videoId: id };
  const player = await fetch('https://www.youtube.com/youtubei/v1/player', {
    method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': 'com.google.android.youtube/20.10.38 (Linux; U; Android 11) gzip' }, body: JSON.stringify(body),
  }).then(r => r.json());
  const tracks = player?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
  if (!tracks.length) throw new Error('no caption tracks');
  const track = tracks.find(t => t.languageCode === 'en') || tracks[0];
  const xml = await fetch(track.baseUrl, { headers: { 'user-agent': 'com.google.android.youtube/20.10.38' } }).then(r => r.text());
  if (!xml) throw new Error('empty caption body (proof-of-origin gate)');
  const segments = [];
  for (const m of xml.matchAll(/<p t="(\d+)"[^>]*>(.*?)<\/p>/gs)) {
    const text = m[2].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
    if (text) segments.push({ t: Math.round(+m[1] / 100) / 10, text });
  }
  if (!segments.length) for (const m of xml.matchAll(/<text start="([\d.]+)"[^>]*>(.*?)<\/text>/gs)) {
    const text = m[2].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
    if (text) segments.push({ t: Math.round(+m[1] * 10) / 10, text });
  }
  if (!segments.length) throw new Error('caption body had no segments');
  const title = player?.videoDetails?.title || id;
  return { id, title, segments, chapters: [], fetchedAt: new Date().toISOString(), fetchedBy: 'desk' };
}

// KV keys. One writer per key: the extension owns note:*, the desk owns reply:*.
export const noteKey = (src, noteId) => `note:${src}:${noteId}`;
export const transcriptKey = src => `transcript:${src}`;
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
