// Validators for everything a model hands back. Each returns
// { ok: true, value } or { ok: false, error } where error names the field and
// the fix — the caller logs it and either retries once or posts an "error"
// reply so the note is never left silently unanswered.
import {
  ANSWER_FIELDS, CHECK_FIELDS, DEEPER_EXTRA_FIELDS, WIDGET_FIELDS,
  WIDGET_INPUT_KINDS, WIDGET_OUTPUT_KINDS, LIMITS, COMPUTE_FORBIDDEN,
} from './contract.js';

const words = s => (s || '').trim().split(/\s+/).filter(Boolean).length;
const bad = error => ({ ok: false, error });
const good = value => ({ ok: true, value });

// Models wrap JSON in prose or fences more often than not. Pull the first
// balanced object out rather than failing on decoration.
export function extractJson(text) {
  if (typeof text !== 'string') return null;
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const src = fence ? fence[1] : text;
  const start = src.indexOf('{');
  if (start < 0) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) { try { return JSON.parse(src.slice(start, i + 1)); } catch { return null; } } }
  }
  return null;
}

function checkCites(cites, knownSources) {
  if (!Array.isArray(cites)) return 'cites must be an array of {src, t}';
  if (cites.length > LIMITS.citesMax) return `cites: at most ${LIMITS.citesMax}`;
  for (const c of cites) {
    if (!c || typeof c.src !== 'string' || typeof c.t !== 'number') return 'cites: each needs string src and numeric t (seconds)';
    if (knownSources && !knownSources.has(c.src)) return `cites: unknown source ${c.src}`;
  }
  return null;
}

