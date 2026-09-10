// Retrieval over the brain: lexical scoring plus a position prior.
//
// The position prior is the cheap win that makes a small model enough. A
// doubt jotted at 89:00 of the Deep Dive is almost certainly about something
// Karpathy said near 89:00, so notes anchored near the jot rank first even
// when the words do not overlap ("what? how?" carries no lexical signal).

const STOP = new Set('a an the of to in on for is are was were be been it its this that these those and or but not no so if as at by from with what how why does do did can could would should will i you he she they we me my your our his her their them us am im is isnt dont doesnt just like kind sort really very also only then than there here where when which who whom whose about into over under again more most some such'.split(' '));

export const tokenize = s => (s || '')
  .toLowerCase()
  .replace(/[’']/g, '')
  .replace(/[^a-z0-9]+/g, ' ')
  .split(' ')
  .filter(w => w && !STOP.has(w))
  .map(w => w.length > 4 ? w.replace(/(ing|ed|es|s)$/, '') : w);

// Build an index once per brain load. Fields are weighted: a hit in the title
// or an alias is worth more than a hit deep in the explanation.
export function buildIndex(notes) {
  const docs = notes.map(n => {
    const fields = [
      [3, tokenize(n.title)],
      [3, tokenize((n.aliases || []).join(' '))],
      [2, tokenize(n.oneLiner)],
      [2, tokenize(n.wrongVersion?.claim)],
      [1, tokenize(n.explanation)],
    ];
    const tf = new Map();
    let len = 0;
    for (const [w, toks] of fields) for (const t of toks) { tf.set(t, (tf.get(t) || 0) + w); len += w; }
    return { id: n.id, tf, len, note: n };
  });
  const df = new Map();
  for (const d of docs) for (const t of d.tf.keys()) df.set(t, (df.get(t) || 0) + 1);
  const avgLen = docs.reduce((a, d) => a + d.len, 0) / Math.max(1, docs.length);
  return { docs, df, avgLen, N: docs.length };
}

// BM25 with the usual constants.
export function lexicalScore(index, query) {
  const q = tokenize(query);
  const k1 = 1.4, b = 0.6;
  const out = new Map();
  for (const d of index.docs) {
    let s = 0;
    for (const t of q) {
      const f = d.tf.get(t); if (!f) continue;
      const n = index.df.get(t) || 0;
      const idf = Math.log(1 + (index.N - n + 0.5) / (n + 0.5));
      s += idf * (f * (k1 + 1)) / (f + k1 * (1 - b + b * d.len / index.avgLen));
    }
    out.set(d.id, s);
  }
  return out;
}

// exp decay on distance from the nearest anchor in the same source. 8 minutes
// is the half-ish life: a chapter, roughly.
export function positionPrior(note, src, t, tau = 480) {
  if (!src || typeof t !== 'number') return 0;
  let best = Infinity;
  for (const a of note.anchors || []) if (a.src === src) best = Math.min(best, Math.abs(a.t - t));
  return best === Infinity ? 0 : Math.exp(-best / tau);
}

// Top-k notes for a jot. Returns [{note, score, lexical, prior}].
// Lexical is normalised to the best match and damped when even the best
// match is weak, so a jot like "what? how?" leans on position while a jot
// that names its concept is ranked by words. The prior then breaks ties and
// lifts neighbours; it must not outrank a strong lexical hit.
export function retrieve(index, { text, src, t, k = 3, wLex = 1.0, wPos = 0.6 }) {
  const lex = lexicalScore(index, text);
  const rawMax = Math.max(0, ...lex.values());
  const confidence = Math.min(1, rawMax / 3);         // BM25 ~3 = a couple of real term hits
  const scored = index.docs.map(d => {
    const lexical = rawMax > 0 ? (lex.get(d.id) || 0) / rawMax * confidence : 0;   // 0..1
    const prior = positionPrior(d.note, src, t);                                      // 0..1
    return { note: d.note, lexical, prior, score: wLex * lexical + wPos * prior };
  });
  scored.sort((a, b) => b.score - a.score);
  // Drop notes with no signal at all so a nonsense jot returns [] not noise.
  return scored.filter(s => s.score > 0.05).slice(0, k);
}

// Prerequisite closure, for the deeper pass. Breadth-first, bounded.
export function subgraph(notes, ids, maxNotes = 8) {
  const byId = new Map(notes.map(n => [n.id, n]));
  const seen = new Set(); const queue = [...ids];
  while (queue.length && seen.size < maxNotes) {
    const id = queue.shift(); if (seen.has(id) || !byId.has(id)) continue;
    seen.add(id);
    for (const p of byId.get(id).prereqs || []) queue.push(p);
  }
  return [...seen].map(id => byId.get(id));
}

// The transcript window around t: ±secs, as one string with mm:ss marks
// every ~30s so the model can cite.
export function transcriptWindow(transcript, t, secs = 90) {
  if (!transcript?.segments) return '';
  const segs = transcript.segments.filter(s => s.t >= t - secs && s.t <= t + secs);
  let out = '', lastMark = -1e9;
  for (const s of segs) {
    if (s.t - lastMark >= 30) { out += ` [${Math.floor(s.t / 60)}:${String(Math.floor(s.t % 60)).padStart(2, '0')}] `; lastMark = s.t; }
    out += s.text + ' ';
  }
  return out.trim();
}

// Everything said up to t, for the deeper pass. Capped by characters so a
// three-hour lecture does not blow the context.
export function transcriptUpTo(transcript, t, maxChars = 60000) {
  if (!transcript?.segments) return '';
  const parts = [];
  let lastMark = -1e9;
  for (const s of transcript.segments) {
    if (s.t > t) break;
    if (s.t - lastMark >= 60) { parts.push(`\n[${Math.floor(s.t / 60)}:${String(Math.floor(s.t % 60)).padStart(2, '0')}]`); lastMark = s.t; }
    parts.push(s.text);
  }
  let text = parts.join(' ');
  if (text.length > maxChars) text = '…' + text.slice(text.length - maxChars);
  return text.trim();
}
