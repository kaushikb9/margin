# Review brief — margin, 10 September 2026

For a reviewer coming in cold. `AGENTS.md` is the entry point for the code;
this file is the state of the design and what is about to be built.

## What margin is

A Firefox sidebar (Zen) that sits beside a YouTube lecture. KB writes in the
margin; the TA answers questions and silently checks statements against a
precomputed concept brain anchored to the real transcript. Replies land
collapsed under the note. Threads are conversations. A nightly job turns
each video's notes into one post on KB's private blog (the brain).

## Artifacts, newest first

Current — these two are the spec:

- **The storyboard, decided end to end** (10 Sep, v7): open a lecture, write,
  replies, stars, close the laptop, the brain updates itself, a new lecture;
  plus what the desk is. All threads resolved.
  https://claude.ai/code/artifact/7dfc594b-d984-4b72-bb40-0de0aa744707
- **The brain post as it will render** (10 Sep, v2): one post per video in the
  brain's own `post.css`, key concepts in KB's words, the margin thread,
  widget stills. https://claude.ai/code/artifact/e003b712-e1c7-40a1-be1a-c3c9203a0441

History — superseded in places, kept for the reasoning:

- Class notes rendered from a real (mock-model) session, 10 Sep — the first
  cut of the per-session page, before "one post per video" was decided.
  https://claude.ai/code/artifact/e62ec9f0-4469-4505-b306-e24637c931bf
- The class-notes milestone: three forms, model picks, storage (10 Sep).
  https://claude.ai/code/artifact/743db42c-459f-4871-92f6-896d503c8c87
- The original sidebar mockup, titled "TA" (9–10 Sep, v6): the interview's
  outcome; the break, tags and Poke it shows were cut later.
  https://claude.ai/code/artifact/0aaa12e2-4d34-48f3-b630-37c859c4e73c

Sources for all five are in `~/Code/learn/learn-app-*.html`. The design
history and the original brief: `~/Code/learn/learn-app-plan.md`,
`~/Code/learn/learn-app-requirements.md`.

## Shipped (0.1.6, deployed at margin-3d0.pages.dev)

- Brain: 36 notes for Milestones 1 and 2, every quote verified against the
  caption track within ±45s (`scripts/check-brain.mjs`).
- Desk: retrieval (BM25 + position prior), four prompts, strict validators,
  retry then cross-family fallback, per-call timeouts, mock model when
  keyless. Models chosen from OpenRouter's benchmark aggregate and then read
  side by side: GLM 5.3 Flash (composer/checker/widget), GLM 5.3 (deeper).
- Extension: comment-shaped queue; threads as conversations; the desk
  escalates itself (`enough: false`); ask-to-be-shown builds a widget as the
  reply; one anchor per reply; 👍 acks, footer counts what awaits KB.
- Cut on KB's instruction: break view, go-deeper-on-all, End session, tags,
  "Not convinced", "Poke at it", status labels, timestamp chips.

## In the working tree, uncommitted until KB's go (this commit is WIP)

- No checkbox: a question is answered, a statement is checked (`isQuestion`
  in panel.js). "?" forces an answer.
- ☆ stars on notes and replies; a star on a reply also acks it; synced to the
  desk like acks (`notes.js` stores `stars`).

## To build in one shot, on KB's go

1. Transcript on first note: the desk fetches it (InnerTube from the worker;
   page-side fallback via the content script if refused) and answers from
   the lecture window with "From the lecture only, no notes yet"; checks
   work against the transcript.
2. `npm run brain <videoId>`: merge all sessions on a video into one post in
   the brain's own `post.css` — key concepts in KB's words, the margin
   thread, widget stills computed at defaults in node, "Things to remember"
   = starred items (absent if none). Writes the index row, runs the brain's
   `npm test`. ~12 lines added to `post.css` (v2); a margin exception in the
   brain's check and `AGENTS.md`.
3. `com.kb.margin` launchd job, 22:00 nightly, in this repo: for each video
   with new notes since last run, render → commit to `~/Code/brain` →
   deploy. Silent when nothing changed. The brain runs nothing.
4. margin 0.2.0, zip for AMO, docs and memory.

## Things a reviewer might want to push on

- The checker's corrections are model-written and can be wrong in the same
  confident voice; prompts pin every number to the notes, and "Keep my
  version" is the human backstop. There is no mechanical catch for a wrong
  figure.
- `isQuestion` is a regex. A rhetorical question gets an answer (harmless);
  a statement KB wanted answered needs a "?".
- The widget `compute` runs `new Function` in a sandboxed iframe served from
  the desk with `connect-src 'none'`. The validator forbids I/O tokens first.
- One writer per KV key: the extension owns `note:*`, the desk owns
  `reply:*`; user state (acks, stars, overruled) lives on the note.
