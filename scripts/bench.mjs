#!/usr/bin/env node
// Run KB's real Milestone 1 doubts through candidate models and print what
// each one produced, so the model choice in desk/models.js is made on
// evidence rather than on a catalogue. Needs OPENROUTER_API_KEY.
//
//   OPENROUTER_API_KEY=... node scripts/bench.mjs                       # defaults
//   OPENROUTER_API_KEY=... node scripts/bench.mjs composer a/one b/two  # a job and candidates
//
// Prints, per model: validity rate, median latency, tokens, and the replies
// themselves for reading. Writes bench/<job>-<date>.json for later comparison.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Brain, answer, check } from '../desk/ask.js';
import { DEFAULTS, FALLBACKS } from '../desk/models.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const load = p => JSON.parse(readFileSync(join(root, p), 'utf8'));
if (!process.env.OPENROUTER_API_KEY) { console.error('bench: set OPENROUTER_API_KEY'); process.exit(2); }

const [job = 'composer', ...cands] = process.argv.slice(2);
const models = cands.length ? cands : [DEFAULTS[job], ...(FALLBACKS[job] || [])];
const run = job === 'checker' ? check : answer;

const brain = new Brain([load('site/brain/d1.json'), load('site/brain/d2.json')]);
const transcripts = { '7xTGNNLPyMI': load('site/transcripts/7xTGNNLPyMI.json'), 'kCc8FmEb1nY': load('site/transcripts/kCc8FmEb1nY.json') };
const source = { id: '7xTGNNLPyMI', title: 'Deep Dive into LLMs like ChatGPT' };

// Verbatim from progress/d1 in the tracker, with the timestamps they were made at.
const DOUBTS = [
  { text: '"a lot of the world knowledge is stored in the parameters of the network" - what? how?', t: 5354, tags: ['#doubt'] },
  { text: 'its just the parameters? where are the tokens? it needs to be somewhere as part of the release right so that whenever a new word comes in, it knows what is the relevant token for that?', t: 2700, tags: ['#doubt'] },
  { text: 'is there something called as training or everything is pre-training?', t: 3600, tags: ['#doubt'] },
  { text: 'in context learning ability? how? is this similar to the good/bad examples we give in the system prompt?', t: 3420, tags: ['#doubt'] },
  { text: 'we are just creating datasets to tell it when to say no. so how does it know that the next question it doesnt know the answer to is actually not in its training set? is it just a function similar to spaced repitition of types?', t: 5400, tags: ['#doubt'] },
  { text: 'how do you tell the models to use these tools? again do via training sets', t: 5640, tags: ['#doubt'] },
];
const NOTES = [
  { text: 'Temperature = how much tolerance we have with the probability. low temperature = higher accuracy', t: 1620, tags: ['#til'], expect: 'check' },
  { text: 'Llama 3 (2024) is 405 billion parameters trained on 15 million tokens', t: 2800, tags: [], expect: 'check' },
  { text: 'tokens look like numbers but they are essentially unique ids, symbols for that text', t: 913, tags: [], expect: 'ok' },
  { text: 'knowledge in parameters = vague memory; knowledge in tokens of context window = working memory', t: 5990, tags: [], expect: 'ok' },
];

const cases = job === 'checker' ? NOTES : DOUBTS;
const results = {};
for (const model of models) {
  const env = { OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY, [`TA_MODEL_${job.toUpperCase()}`]: model, [`TA_FALLBACK_${job.toUpperCase()}`]: ' ' };
  const rows = [];
  console.log(`\n=== ${model}`);
  for (const c of cases) {
    const jot = { id: 'b' + Math.random().toString(36).slice(2, 8), text: c.text, tags: c.tags, t: c.t };
    const t0 = Date.now();
    const r = await run({ brain, transcripts, jot, source, t: c.t, env, log: l => console.log('   ', l) });
    const ms = Date.now() - t0;
    const ok = r.ok && (job !== 'checker' || r.value.verdict === c.expect);
    rows.push({ text: c.text, ms, ok, valid: r.ok, model: r.model, usage: r.usage, value: r.value, error: r.error });
    console.log(`\n— ${c.text.slice(0, 80)}${c.text.length > 80 ? '…' : ''}  [${ms}ms, ${ok ? 'ok' : 'MISS'}]`);
    if (r.ok) {
      if (job === 'checker') console.log(`   verdict=${r.value.verdict}${r.value.verdict === 'check' ? ` · ${r.value.correction}` : ''}`);
      else console.log(`   ${r.value.concept} · ${r.value.title}\n   ${r.value.body}\n   cites: ${r.value.cites.map(x => x.t).join(', ')}`);
    } else console.log(`   invalid: ${r.error}`);
  }
  const lat = rows.map(r => r.ms).sort((a, b) => a - b);
  results[model] = { valid: rows.filter(r => r.valid).length, ok: rows.filter(r => r.ok).length, n: rows.length, medianMs: lat[Math.floor(lat.length / 2)], rows };
}
console.log('\n=== summary');
for (const [m, r] of Object.entries(results)) console.log(`${m.padEnd(40)} valid ${r.valid}/${r.n}  ${job === 'checker' ? 'right' : 'ok'} ${r.ok}/${r.n}  median ${r.medianMs}ms`);
mkdirSync(join(root, 'bench'), { recursive: true });
const out = join(root, 'bench', `${job}-${new Date().toISOString().slice(0, 10)}.json`);
writeFileSync(out, JSON.stringify(results, null, 1));
console.log(`wrote ${out}`);
