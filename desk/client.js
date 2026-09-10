// One function that talks to OpenRouter, plus a mock that stands in for it
// when there is no key. The mock answers from the retrieved notes verbatim,
// so `npm run dev` and the tests exercise the whole pipeline offline.
import { SETTINGS } from './models.js';

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

export async function chat({ model, system, user, job, env, fetchImpl = fetch, signal }) {
  const settings = SETTINGS[job] || {};
  const body = {
    model,
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    temperature: settings.temperature ?? 0.3,
    max_tokens: settings.max_tokens ?? 700,
    response_format: { type: 'json_object' },
  };
  if (settings.reasoning) body.reasoning = settings.reasoning;
  const res = await fetchImpl(ENDPOINT, {
    method: 'POST',
    signal,
    headers: {
      'Authorization': `Bearer ${env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': env.TA_REFERER || 'https://ta.kb.local',
      'X-Title': 'TA',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`openrouter ${res.status} for ${model}: ${text.slice(0, 300)}`);
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') throw new Error(`openrouter: no content from ${model}`);
  return { content, usage: data.usage || null, model: data.model || model };
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
