#!/usr/bin/env node
// Price/quality table from OpenRouter's own benchmark aggregate
// (Artificial Analysis indices + OpenRouter evals), joined to live pricing.
//   OPENROUTER_API_KEY=… node scripts/benchmarks.mjs [family …]
//   OPENROUTER_API_KEY=… node scripts/benchmarks.mjs moonshotai z-ai deepseek
// The endpoint needs a key (cookie or bearer); the public catalogue does not.
const KEY = process.env.OPENROUTER_API_KEY || '';
if (!KEY) { console.error('benchmarks: set OPENROUTER_API_KEY'); process.exit(2); }
if (!/^sk-or-/.test(KEY)) { console.error(`benchmarks: OPENROUTER_API_KEY does not look like an OpenRouter key (starts "${KEY.slice(0, 6)}", expected "sk-or-"). OpenRouter answers a malformed key with "Missing Authentication header".`); process.exit(2); }
const families = process.argv.slice(2).length ? process.argv.slice(2) : ['moonshotai', 'z-ai', 'deepseek', 'qwen', 'openai/gpt-oss'];
const H = { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` };

const bench = await fetch('https://openrouter.ai/api/v1/benchmarks?source=artificial-analysis&max_results=500', { headers: H }).then(r => r.json());
const models = await fetch('https://openrouter.ai/api/v1/models').then(r => r.json());
if (!bench.data) { console.error('benchmarks:', JSON.stringify(bench).slice(0, 300)); process.exit(1); }

const price = new Map(models.data.map(m => [m.id, m.pricing]));
const ctx = new Map(models.data.map(m => [m.id, m.context_length]));
const rows = bench.data
  .filter(b => families.some(f => (b.model_permaslug || '').startsWith(f)))
  .map(b => {
    const id = b.model_permaslug; const p = price.get(id) || b.pricing || {};
    return { id, intel: b.intelligence_index, code: b.coding_index, agent: b.agentic_index, in: p.prompt ? +(p.prompt * 1e6).toFixed(2) : null, out: p.completion ? +(p.completion * 1e6).toFixed(2) : null, ctx: ctx.get(id) };
  })
  .filter(r => r.intel != null)
  .sort((a, b) => b.intel - a.intel);

console.log(`as of ${bench.meta?.as_of || '?'} — ${rows.length} models\n`);
console.log('model'.padEnd(36), 'intel', 'code', 'agent', '  $in', ' $out', '     ctx');
for (const r of rows) console.log(r.id.padEnd(36), String(r.intel).padStart(5), String(r.code ?? '-').padStart(4), String(r.agent ?? '-').padStart(5), String(r.in ?? '-').padStart(6), String(r.out ?? '-').padStart(5), String(r.ctx ?? '-').padStart(9));
console.log('\nintel/code/agent are Artificial Analysis indices as republished by OpenRouter; prices are $/M tokens, live.');
