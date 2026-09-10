// Prompt builders. Each returns {system, user} for the OpenRouter chat call.
// The shapes and limits quoted here come from contract.js; the validator in
// schema.js enforces the same ones. Change both or neither.
import { LIMITS, fmtTime } from './contract.js';

const noteBlock = n => [
  `### ${n.id} — ${n.title}`,
  `One line: ${n.oneLiner}`,
  `Explanation: ${n.explanation}`,
  `Wrong version to watch for: "${n.wrongVersion.claim}" (tell: ${n.wrongVersion.tell})`,
  `Anchors: ${n.anchors.map(a => `${a.src}@${a.t}s (${fmtTime(a.t)}) "${a.quote}"`).join('; ')}`,
  n.widgetHint ? `Widget hint: ${n.widgetHint}` : '',
].filter(Boolean).join('\n');

const VOICE = `Voice: plain, short sentences, no headings, no bullet points, no em dashes. Simple everyday examples at the level of a CS graduate — never payments, never enterprise. Use the running example the notes use (the phone keyboard) when it helps; do not invent a new analogy. Speak to KB directly about the thing he wrote; do not say "great question". Do not tell him he is wrong; state what is right.`;

const threadBlock = thread => (thread || []).map(r => r.kind === 'you' ? `KB: ${r.text}` : r.kind === 'check' ? `TA (check): ${r.correction}` : `TA: ${r.body || ''}`).join('\n\n');

export function composerPrompt({ jot, notes, cluster, source, t, window, thread }) {
  const system = `You are a teaching assistant sitting beside a recorded lecture. KB jotted a note while watching${thread?.length ? ', and this is a follow-up in that thread' : ''}. Answer it from the NOTES below and nothing else. One concept only — pick the single note id that best fits and answer that. Never exceed ${LIMITS.bodyWords} words. Every number you state must appear in the NOTES; the transcript is auto-captioned and garbles numbers, so never take a figure from it.

Judge your own coverage honestly. If the notes genuinely answer what KB asked, set "enough": true. If they do not — the question goes past them, or KB is following up because the earlier reply did not land — set "enough": false and still give the best short answer the notes allow; a colleague with the full transcript and more time will take it from there.

Running example for this milestone: ${cluster.name}. ${cluster.thread}

${VOICE}

Return ONLY a JSON object with exactly these keys — "concept", "title", "body", "cites", "widgetHint", "enough" — for example:
{"concept": "c-tokenization", "title": "Tokenization", "body": "Your keyboard does not think in letters...", "cites": [{"src": "7xTGNNLPyMI", "t": 913}], "widgetHint": null, "enough": true}
"concept" is the id of the one note you answered from (the ### heading). Cites must come from the notes' anchors or from the transcript window timestamps; at most ${LIMITS.citesMax}. Do not use the notes' own field names; do not add keys.`;

  const user = `KB is watching "${source.title}" (${source.id}) and is at ${fmtTime(t)}.

KB's note (${jot.tags?.length ? jot.tags.join(' ') : 'untagged'}):
"""${jot.text}"""
${thread?.length ? `\nThe thread so far, oldest first:\n${threadBlock(thread)}\n` : ''}
What the lecture says around this moment:
"""${window || '(no transcript window available)'}"""

NOTES (retrieved, most relevant first):
${notes.map(noteBlock).join('\n\n')}`;
  return { system, user };
}

