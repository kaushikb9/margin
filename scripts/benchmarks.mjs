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

// Benchmark rows carry dated permaslugs (z-ai/glm-5.3-20260816); the
// catalogue's callable ids are undated (z-ai/glm-5.3). Strip the date to join.
const undated = id => id.replace(/-\d{8}$/, '');
const byId = new Map(models.data.map(m => [m.id, m]));
const rows = bench.data
  .filter(b => families.some(f => (b.model_permaslug || '').startsWith(f)))
  .map(b => {
    const id = b.model_permaslug; const m = byId.get(id) || byId.get(undated(id)); const p = m?.pricing || b.pricing || {};
    return { id, callable: m ? m.id : null, intel: b.intelligence_index, code: b.coding_index, agent: b.agentic_index, in: p.prompt ? +(p.prompt * 1e6).toFixed(2) : null, out: p.completion ? +(p.completion * 1e6).toFixed(2) : null, ctx: m?.context_length };
  })
  .filter(r => r.intel != null)
  .sort((a, b) => b.intel - a.intel);

console.log(`as of ${bench.meta?.as_of || '?'} — ${rows.length} models\n`);
console.log('benchmark slug'.padEnd(36), 'intel', 'code', 'agent', '  $in', ' $out', '     ctx', ' callable id');
for (const r of rows) console.log(r.id.padEnd(36), String(r.intel).padStart(5), String(r.code ?? '-').padStart(4), String(r.agent ?? '-').padStart(5), String(r.in ?? '-').padStart(6), String(r.out ?? '-').padStart(5), String(r.ctx ?? '-').padStart(9), ' ' + (r.callable || '(not in catalogue)'));
console.log('\nintel/code/agent are Artificial Analysis indices as republished by OpenRouter; $/M and ctx are from the live catalogue where the slug joins, else the benchmark snapshot. Use the callable id in desk/models.js.');
