// The pipeline behind /api/ask. Pure: takes a loaded brain and transcripts,
// returns a reply object. The Pages Function wraps it with KV and auth.
import { buildIndex, retrieve, subgraph, transcriptWindow, transcriptUpTo } from './retrieve.js';
import { composerPrompt, checkerPrompt, deeperPrompt, widgetPrompt } from './prompts.js';
import { validateAnswer, validateCheck, validateDeeper, validateWidget, extractJson } from './schema.js';
import { modelFor, fallbacksFor } from './models.js';
import { chat, isMock, mockChat } from './client.js';

export class Brain {
  constructor(docs) {
    this.docs = docs;                                   // [{milestone, cluster, notes}]
    this.notes = docs.flatMap(d => d.notes);
    this.byId = new Map(this.notes.map(n => [n.id, n]));
    this.clusterOf = new Map();
    for (const d of docs) for (const n of d.notes) this.clusterOf.set(n.id, d.cluster);
    this.index = buildIndex(this.notes);
    this.ids = new Set(this.byId.keys());
  }
}

const VALIDATORS = { answer: validateAnswer, check: validateCheck, deeper: validateDeeper, widget: validateWidget };
const JOB_OF = { answer: 'composer', check: 'checker', deeper: 'deeper', widget: 'widget' };

// Call the model for a job, validate, retry with fallbacks. Returns
// {ok, value|error, model, attempts:[{model, error}]}.
async function run({ kind, prompt, ctx, env, log, fetchImpl }) {
  const job = JOB_OF[kind];
  const validate = VALIDATORS[kind];
  const opts = { knownConcepts: ctx.knownConcepts, knownSources: ctx.knownSources };
  const attempts = [];
  if (isMock(env)) {
    const r = mockChat({ job, ctx });
    const v = validate(extractJson(r.content), opts);
    return v.ok ? { ok: true, value: v.value, model: 'mock', attempts } : { ok: false, error: v.error, model: 'mock', attempts };
  }
  const models = [modelFor(job, env), ...fallbacksFor(job, env)];
  for (const model of models) {
    for (let i = 0; i < 2; i++) {
      try {
        const r = await chat({ model, system: prompt.system, user: prompt.user, job, env, fetchImpl });
        const v = validate(extractJson(r.content), opts);
        if (v.ok) return { ok: true, value: v.value, model: r.model, usage: r.usage, attempts };
        attempts.push({ model, error: v.error, raw: r.content.slice(0, 200) });
        log?.(`ask ${kind}: ${model} invalid (${i + 1}/2): ${v.error} — raw: ${JSON.stringify(r.content.slice(0, 160))}${r.finish === 'length' ? ' [truncated at max_tokens]' : ''}`);
      } catch (e) {
        attempts.push({ model, error: String(e.message || e) });
        log?.(`ask ${kind}: ${model} failed (${i + 1}/2): ${e.message}`);
        break; // a transport error: move to the next model, do not retry the same one
      }
    }
  }
  return { ok: false, error: attempts.at(-1)?.error || 'no models configured', model: null, attempts };
}

// Shared context for a jot: retrieval + transcript window.
function context(brain, transcripts, { jot, source, t }) {
  const tx = transcripts[source.id];
  const hits = retrieve(brain.index, { text: jot.text, src: source.id, t, k: 3 });
  const notes = hits.map(h => h.note);
  const cluster = notes[0] ? brain.clusterOf.get(notes[0].id) : brain.docs[0].cluster;
  return {
    jot, source, t, notes, hits, cluster,
    window: transcriptWindow(tx, t),
    knownConcepts: new Set(notes.map(n => n.id)),
    knownSources: new Set(Object.keys(transcripts)),
  };
}

export async function answer({ brain, transcripts, jot, source, t, env, log, fetchImpl }) {
  const ctx = context(brain, transcripts, { jot, source, t });
  if (!ctx.notes.length) return { ok: false, error: 'nothing in the brain matches this note yet', retrieved: [] };
  const prompt = composerPrompt(ctx);
  const r = await run({ kind: 'answer', prompt, ctx, env, log, fetchImpl });
  return { ...r, retrieved: ctx.hits.map(h => ({ id: h.note.id, score: +h.score.toFixed(3), lexical: +h.lexical.toFixed(3), prior: +h.prior.toFixed(3) })) };
}

export async function check({ brain, transcripts, jot, source, t, env, log, fetchImpl }) {
  const ctx = context(brain, transcripts, { jot, source, t });
  if (!ctx.notes.length) return { ok: true, value: { verdict: 'ok' }, retrieved: [] };
  const prompt = checkerPrompt(ctx);
  const r = await run({ kind: 'check', prompt, ctx, env, log, fetchImpl });
  return { ...r, retrieved: ctx.hits.map(h => h.note.id) };
}

export async function deeper({ brain, transcripts, jot, prior, source, t, env, log, fetchImpl }) {
  const ctx = context(brain, transcripts, { jot, source, t });
  const seed = ctx.notes.map(n => n.id);
  if (prior?.concept && brain.byId.has(prior.concept)) seed.unshift(prior.concept);
  ctx.notes = subgraph(brain.notes, seed, 8);
  ctx.knownConcepts = new Set(ctx.notes.map(n => n.id));
  ctx.prior = prior;
  ctx.transcript = transcriptUpTo(transcripts[source.id], t);
  const prompt = deeperPrompt(ctx);
  return run({ kind: 'deeper', prompt, ctx, env, log, fetchImpl });
}

export async function widget({ brain, jot, reply, env, log, fetchImpl }) {
  const note = brain.byId.get(reply?.concept) || brain.notes[0];
  const cluster = brain.clusterOf.get(note.id);
  const ctx = { jot, reply, note, cluster, notes: [note] };
  const prompt = widgetPrompt(ctx);
  return run({ kind: 'widget', prompt, ctx, env, log, fetchImpl });
}