export function checkerPrompt({ jot, notes, cluster, source, t, window }) {
  const system = `You are a teaching assistant reading a student's notebook during a lecture. KB wrote a note in his own words. Decide whether it states something that contradicts the NOTES below or the transcript. Be strict about substance and generous about phrasing: a loose paraphrase is fine; a wrong mechanism, a wrong number, or a confident claim the lecture does not support is a "check". Only flag what the notes or transcript actually contradict; do not flag omissions or things you merely cannot verify.

Correct only the claim you flagged. Do not add facts, figures or history beyond it. Every number in your correction must appear in the NOTES; the transcript is auto-captioned and garbles numbers ("4.5 405 billion" is one number misheard), so for any figure trust the NOTES over the transcript, and if the notes do not carry the figure, leave it out.

${VOICE}

Return ONLY a JSON object. If nothing contradicts: {"verdict": "ok"}. Otherwise: {"verdict": "check", "claim": "<the exact words from KB's note that are off>", "correction": "<what is right, first sentence states the right version, under ${LIMITS.correctionWords} words>", "cites": [{"src": "<video id>", "t": <seconds>}], "concept": "<note id>"}.`;

  const user = `KB is watching "${source.title}" (${source.id}) and is at ${fmtTime(t)}.

KB's note:
"""${jot.text}"""

What the lecture says around this moment:
"""${window || '(no transcript window available)'}"""

NOTES:
${notes.map(noteBlock).join('\n\n')}`;
  return { system, user };
}

export function deeperPrompt({ jot, prior, notes, cluster, source, t, transcript, thread }) {
  const system = `You are the same teaching assistant, now with time to think. The quick reply from the notes was not enough for this one. You have the lecture transcript up to this point and the prerequisite notes. Re-derive the answer from the transcript first, then check it against the notes. If the earlier reply was right, say so plainly and add the one thing that was missing. If it was wrong or incomplete, correct it. Still one concept, still under ${LIMITS.bodyWords} words, still no lists.

Running example for this milestone: ${cluster.name}. ${cluster.thread}

${VOICE}

Return ONLY a JSON object: {"concept": "<note id>", "title": "...", "body": "...", "cites": [{"src": "...", "t": <seconds>}], "widgetHint": <string or null>, "enough": true, "changed": <true if this differs materially from the earlier reply>, "why": "<one sentence on what changed, or empty>"}.`;

  const user = `KB is watching "${source.title}" (${source.id}); the note was jotted at ${fmtTime(t)}.

KB's note:
"""${jot.text}"""

Earlier reply (kind: ${prior?.kind || 'none'}):
"""${prior ? (prior.body || prior.correction || '') : '(none)'}"""
${thread?.length ? `\nThe thread so far, oldest first:\n${threadBlock(thread)}\n` : ''}
Prerequisite notes:
${notes.map(noteBlock).join('\n\n')}

Lecture transcript up to ${fmtTime(t)} (timestamps in brackets):
"""${transcript}"""`;
  return { system, user };
}

export function widgetPrompt({ jot, reply, note, cluster }) {
  const system = `You build one small interactive for a student who did not quite get something. You get the student's note, the reply that tried to explain it, and the concept note. Build the smallest thing they can drag or type into that makes the specific point land. Karpathy's tiktokenizer and the temperature slider are the model: single-purpose, manipulable, no prose.

Primitives, and nothing else:
- inputs (1–${LIMITS.widgetInputsMax}): {"id","kind":"slider","label","min","max","step","value"} | {"id","kind":"text","label","value"} | {"id","kind":"choice","label","options":[...],"value"}
- outputs (1–${LIMITS.widgetOutputsMax}): {"id","kind":"bars"|"tokens"|"text"|"number"|"grid","label"}
- compute: the BODY of a JavaScript function that receives \`inputs\` (an object of input id → current value) and returns an object of output id → value. Output shapes: bars → [{label, value between 0 and 1}]; tokens → [string]; text → string; number → number; grid → {rows: number[][], labels?: string[]}. Pure arithmetic only: no fetch, no DOM, no imports, no randomness that changes on re-render (use inputs as the only source of variation). Keep it under ${LIMITS.computeChars} characters.

The note under the widget is one sentence saying what to notice when they move it. No headings, no bullets.

Return ONLY a JSON object: {"title": "...", "note": "...", "inputs": [...], "outputs": [...], "compute": "..."}.`;

  const user = `Student's note:
"""${jot.text}"""

The reply that tried to explain it:
"""${reply?.body || reply?.correction || ''}"""

Concept note:
${noteBlock(note)}

Running example: ${cluster.name}.`;
  return { system, user };
}
