#!/usr/bin/env node
// Find anchors in a transcript. Used when writing brain notes, so every quote is real.
//   node scripts/quote.mjs <videoId> at 24:10 [±seconds]
//   node scripts/quote.mjs <videoId> grep "unique ids"
import { readFileSync } from 'node:fs';
const [id, mode, arg, win = '30'] = process.argv.slice(2);
if (!id || !mode) { console.error('usage: quote.mjs <videoId> at mm:ss [±s] | grep "phrase"'); process.exit(2); }
const tx = JSON.parse(readFileSync(new URL(`../site/transcripts/${id}.json`, import.meta.url), 'utf8'));
const fmt = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
if (mode === 'at') {
  const [m, s] = arg.split(':').map(Number); const t0 = m * 60 + s; const w = Number(win);
  for (const seg of tx.segments) if (seg.t >= t0 - w && seg.t <= t0 + w) console.log(fmt(seg.t), seg.text);
} else if (mode === 'grep') {
  const q = arg.toLowerCase();
  tx.segments.forEach((seg, i) => {
    if (seg.text.toLowerCase().includes(q)) {
      const ctx = tx.segments.slice(Math.max(0, i - 1), i + 2).map(s => s.text).join(' ');
      console.log(fmt(seg.t), '…', ctx);
    }
  });
}
