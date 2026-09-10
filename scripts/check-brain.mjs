#!/usr/bin/env node
// The brain contract. A note that fails here does not ship.
//   - every field present, ids unique, prereqs/unlocks point at real notes
//   - every anchor names a known source and its quote is really said within
//     ±45s of the timestamp (fuzzy: normalised, punctuation-free substring)
//   - explanation length is in range, uses the cluster example at least by name
// Prints one line per failure naming the note, the field and the fix.
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const brainDir = join(root, 'site', 'brain');
const txDir = join(root, 'site', 'transcripts');

const norm = s => s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const transcripts = {};
for (const f of readdirSync(txDir)) if (f.endsWith('.json')) {
  const t = JSON.parse(readFileSync(join(txDir, f), 'utf8'));
  transcripts[t.id] = t;
}

const FIELDS = ['id', 'title', 'aliases', 'prereqs', 'unlocks', 'oneLiner', 'explanation', 'wrongVersion', 'anchors', 'widgetHint'];
const files = readdirSync(brainDir).filter(f => /^d\d\.json$/.test(f));
const all = new Map();
const failures = [];
const fail = (note, field, msg) => failures.push(`${note}: ${field} — ${msg}`);

const docs = files.map(f => ({ f, doc: JSON.parse(readFileSync(join(brainDir, f), 'utf8')) }));
for (const { f, doc } of docs) {
  if (!doc.cluster?.id || !doc.cluster?.thread) fail(f, 'cluster', 'needs {id, name, thread}');
  for (const n of doc.notes) {
    if (all.has(n.id)) fail(n.id, 'id', `duplicate, also in ${all.get(n.id).file}`);
    all.set(n.id, { note: n, file: f, cluster: doc.cluster });
  }
}

for (const [id, { note: n, file, cluster }] of all) {
  for (const k of FIELDS) if (!(k in n)) fail(id, k, `missing (in ${file})`);
  if (!/^c-[a-z0-9-]+$/.test(id)) fail(id, 'id', 'must be c-kebab-case');
  for (const k of ['prereqs', 'unlocks']) for (const ref of n[k] || []) if (!all.has(ref)) fail(id, k, `points at unknown note ${ref}`);
  const words = (n.explanation || '').split(/\s+/).length;
  if (words < 90 || words > 230) fail(id, 'explanation', `${words} words; keep 90–230`);
  if (!/keyboard|typed|typing|suggest/i.test(n.explanation || '')) fail(id, 'explanation', `does not use the ${cluster.id} example`);
  if (!n.wrongVersion?.claim || !n.wrongVersion?.tell) fail(id, 'wrongVersion', 'needs {claim, tell}');
  if (!Array.isArray(n.anchors) || n.anchors.length === 0) fail(id, 'anchors', 'at least one anchor');
  for (const a of n.anchors || []) {
    const tx = transcripts[a.src];
    if (!tx) { fail(id, 'anchors', `unknown source ${a.src}; add site/transcripts/${a.src}.json`); continue; }
    const win = tx.segments.filter(s => Math.abs(s.t - a.t) <= 45).map(s => s.text).join(' ');
    if (!norm(win).includes(norm(a.quote))) {
      fail(id, 'anchors', `quote not found within ±45s of ${a.t}s in ${a.src}: "${a.quote}" — run: node scripts/quote.mjs ${a.src} grep "${a.quote.split(' ').slice(0, 3).join(' ')}"`);
    }
  }
}

const total = all.size;
if (failures.length) {
  console.error(`brain: ${failures.length} problem(s) across ${total} notes`);
  for (const f of failures) console.error('  ' + f);
  process.exit(1);
}
console.log(`brain: ${total} notes across ${files.join(', ')} — all anchors verified against ${Object.keys(transcripts).length} transcripts`);
