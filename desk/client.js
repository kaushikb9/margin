// One function that talks to OpenRouter, plus a mock that stands in for it
// when there is no key. The mock answers from the retrieved notes verbatim,
// so `npm run dev` and the tests exercise the whole pipeline offline.
import { SETTINGS } from './models.js';

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

// A stalled provider must not stall the panel: every call has a deadline.
const TIMEOUT_MS = { composer: 45000, checker: 45000, widget: 60000, deeper: 120000 };

export async function chat({ model, system, user, job, env, fetchImpl = fetch, signal }) {
  const settings = SETTINGS[job] || {};
  signal = signal || (typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(TIMEOUT_MS[job] || 45000) : undefined);
  const body = {
    model,
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    temperature: settings.temperature ?? 0.3,
    max_tokens: settings.max_tokens ?? 700,
    response_format: { type: 'json_object' },
  };
  if (settings.reasoning) body.reasoning = settings.reasoning;
  let res;
  try { res = await post(body); } catch (e) { throw new Error(`openrouter: ${model} ${e.name === 'TimeoutError' || e.name === 'AbortError' ? `timed out after ${TIMEOUT_MS[job] || 45000}ms` : e.message}`); }
  // A provider that refuses the reasoning setting gets the same request
  // without it, once. The cap already leaves room for whatever it thinks.
  if (res.status === 400 && body.reasoning) {
    const text = await res.clone().text().catch(() => '');
    if (/reasoning/i.test(text)) { delete body.reasoning; res = await post(body); }
  }
  async function post(b) { return fetchImpl(ENDPOINT, {
    method: 'POST',
    signal,
    headers: {
      'Authorization': `Bearer ${env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': env.TA_REFERER || 'https://ta.kb.local',
      'X-Title': 'TA',
    },
    body: JSON.stringify(b),
  }); }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`openrouter ${res.status} for ${model}: ${text.slice(0, 300)}`);
  }
  const data = await res.json();
  const msg = data?.choices?.[0]?.message || {};
  // Some providers return content as an array of parts.
  let content = Array.isArray(msg.content) ? msg.content.map(p => p?.text || '').join('') : msg.content;
  const finish = data?.choices?.[0]?.finish_reason;
  if (typeof content !== 'string' || !content.trim()) {
    const why = finish === 'length' ? 'hit max_tokens (reasoning counts against it — raise the cap or disable reasoning for this job)' : `finish_reason=${finish}`;
    throw new Error(`openrouter: empty content from ${model}: ${why}${msg.reasoning ? '; reasoning was returned instead' : ''}`);
  }
  return { content, usage: data.usage || null, model: data.model || model, finish };
}

export function isMock(env) {
  return env.TA_MOCK === '1' || !env.OPENROUTER_API_KEY;
}

// Deterministic stand-ins. They are shaped exactly like real replies so the
// validator, the renderer and the tests see the real contract.
export function mockChat({ job, ctx }) {
  const top = ctx.notes?.[0];
  switch (job) {
    case 'composer': return { content: JSON.stringify({
      concept: top.id, title: top.title, body: top.explanation.split(/(?<=\.)\s/).slice(0, 4).join(' '),
      cites: top.anchors.slice(0, 2).map(a => ({ src: a.src, t: a.t })), widgetHint: top.widgetHint,
      enough: !(ctx.thread?.length) && !/why|really|still/i.test(ctx.jot.text),   // follow-ups and "but why" escalate in the mock
    }), usage: null, model: 'mock' };
    case 'checker': {
      const claim = ctx.jot.text.toLowerCase();
      const hit = ctx.notes.find(n => {
        const k = n.wrongVersion.claim.toLowerCase().replace(/[^a-z0-9 ]/g, '');
        const words = k.split(' ').filter(w => w.length > 3);
        return words.length && words.filter(w => claim.includes(w)).length >= Math.ceil(words.length * 0.6);
      });
      if (!hit) return { content: JSON.stringify({ verdict: 'ok' }), usage: null, model: 'mock' };
      return { content: JSON.stringify({
        verdict: 'check', claim: ctx.jot.text.slice(0, 120), correction: hit.oneLiner,
        cites: hit.anchors.slice(0, 1).map(a => ({ src: a.src, t: a.t })), concept: hit.id,
      }), usage: null, model: 'mock' };
    }
    case 'deeper': return { content: JSON.stringify({
      concept: top.id, title: top.title, body: top.explanation.split(/(?<=\.)\s/).slice(0, 5).join(' '),
      cites: top.anchors.slice(0, 2).map(a => ({ src: a.src, t: a.t })), widgetHint: top.widgetHint,
      changed: false, why: '',
    }), usage: null, model: 'mock' };
    case 'widget': return { content: JSON.stringify({
      title: 'Sampling', note: 'Move it: the order never changes, only how far down the list the coin reaches.',
      inputs: [{ id: 'temp', kind: 'slider', label: 'Temperature', min: 0, max: 2, step: 0.05, value: 0.7 }],
      outputs: [{ id: 'probs', kind: 'bars', label: 'Next piece' }, { id: 'top', kind: 'text', label: 'Most likely' }],
      compute: "var c=[['minutes',3.2],['mins',2.4],['minute',1.9],['seconds',1.1],['hours',0.6],['days',0.1]];var T=Math.max(0.01,inputs.temp);var m=Math.max.apply(null,c.map(function(x){return x[1]}));var e=c.map(function(x){return Math.exp((x[1]-m)/T)});var s=e.reduce(function(a,b){return a+b},0);return {probs:c.map(function(x,i){return {label:x[0],value:e[i]/s}}),top:c[0][0]};",
    }), usage: null, model: 'mock' };
  }
  throw new Error(`mock: unknown job ${job}`);
}
