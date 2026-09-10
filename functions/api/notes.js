// Notes are the extension's, replies are the desk's.
//   GET  /api/notes?source=<id>   → {notes:[...], replies:[...]}  (the session log)
//   PUT  /api/notes               {source, note:{id,text,tags,t,createdAt}} → upsert one note
//   DELETE /api/notes?source=&id= → remove a note and its replies
import { json, bad, noteKey, replyPrefix, ID_RE, listPrefix } from './_util.js';

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const src = url.searchParams.get('source');
  if (!src || !ID_RE.test(src)) return bad('source: video id');
  if (!env.TA_KV) return json({ notes: [], replies: [], kv: false });
  const [notes, replies] = await Promise.all([listPrefix(env.TA_KV, `note:${src}:`), listPrefix(env.TA_KV, `reply:${src}:`)]);
  notes.sort((a, b) => a.t - b.t || a.createdAt.localeCompare(b.createdAt));
  replies.sort((a, b) => a.at.localeCompare(b.at));
  return json({ notes, replies, kv: true });
}

export async function onRequestPut({ request, env }) {
  let body; try { body = await request.json(); } catch { return bad('body must be JSON'); }
  const { source, note } = body || {};
  if (!source || !ID_RE.test(source)) return bad('source: video id');
  if (!note?.id || !ID_RE.test(note.id)) return bad('note.id');
  if (typeof note.text !== 'string' || !note.text.trim()) return bad('note.text: empty');
  if (typeof note.t !== 'number') return bad('note.t');
  const tags = Array.isArray(note.tags) ? note.tags.filter(t => typeof t === 'string' && /^#[a-z0-9_-]{1,24}$/i.test(t)).map(t => t.toLowerCase()) : [];
  const now = new Date().toISOString();
  const ids = a => Array.isArray(a) ? a.filter(x => typeof x === 'string').slice(0, 200) : [];
  const stored = { id: note.id, src: source, t: note.t, text: note.text.trim().slice(0, 4000), tags, acks: ids(note.acks), stars: ids(note.stars), overruled: Boolean(note.overruled), createdAt: note.createdAt || now, updatedAt: now };
  if (env.TA_KV) await env.TA_KV.put(noteKey(source, note.id), JSON.stringify(stored));
  return json({ note: stored, kv: Boolean(env.TA_KV) });
}

export async function onRequestDelete({ request, env }) {
  const url = new URL(request.url);
  const src = url.searchParams.get('source'), id = url.searchParams.get('id');
  if (!src || !ID_RE.test(src) || !id || !ID_RE.test(id)) return bad('source and id');
  if (!env.TA_KV) return json({ deleted: 0 });
  let n = 0;
  await env.TA_KV.delete(noteKey(src, id)); n++;
  const page = await env.TA_KV.list({ prefix: replyPrefix(src, id) });
  for (const k of page.keys) { await env.TA_KV.delete(k.name); n++; }
  return json({ deleted: n });
}
