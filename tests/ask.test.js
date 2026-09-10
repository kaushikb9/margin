// The pipeline end to end with the mock model, and once with a fake
// OpenRouter that returns garbage first and a valid reply second.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Brain, answer, check, deeper, widget } from '../desk/ask.js';

const load = p => JSON.parse(readFileSync(new URL(p, import.meta.url)));
const brain = new Brain([load('../site/brain/d1.json'), load('../site/brain/d2.json')]);
const transcripts = { '7xTGNNLPyMI': load('../site/transcripts/7xTGNNLPyMI.json'), 'kCc8FmEb1nY': load('../site/transcripts/kCc8FmEb1nY.json') };
const source = { id: '7xTGNNLPyMI', title: 'Deep Dive into LLMs like ChatGPT' };
const env = { TA_MOCK: '1' };

test('answer: KB\'s parameters doubt → knowledge-in-weights, with cites', async () => {
  const jot = { id: 'n1', text: '"a lot of the world knowledge is stored in the parameters of the network" - what? how?', tags: ['#doubt'], t: 5354 };
  const r = await answer({ brain, transcripts, jot, source, t: 5354, env });
  assert.ok(r.ok, r.error);
  assert.equal(r.value.concept, 'c-knowledge-in-weights');
  assert.ok(r.value.cites.length >= 1);
  assert.equal(r.retrieved[0].id, 'c-knowledge-in-weights');
});

test('check: the temperature note is flagged; a fine note is not', async () => {
  const bad = { id: 'n2', text: 'Temperature = how much tolerance we have with the probability. low temperature = higher accuracy', tags: ['#til'], t: 1620 };
  const r = await check({ brain, transcripts, jot: bad, source, t: 1620, env });
  assert.ok(r.ok); assert.equal(r.value.verdict, 'check'); assert.equal(r.value.concept, 'c-sampling-temperature');
  const fine = { id: 'n3', text: 'tokens are unique ids, symbols for a slice of text', tags: [], t: 913 };
  const r2 = await check({ brain, transcripts, jot: fine, source, t: 913, env });
  assert.ok(r2.ok); assert.equal(r2.value.verdict, 'ok');
});

test('deeper: uses the prerequisite subgraph and the transcript so far', async () => {
  const jot = { id: 'n4', text: 'how does it know the next question is one it doesnt know?', tags: ['#doubt'], t: 5400 };
  const r = await deeper({ brain, transcripts, jot, prior: { kind: 'answer', concept: 'c-refusal-learned-signal', body: 'x' }, source, t: 5400, env });
  assert.ok(r.ok, r.error); assert.equal(typeof r.value.changed, 'boolean');
});

test('widget: spec validates and its compute runs', async () => {
  const jot = { id: 'n2', text: 'low temperature = higher accuracy', tags: [], t: 1620 };
  const r = await widget({ brain, jot, reply: { concept: 'c-sampling-temperature', correction: 'x' }, env });
  assert.ok(r.ok, r.error);
  const fn = new Function('inputs', r.value.compute);
  const out = fn({ temp: 0.7 });
  assert.ok(Array.isArray(out.probs));
});

test('a model that returns junk once is retried, then a fallback is used', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const body = JSON.parse(init.body); calls.push(body.model);
    const content = calls.length < 3
      ? 'not json at all'
      : JSON.stringify({ concept: 'c-knowledge-in-weights', title: 'Knowledge in weights', body: 'Your keyboard has no list of your sentences in it. It has numbers that were nudged until its guesses got good. Nothing is stored and looked up; the weights make true continuations likely.', cites: [{ src: '7xTGNNLPyMI', t: 3088 }], widgetHint: null, enough: true });
    return new Response(JSON.stringify({ choices: [{ message: { content } }], model: body.model }), { status: 200 });
  };
  const jot = { id: 'n1', text: 'world knowledge stored in the parameters - what? how?', tags: ['#doubt'], t: 5354 };
  const r = await answer({ brain, transcripts, jot, source, t: 5354, env: { OPENROUTER_API_KEY: 'k', TA_MODEL_COMPOSER: 'a/one', TA_FALLBACK_COMPOSER: 'b/two' }, fetchImpl });
  assert.ok(r.ok, r.error);
  assert.deepEqual(calls, ['a/one', 'a/one', 'b/two']);
  assert.equal(r.attempts.length, 2);
});

test('a transport error moves to the next model without retrying', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => { const m = JSON.parse(init.body).model; calls.push(m); if (m === 'a/one') return new Response('down', { status: 503 }); return new Response(JSON.stringify({ choices: [{ message: { content: '{"verdict":"ok"}' } }] })); };
  const jot = { id: 'n3', text: 'tokens are ids', tags: [], t: 913 };
  const r = await check({ brain, transcripts, jot, source, t: 913, env: { OPENROUTER_API_KEY: 'k', TA_MODEL_CHECKER: 'a/one', TA_FALLBACK_CHECKER: 'b/two' }, fetchImpl });
  assert.ok(r.ok); assert.deepEqual(calls, ['a/one', 'b/two']);
});

test('a follow-up in the thread escalates to the deeper pass on its own', async () => {
  const jot = { id: 'n1', text: 'world knowledge stored in the parameters - what? how?', tags: ['#doubt'], t: 5354 };
  const thread = [{ kind: 'answer', body: 'first try' }, { kind: 'you', text: 'but why would a compression produce true sentences at all?' }];
  const r = await answer({ brain, transcripts, jot, source, t: 5354, thread, env });
  assert.ok(r.ok, r.error);
  assert.equal(r.escalated, true);
  assert.equal(typeof r.value.changed, 'boolean');
});
