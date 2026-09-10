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

Sources for all five, the plan and the original brief: `docs/history/`.

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

---

# Review findings — 10 September 2026, evening

Cold read of the code, tests, live desk and docs, held to
`~/Code/brain/design-system/INVARIANTS.md`, with the brief above as the
spec. Fixes marked **done** are in the working tree, uncommitted.
`./check.sh` is green (brain contract + 41) and margin is now in
`~/Code/check-all.sh`; seven repos green.

## 1. The verb and the docs — done

- No `check.sh`, and `npm run deploy` shipped without running anything.
  Now `./check.sh` wraps the brain contract and the tests, `npm test` and
  `npm run deploy` both go through it, and deploy refuses on red.
- `package.json` said 0.1.0 while the manifest said 0.1.6. Now 0.1.6.
- `AGENTS.md` still described the **Ask the TA** checkbox, **Poke at it** on
  press, and **End session** copying a digest to the clipboard. All three
  were cut in 0.1.4 to 0.1.6 and the WIP. Rewritten to what the code does:
  `isQuestion` decides, "show me" in a follow-up builds a widget, stars mark
  what to remember, and there is no coupling to the tracker at all.
- "The brain" means the concept notes here and the blog everywhere else.
  A short section in `AGENTS.md` names the collision so the post writer says
  "the blog" in code and docs.

## 2. Production is a commit this checkout does not have — your call

`wrangler pages deployment list` shows production at `86ddc6e` ("desk: no
front page…"), four hours old. That sha is not in this repo's history, on
any branch, or in the stash. Either it was deployed from another checkout
or the history was rewritten after the deploy. The live desk is healthy
(36 notes, GLM 5.3 Flash, KV on), so nothing is broken, but the next
`npm run deploy` from here replaces a build nobody can diff against. Worth
a `git fetch` and a look before the next deploy.

## 3. The brain seam, before it is built

The build list above (item 2 and 3) writes into `~/Code/brain`. Read against
that repo's contract, four of its promises collide with the brain's rules,
and one is a security hole. Decide these before `npm run brain` exists;
each is a one-line decision now and a re-render later.

- **Filenames.** The mockup says "no dated filename, because the file is
  not a moment". The brain's test requires `YYYY-MM-DD-slug.html` and sorts
  the index newest-first by that date. Keep the brain's rule: date the file
  to the first session on the resource and never rename it; the index row's
  day shows when it was last added to. No test change.
- **The keep block.** The mockup says the keep is the `#key` note and the
  post fails without one; the brief says "Things to remember = starred
  items (absent if none)". Tags are gone, so it is stars. And "absent if
  none" fails the brain's exactly-one-keep rule. Keep the brain's rule: no
  star, no post yet. A resource with nothing to remember is not finished,
  which is the blog's own definition. Do not add a margin exception to the
  brain's check.
- **Who deploys.** The brain's first rule is "nothing is posted or deployed
  unless KB asks". A 22:00 launchd job that commits to `~/Code/brain` and
  deploys is the first automated writer the blog has had. It needs an
  explicit, written exception in the brain's `AGENTS.md`: margin is the one
  job allowed to commit, it may touch only `site/posts/<resource>.html` and
  that post's index row, and it ships through the brain's own
  `npm run deploy` so the brain's check gates it. Never call wrangler on the
  brain from margin.
- **The index is hand-edited HTML.** A script inserting a row needs a stable
  marker to insert at and a rule for a new month. Add one comment marker
  per month section and let the writer create a month when missing; the
  brain's test already checks the result.
- **Widget stills run model-written code on your laptop.** The desk frames
  `compute` in a sandbox with no origin and no network precisely because a
  model wrote it. Rendering a still "computed at the defaults in node" runs
  that same code with full node privileges under your user, nightly,
  unattended. Run it in a fresh `node:vm` context with no globals and a
  timeout, after the same forbidden-token check the validator applies, or
  drop stills and link to the live widget. Do not `new Function` it in the
  job's own process.
- **Sessions must come from production.** The one committed session file
  says `from: http://localhost:8789`. The post writer must read exports from
  the live desk, and the export should refuse a localhost source unless
  asked.
- **`post.css` v2 is a human commit.** The twelve lines and the `?v=2` bump
  across every page land once, by hand, before the job runs. The job never
  bumps versions.

## 4. Smaller things, not changed

- `COMPUTE_FORBIDDEN` misses `globalThis`, `self`, `top`, `constructor`.
  The sandbox is the real boundary, so this is depth, not a hole. Add them
  when the token list is next touched.
- `DELETE /api/notes` lists only the first page of replies; threads are
  short so it never bites. `listPrefix` already paginates; use it.
- The panel and the notes renderer each carry a copy of the widget renderer
  (bars, tokens, grid). A third copy is about to be written for stills.
  Three copies of one renderer is the drift the four-seams rule exists for.

## What holds up well

The four-seams test that greps the renderer is exactly the mechanical check
the invariants ask for. The brain contract refusing an unverifiable quote is
the best guard in the estate against confident wrong numbers. Every model
failure becomes a stored error reply, so a note is never silently
unanswered. The "Learned the hard way" section is the most useful one on
this machine.