export function validateAnswer(obj, { knownConcepts, knownSources } = {}) {
  if (!obj || typeof obj !== 'object') return bad('answer: not an object');
  for (const f of ANSWER_FIELDS) if (!(f in obj)) return bad(`answer.${f}: missing`);
  if (typeof obj.concept !== 'string' || (knownConcepts && !knownConcepts.has(obj.concept))) return bad(`answer.concept: must be one of the retrieved note ids, got ${JSON.stringify(obj.concept)}`);
  if (typeof obj.title !== 'string' || !obj.title.trim()) return bad('answer.title: empty');
  if (typeof obj.body !== 'string' || words(obj.body) < 20) return bad('answer.body: too short');
  if (words(obj.body) > LIMITS.bodyWords) return bad(`answer.body: ${words(obj.body)} words, limit ${LIMITS.bodyWords} — one concept, not an article`);
  if (/^#|\n\s*[-*]\s|\n#{1,3}\s/.test(obj.body)) return bad('answer.body: no headings or bullet lists — prose only');
  const c = checkCites(obj.cites, knownSources); if (c) return bad('answer.' + c);
  if (obj.cites.length === 0) return bad('answer.cites: at least one anchor (every answer carries a timestamp)');
  if (obj.widgetHint !== null && typeof obj.widgetHint !== 'string') return bad('answer.widgetHint: string or null');
  return good({ concept: obj.concept, title: obj.title.trim(), body: obj.body.trim(), cites: obj.cites, widgetHint: obj.widgetHint });
}

export function validateCheck(obj, { knownConcepts, knownSources } = {}) {
  if (!obj || typeof obj !== 'object') return bad('check: not an object');
  if (obj.verdict !== 'ok' && obj.verdict !== 'check') return bad('check.verdict: must be "ok" or "check"');
  if (obj.verdict === 'ok') return good({ verdict: 'ok' });
  for (const f of CHECK_FIELDS) if (!(f in obj)) return bad(`check.${f}: missing`);
  if (typeof obj.claim !== 'string' || !obj.claim.trim()) return bad('check.claim: quote the claim being checked');
  if (typeof obj.correction !== 'string' || words(obj.correction) < 10) return bad('check.correction: too short');
  if (words(obj.correction) > LIMITS.correctionWords) return bad(`check.correction: ${words(obj.correction)} words, limit ${LIMITS.correctionWords}`);
  if (/\b(wrong|incorrect|mistake|error)\b/i.test(obj.correction.split(/[.!?]/)[0])) return bad('check.correction: first sentence must state the right version, not label the note wrong');
  const c = checkCites(obj.cites, knownSources); if (c) return bad('check.' + c);
  if (typeof obj.concept !== 'string' || (knownConcepts && !knownConcepts.has(obj.concept))) return bad('check.concept: must be a retrieved note id');
  return good({ verdict: 'check', claim: obj.claim.trim(), correction: obj.correction.trim(), cites: obj.cites, concept: obj.concept });
}

export function validateDeeper(obj, opts) {
  const a = validateAnswer(obj, opts); if (!a.ok) return bad(a.error.replace(/^answer/, 'deeper'));
  for (const f of DEEPER_EXTRA_FIELDS) if (!(f in obj)) return bad(`deeper.${f}: missing`);
  if (typeof obj.changed !== 'boolean') return bad('deeper.changed: boolean');
  if (typeof obj.why !== 'string') return bad('deeper.why: string (may be empty when changed is false)');
  return good({ ...a.value, changed: obj.changed, why: obj.why.trim() });
}

export function validateWidget(obj) {
  if (!obj || typeof obj !== 'object') return bad('widget: not an object');
  for (const f of WIDGET_FIELDS) if (!(f in obj)) return bad(`widget.${f}: missing`);
  if (typeof obj.title !== 'string' || !obj.title.trim()) return bad('widget.title: empty');
  if (typeof obj.note !== 'string') return bad('widget.note: string (one line under the widget)');
  if (!Array.isArray(obj.inputs) || obj.inputs.length < 1 || obj.inputs.length > LIMITS.widgetInputsMax) return bad(`widget.inputs: 1–${LIMITS.widgetInputsMax} inputs`);
  if (!Array.isArray(obj.outputs) || obj.outputs.length < 1 || obj.outputs.length > LIMITS.widgetOutputsMax) return bad(`widget.outputs: 1–${LIMITS.widgetOutputsMax} outputs`);
  const ids = new Set();
  for (const i of obj.inputs) {
    if (!i || typeof i.id !== 'string' || !/^[a-z][a-z0-9_]*$/.test(i.id)) return bad('widget.inputs[].id: lowercase identifier');
    if (ids.has(i.id)) return bad(`widget.inputs: duplicate id ${i.id}`); ids.add(i.id);
    if (!WIDGET_INPUT_KINDS.includes(i.kind)) return bad(`widget.inputs[${i.id}].kind: one of ${WIDGET_INPUT_KINDS.join('|')}`);
    if (typeof i.label !== 'string') return bad(`widget.inputs[${i.id}].label: string`);
    if (i.kind === 'slider') for (const k of ['min', 'max', 'step', 'value']) if (typeof i[k] !== 'number') return bad(`widget.inputs[${i.id}].${k}: number`);
    if (i.kind === 'text' && typeof i.value !== 'string') return bad(`widget.inputs[${i.id}].value: string`);
    if (i.kind === 'choice' && (!Array.isArray(i.options) || i.options.length < 2 || !i.options.includes(i.value))) return bad(`widget.inputs[${i.id}]: options[] with value among them`);
  }
  for (const o of obj.outputs) {
    if (!o || typeof o.id !== 'string' || !/^[a-z][a-z0-9_]*$/.test(o.id)) return bad('widget.outputs[].id: lowercase identifier');
    if (ids.has(o.id)) return bad(`widget.outputs: id ${o.id} clashes with an input`); ids.add(o.id);
    if (!WIDGET_OUTPUT_KINDS.includes(o.kind)) return bad(`widget.outputs[${o.id}].kind: one of ${WIDGET_OUTPUT_KINDS.join('|')}`);
    if (typeof o.label !== 'string') return bad(`widget.outputs[${o.id}].label: string`);
  }
  if (typeof obj.compute !== 'string' || obj.compute.length > LIMITS.computeChars) return bad(`widget.compute: JS function body under ${LIMITS.computeChars} chars`);
  const m = obj.compute.match(COMPUTE_FORBIDDEN); if (m) return bad(`widget.compute: forbidden token "${m[1]}" — pure arithmetic only, no I/O`);
  if (!/\breturn\b/.test(obj.compute)) return bad('widget.compute: must return an object keyed by output id');
  return good({ title: obj.title.trim(), note: obj.note.trim(), inputs: obj.inputs, outputs: obj.outputs, compute: obj.compute });
}

// Output values the sandbox will accept, per kind. Used by the runtime and by
// tests that execute a widget's compute in node.
export function validateWidgetOutputs(spec, result) {
  if (!result || typeof result !== 'object') return bad('compute returned a non-object');
  for (const o of spec.outputs) {
    const v = result[o.id];
    if (v === undefined) return bad(`compute: no value for output ${o.id}`);
    switch (o.kind) {
      case 'bars': if (!Array.isArray(v) || !v.every(x => x && typeof x.label === 'string' && typeof x.value === 'number' && x.value >= 0 && x.value <= 1)) return bad(`${o.id}: bars must be [{label, value 0..1}]`); break;
      case 'tokens': if (!Array.isArray(v) || !v.every(x => typeof x === 'string')) return bad(`${o.id}: tokens must be [string]`); break;
      case 'text': if (typeof v !== 'string') return bad(`${o.id}: text must be a string`); break;
      case 'number': if (typeof v !== 'number' || !Number.isFinite(v)) return bad(`${o.id}: number must be finite`); break;
      case 'grid': if (!v || !Array.isArray(v.rows) || !v.rows.every(r => Array.isArray(r) && r.every(Number.isFinite))) return bad(`${o.id}: grid must be {rows: number[][], labels?: string[]}`); break;
    }
  }
  return good(result);
}
