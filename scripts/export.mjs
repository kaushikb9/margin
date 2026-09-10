#!/usr/bin/env node
// Pull a source's session log (notes + replies) from the desk into
// sessions/<videoId>/<date>.json. This file is the input to the class-notes
// artifact and the durable copy of a session; KV is the live copy.
//   TA_HOST=https://margin-3d0.pages.dev TA_TOKEN=... node scripts/export.mjs <videoId>
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const [id] = process.argv.slice(2);
const host = (process.env.TA_HOST || 'http://localhost:8789').replace(/\/$/, '');
const token = process.env.TA_TOKEN || 'devtoken';
if (!id) { console.error('usage: TA_HOST=… TA_TOKEN=… export.mjs <videoId>'); process.exit(2); }

const res = await fetch(`${host}/api/notes?source=${encodeURIComponent(id)}`, { headers: { 'x-ta-token': token } });
if (!res.ok) { console.error(`export: ${host} returned ${res.status} — ${await res.text()}`); process.exit(1); }
const data = await res.json();
if (!data.notes.length) { console.log(`export: no notes for ${id} on ${host}`); process.exit(0); }

// Thread the replies under their notes so the file reads as a conversation.
const byNote = new Map(data.notes.map(n => [n.id, { ...n, replies: [] }]));
for (const r of data.replies) byNote.get(r.noteId)?.replies.push(r);
const session = {
  source: id,
  exportedAt: new Date().toISOString(),
  from: host,
  notes: [...byNote.values()].sort((a, b) => a.t - b.t),
};
const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'sessions', id);
mkdirSync(dir, { recursive: true });
const file = join(dir, `${session.exportedAt.slice(0, 10)}.json`);
writeFileSync(file, JSON.stringify(session, null, 1));
console.log(`export: ${session.notes.length} notes, ${data.replies.length} replies → ${file}`);
