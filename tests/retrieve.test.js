import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildIndex, retrieve, subgraph, transcriptWindow, transcriptUpTo, tokenize } from '../desk/retrieve.js';

const d1 = JSON.parse(readFileSync(new URL('../site/brain/d1.json', import.meta.url)));
const d2 = JSON.parse(readFileSync(new URL('../site/brain/d2.json', import.meta.url)));
const notes = [...d1.notes, ...d2.notes];
const index = buildIndex(notes);
const tx = JSON.parse(readFileSync(new URL('../site/transcripts/7xTGNNLPyMI.json', import.meta.url)));

// KB's real doubts from progress/d1, with the timestamps they were jotted at.
const REAL = [
  { text: '"a lot of the world knowledge is stored in the parameters of the network" - what? how?', t: 5354, want: 'c-knowledge-in-weights' },
  { text: 'its just the parameters? where are the tokens?', t: 2700, want: 'c-model-release' },
  { text: 'What does releasing a model mean? is this the inference?', t: 2660, want: 'c-model-release' },
  { text: 'is there something called as training or everything is pre-training?', t: 3600, want: 'c-pretraining-vs-posttraining' },
  { text: 'Token vs Vector (Embedding = a vector with a meaning/representation)', t: 900, want: 'c-embedding' },
  { text: 'low temperature = higher accuracy', t: 1620, want: 'c-sampling-temperature' },
  { text: 'Llama 3 (2024) is 405 billion parameters trained on 15 million tokens', t: 2800, want: 'c-base-model' },
  { text: 'we are just creating datasets to tell it when to say no. so how does it know that the next question it doesnt know the answer to is actually not in its training set?', t: 5400, want: 'c-refusal-learned-signal' },
  { text: 'in context learning ability? how? is this similar to the good/bad examples we give in the system prompt?', t: 3420, want: 'c-in-context-learning' },
  { text: 'how do you tell the models to use these tools? again do via training sets', t: 5640, want: 'c-tool-use' },
];

test('tokenize drops stopwords and light-stems', () => {
  assert.deepEqual(tokenize('The parameters are stored in the network'), ['parameter', 'stor', 'network']);
});

for (const r of REAL) {
  test(`retrieves ${r.want} for: ${r.text.slice(0, 50)}…`, () => {
    const hits = retrieve(index, { text: r.text, src: '7xTGNNLPyMI', t: r.t, k: 3 });
    const ids = hits.map(h => h.note.id);
    assert.ok(ids.includes(r.want), `expected ${r.want} in top 3, got ${ids.join(', ')}`);
  });
}

test('the position prior lifts a nearby note when the words carry nothing', () => {
  const hits = retrieve(index, { text: 'what? how?', src: '7xTGNNLPyMI', t: 5354, k: 3 });
  assert.ok(hits.length > 0);
  assert.ok(hits.every(h => h.prior > 0), 'all hits should be anchored near 89 min');
});

test('a nonsense jot with no position returns nothing rather than noise', () => {
  assert.deepEqual(retrieve(index, { text: 'zzz qqq', src: null, t: null }), []);
});

test('subgraph follows prereqs and is bounded', () => {
  const g = subgraph(notes, ['c-kv-stability'], 5).map(n => n.id);
  assert.ok(g.includes('c-kv-stability'));
  assert.ok(g.includes('c-self-attention'));
  assert.ok(g.length <= 5);
});

test('transcript window carries timestamps and stays local', () => {
  const w = transcriptWindow(tx, 5354, 60);
  assert.match(w, /\[8[89]:\d\d\]/);
  assert.ok(w.length < 3000);
  assert.ok(/judge|Buffalo|knows/i.test(w));
});

test('transcript up to t is capped and ends at t', () => {
  const s = transcriptUpTo(tx, 5400, 20000);
  assert.ok(s.length <= 20001);
  assert.ok(!/\[9[1-9]:/.test(s), 'nothing after 90 min');
});
