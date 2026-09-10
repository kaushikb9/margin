import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateAnswer, validateCheck, validateDeeper, validateWidget, validateWidgetOutputs, extractJson } from '../desk/schema.js';

const K = new Set(['c-tokenization']);
const S = new Set(['7xTGNNLPyMI']);
const good = { concept: 'c-tokenization', title: 'Tokenization', body: 'Your keyboard does not think in letters. It chops what you type into pieces from a fixed dictionary and gives each piece a seat number. That is all the model ever sees, which is why cost is counted in tokens.', cites: [{ src: '7xTGNNLPyMI', t: 913 }], widgetHint: null };

test('extractJson survives fences and prose', () => {
  assert.deepEqual(extractJson('Sure! ```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(extractJson('here you go {"a":{"b":"}"}} trailing'), { a: { b: '}' } });
  assert.equal(extractJson('no json'), null);
});

test('answer: valid passes and is trimmed', () => {
  const r = validateAnswer({ ...good, title: ' Tokenization ' }, { knownConcepts: K, knownSources: S });
  assert.ok(r.ok); assert.equal(r.value.title, 'Tokenization');
});
test('answer: rejects unknown concept, missing cite, lists, length', () => {
  assert.match(validateAnswer({ ...good, concept: 'c-nope' }, { knownConcepts: K }).error, /concept/);
  assert.match(validateAnswer({ ...good, cites: [] }, { knownConcepts: K }).error, /at least one anchor/);
  assert.match(validateAnswer({ ...good, body: good.body + '\n- a bullet' }, { knownConcepts: K }).error, /no headings or bullet/);
  assert.match(validateAnswer({ ...good, body: 'word '.repeat(200) }, { knownConcepts: K }).error, /limit 170/);
  assert.match(validateAnswer({ ...good, cites: [{ src: 'x', t: 1 }] }, { knownConcepts: K, knownSources: S }).error, /unknown source/);
});

test('check: ok needs nothing else; check needs the right-version-first rule', () => {
  assert.ok(validateCheck({ verdict: 'ok' }).ok);
  const base = { verdict: 'check', claim: 'low temperature = higher accuracy', correction: 'Low temperature makes the output repeatable, not more accurate. The ranking of candidates never changes, only how far down it samples.', cites: [{ src: '7xTGNNLPyMI', t: 1607 }], concept: 'c-tokenization' };
  assert.ok(validateCheck(base, { knownConcepts: K, knownSources: S }).ok);
  assert.match(validateCheck({ ...base, correction: 'This is wrong. ' + base.correction }, { knownConcepts: K }).error, /first sentence/);
  assert.match(validateCheck({ ...base, verdict: 'maybe' }).error, /verdict/);
});

test('deeper: answer fields plus changed/why', () => {
  assert.match(validateDeeper(good, { knownConcepts: K }).error, /deeper\.changed/);
  assert.ok(validateDeeper({ ...good, changed: false, why: '' }, { knownConcepts: K }).ok);
});

const widget = {
  title: 'Sampling', note: 'Move it.',
  inputs: [{ id: 'temp', kind: 'slider', label: 'Temperature', min: 0, max: 2, step: 0.05, value: 0.7 }],
  outputs: [{ id: 'probs', kind: 'bars', label: 'Next piece' }],
  compute: 'var e=[3,2,1].map(function(l){return Math.exp(l/Math.max(0.01,inputs.temp))});var s=e.reduce(function(a,b){return a+b});return {probs:e.map(function(x,i){return {label:"t"+i,value:x/s}})};',
};
test('widget: valid passes; forbidden tokens, bad kinds, id clashes fail', () => {
  assert.ok(validateWidget(widget).ok);
  assert.match(validateWidget({ ...widget, compute: 'return fetch("x")' }).error, /forbidden token "fetch"/);
  assert.match(validateWidget({ ...widget, compute: 'var x = 1;' }).error, /must return/);
  assert.match(validateWidget({ ...widget, outputs: [{ id: 'temp', kind: 'bars', label: 'x' }] }).error, /clashes/);
  assert.match(validateWidget({ ...widget, inputs: [{ id: 'a', kind: 'dial', label: 'x' }] }).error, /kind/);
});
test('widget outputs: compute result is checked per kind', () => {
  const fn = new Function('inputs', widget.compute);
  const out = fn({ temp: 0.7 });
  assert.ok(validateWidgetOutputs(widget, out).ok);
  assert.match(validateWidgetOutputs(widget, { probs: [{ label: 'a', value: 2 }] }).error, /0\.\.1/);
  assert.match(validateWidgetOutputs(widget, {}).error, /no value/);
});

test('normalise maps the aliases models drift to', async () => {
  const { normalise } = await import('../desk/schema.js');
  const r = validateAnswer(normalise({ id: 'c-tokenization', title: 'T', text: good.body, citations: [{ src: '7xTGNNLPyMI', t: 913 }], widgetHint: null }), { knownConcepts: K, knownSources: S });
  assert.ok(r.ok, r.error); assert.equal(r.value.concept, 'c-tokenization');
});
