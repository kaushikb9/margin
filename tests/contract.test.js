// The four seams. The prompt states the limits, the validator enforces them,
// the API stores the fields, the renderer shows them. This test fails when
// any of them drifts from desk/contract.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ANSWER_FIELDS, CHECK_FIELDS, DEEPER_EXTRA_FIELDS, WIDGET_FIELDS, REPLY_KINDS, LIMITS, WIDGET_INPUT_KINDS, WIDGET_OUTPUT_KINDS } from '../desk/contract.js';
import { composerPrompt, checkerPrompt, deeperPrompt, widgetPrompt } from '../desk/prompts.js';

const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');
const panel = read('../extension/sidebar/panel.js');
const runtime = read('../site/widget/runtime.html');
const askFn = read('../functions/api/ask.js');

const note = { id: 'c-x', title: 'X', oneLiner: 'o', explanation: 'e', wrongVersion: { claim: 'c', tell: 't' }, anchors: [{ src: 's', t: 1, quote: 'q' }], widgetHint: null };
const ctx = { jot: { text: 'j', tags: [] }, notes: [note], cluster: { name: 'k', thread: 'th' }, source: { id: 's', title: 'S' }, t: 0, window: 'w', prior: null, transcript: 'tr', reply: {}, note };

test('prompts name every field of their shape', () => {
  const c = composerPrompt(ctx).system;
  for (const f of ANSWER_FIELDS) assert.ok(c.includes(`"${f}"`), `composer prompt lacks ${f}`);
  const k = checkerPrompt(ctx).system;
  for (const f of CHECK_FIELDS) assert.ok(k.includes(`"${f}"`), `checker prompt lacks ${f}`);
  const d = deeperPrompt(ctx).system;
  for (const f of [...ANSWER_FIELDS, ...DEEPER_EXTRA_FIELDS]) assert.ok(d.includes(`"${f}"`), `deeper prompt lacks ${f}`);
  const w = widgetPrompt(ctx).system;
  for (const f of WIDGET_FIELDS) assert.ok(w.includes(`"${f}"`), `widget prompt lacks ${f}`);
  for (const kind of [...WIDGET_INPUT_KINDS, ...WIDGET_OUTPUT_KINDS]) assert.ok(w.includes(`"${kind}"`), `widget prompt lacks kind ${kind}`);
});

test('prompts state the same limits the validator enforces', () => {
  assert.ok(composerPrompt(ctx).system.includes(`${LIMITS.bodyWords} words`));
  assert.ok(checkerPrompt(ctx).system.includes(`${LIMITS.correctionWords} words`));
  assert.ok(widgetPrompt(ctx).system.includes(`${LIMITS.computeChars} characters`));
});

test('the renderer mentions every field it is expected to show', () => {
  const fields = new Set([...ANSWER_FIELDS, ...CHECK_FIELDS, ...DEEPER_EXTRA_FIELDS, ...WIDGET_FIELDS]);
  for (const f of fields) assert.ok(new RegExp(`\\b${f}\\b`).test(panel), `panel.js never reads ${f}`);
  for (const kind of REPLY_KINDS) assert.ok(panel.includes(`'${kind}'`), `panel.js has no branch for reply kind ${kind}`);
  assert.ok(/\btext\b/.test(panel), 'panel.js never reads a follow-up\'s text');
  for (const kind of [...WIDGET_INPUT_KINDS, ...WIDGET_OUTPUT_KINDS]) assert.ok(runtime.includes(`'${kind}'`), `runtime.html cannot render ${kind}`);
});

test('the API only stores known reply kinds', () => {
  assert.ok(askFn.includes('REPLY_KINDS'));
});
