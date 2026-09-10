// GET  /api/transcript?source=<id>  → {have: bool, title, segments: n, fetchedBy}
// PUT  /api/transcript {source, title, segments[{t,text}]} → stores what the
//      page script fetched from inside the tab, for videos YouTube will not
//      hand to the worker.
import { json, bad, ID_RE, transcriptKey, loadTranscript } from './_util.js';

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url); const src = url.searchParams.get('source');
  if (!src || !ID_RE.test(src)) return bad('source: video id');
  const tx = await loadTranscript(env, url.origin, src);
  return json(tx ? { have: true, title: tx.title, segments: tx.segments.length, fetchedBy: tx.fetchedBy || 'shipped' } : { have: false });
}

export async function onRequestPut({ request, env }) {
  let body; try { body = await request.json(); } catch { return bad('body must be JSON'); }
  const { source, title, segments } = body || {};
  if (!source || !ID_RE.test(source)) return bad('source: video id');
  if (!Array.isArray(segments) || segments.length < 10) return bad('segments: at least 10 of {t, text}');
  const clean = segments.filter(s => s && typeof s.t === 'number' && typeof s.text === 'string' && s.text.trim()).slice(0, 20000).map(s => ({ t: Math.round(s.t * 10) / 10, text: s.text.trim().slice(0, 500) }));
  const tx = { id: source, title: typeof title === 'string' ? title.slice(0, 200) : source, segments: clean, chapters: [], fetchedAt: new Date().toISOString(), fetchedBy: 'page' };
  if (env.TA_KV) await env.TA_KV.put(transcriptKey(source), JSON.stringify(tx));
  return json({ have: true, segments: clean.length });
}
