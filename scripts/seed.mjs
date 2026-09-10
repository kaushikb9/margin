#!/usr/bin/env node
// Preload a set of notes into the desk and let the TA respond to each one,
// exactly as if they had been jotted from the sidebar. Idempotent per seed
// file: note ids are derived from the seed, so re-running updates rather
// than duplicates, and a note that already has replies is not re-asked.
//   TA_HOST=https://margin-3d0.pages.dev TA_TOKEN=… node scripts/seed.mjs seeds/<file>.json
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const [file] = process.argv.slice(2);
const host = (process.env.TA_HOST || 'http://localhost:8789').replace(/\/$/, '');
const token = process.env.TA_TOKEN || 'devtoken';
if (!file) { console.error('usage: TA_HOST=… TA_TOKEN=… seed.mjs seeds/<file>.json'); process.exit(2); }
const seed = JSON.parse(readFileSync(file, 'utf8'));
const src = seed.source;

const api = async (path, method = 'GET', body) => {
  const res = await fetch(host + path, { method, headers: { 'x-ta-token': token, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${data.error || ''}`);
  return data;
};

const health = await fetch(host + '/api/health').then(r => r.json()).catch(() => null);
if (!health?.ok) { console.error(`seed: desk at ${host} is not healthy: ${JSON.stringify(health)}`); process.exit(1); }
console.log(`seed: ${host} · ${health.mock ? 'MOCK model' : health.models.composer} · ${seed.notes.length} notes for ${src}`);

const existing = await api(`/api/notes?source=${encodeURIComponent(src)}`);
const replied = new Set((existing.replies || []).map(r => r.noteId));

let asked = 0, checked = 0, flagged = 0, skipped = 0;
for (const n of seed.notes) {
  const id = 's' + createHash('sha1').update(`${src}|${n.t}|${n.text}`).digest('hex').slice(0, 10);
  const note = { id, text: n.text, tags: n.tags || [], t: n.t, createdAt: n.createdAt || '2026-09-09T15:30:00.000Z' };
  await api('/api/notes', 'PUT', { source: src, note });
  if (replied.has(id)) { skipped++; console.log(`  = ${fmt(n.t)} already answered · ${n.text.slice(0, 60)}`); continue; }
  const mode = note.tags.includes('#doubt') ? 'answer' : 'check';
  const t0 = Date.now();
  const r = await api('/api/ask', 'POST', { mode, source: { id: src }, note });
  const ms = Date.now() - t0;
  if (mode === 'answer') { asked++; console.log(`  ? ${fmt(n.t)} ${r.reply?.kind === 'answer' ? `answered · ${r.reply.title}` : `error · ${r.reply?.error}`} (${ms}ms)`); }
  else if (r.reply) { flagged++; console.log(`  ! ${fmt(n.t)} check this · ${r.reply.correction?.slice(0, 70)}… (${ms}ms)`); }
  else { checked++; console.log(`  · ${fmt(n.t)} fine (${ms}ms)`); }
}
console.log(`seed: done — ${asked} answered, ${flagged} flagged, ${checked} fine, ${skipped} already had replies. Open the video in Zen; the sidebar merges them on open.`);

function fmt(t) { const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = Math.floor(t % 60); return (h ? `${h}:${String(m).padStart(2, '0')}` : m) + ':' + String(s).padStart(2, '0'); }
