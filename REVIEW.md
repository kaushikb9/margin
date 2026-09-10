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

## Built 2026-09-11 (0.2.0), per KB's go after the review

- No checkbox: a question is answered, a statement is checked (`isQuestion`
  in panel.js). "?" forces an answer.
- ☆ stars on notes and replies; a star on a reply also acks it; synced to the
  desk like acks (`notes.js` stores `stars`).

## What the review changed in the build list, and what was built

- Acks stay as reactions; the "N awaiting you" footer count is gone (it was a queue).
- Widgets frozen; no stills in the post (a marker line instead).
- `npm run brain` by hand, not nightly; dated filename, one-keep rule strict,
  index markers, live desk only, CSS bump done once by hand (post.css v2).
- The "production commit not in history" finding was wrong: 86ddc6e is in main.

## Original one-shot list (for the record)

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

## Is it useful? A functional audit

Evidence: built in one day. The 36-note concept brain is hand-written,
every quote verified, and the sample explanations are genuinely good. The
only session on disk is four notes against the mock model on localhost,
two of them the same doubt typed twice. Production usage cannot be read
from here (the dev token is rightly rejected), but nothing exported from
it exists, so treat real lecture use as zero so far.

| Piece | Verdict | Why |
|---|---|---|
| The concept brain (`site/brain`, quotes verified within ±45s) | **Keep** | The asset. It is what makes answers cited and numbers trustworthy. Worth more than the rest combined. |
| Jot in the margin, no interruption, local-first | **Keep** | The premise. Cheap and right. |
| The silent check ("temperature = accuracy" corrected, in gold, one line) | **Keep** | The one genuinely new thing here. A wrong note fixed while the lecture is still playing is the whole pitch. |
| Answer from the notes for a question | **Keep** | Obvious value, small cost. |
| The deeper pass with the full transcript, self-escalation on `enough:false` | **Keep, watch** | Sound design, but every mock reply in the session file escalated. Check the real rate after a week; if most answers escalate, the composer is not earning its call. |
| Widgets: a fourth prompt, a sandboxed runtime, three renderers, forbidden-token validator | **Overkill for now** | The most code for the least-proven feature: one example widget (temperature slider) exists, and it is the mock's. Nothing in your doubts asked for one. Freeze it: keep what exists, build no stills, add no renderers, until a real session asks "show me" more than once. |
| Follow-up threads | **Keep** | Conversations are how doubts actually resolve. |
| 👍 acks and the "N awaiting you" footer count | **Cut** | This is the counter your own rules ban in the tracker: it turns replies into a queue you owe. A reply you read is read. |
| ☆ stars | **Keep** | One gesture, one meaning: "remember this". It also feeds the post's keep block. |
| Cross-family fallbacks, per-job timeouts, retry with feedback | **Keep** | Cheap insurance; the failure paths are the ones that run at 11pm. |
| `bench`, `benchmarks` scripts | **Fine, done** | They chose the models. Not to be re-run without a reason. |
| Transcript fallback via the content script, InnerTube fetch | **Keep** | Learned the hard way already; do not relearn. |
| Nightly launchd job that renders, commits to the brain, and deploys | **Overkill** | Zero sessions, and it needs an exception to the brain's first rule, a marker in a hand-edited index, and a sandbox for stills. Replace with a manual `npm run brain <video>` you run when a lecture is done; it writes the post, you commit and push. Same output, no job, no exception, no unattended model code. |
| Widget stills in the post | **Cut** | Link to the live widget from the post instead. Removes the security question entirely. |

Net: the sidebar's core (brain, jot, check, answer, thread) is right-sized
and good. The widget layer and the nightly brain job are the two places
the build ran ahead of the evidence. Neither needs deleting; both need to
stop growing until a real week of lectures says otherwise.

---

# Second pass — 10 September, late

After 18 commits (0.2.0 to 0.2.8). `./check.sh` 42 of 42, brain contract
green. Production desk is at 0.2.0; the only desk-side change since is
`sources.json`, which the post writer reads locally, so nothing live is
behind in a way that matters.

| Finding | Now |
|---|---|
| 1 · Verb, version, doc drift | **Closed.** |
| 2 · Production commit not in history | **Superseded.** Production is now `ceb4ec7`, which is in the log. |
| 3 · The brain seam | **Closed as recommended.** `brain.mjs` is a command; refuses localhost; refuses with nothing starred; dated to the first note and found by slug on reruns; index row between markers; no stills; runs the brain's check. `tests/brain-post.test.js` proves the refuse, the write and the idempotent rerun against a copy of the real brain. |
| 4 · Small things | **Open, all three.** Forbidden-token list, DELETE pagination, three widget renderers. None bit. |
| Audit · acks and the "awaiting you" count | **Half.** The footer count is gone. The 👍 button and the `open` styling on a collapsed line remain, so a reply still carries "you owe this". Either cut the button too or accept it as a reaction; the comment in `panel.js` already argues for the latter. |
| Audit · widgets frozen | **Held.** No widget commits in the 18. |
| Audit · nightly job replaced by a command | **Done.** |

**New, fixed now**

- `brain.mjs` hard-coded "Karpathy's lecture" into every index row, so the
  first non-Karpathy video would have been filed under his name. It now
  uses the source's `by`, falling back to the title.
- `AGENTS.md` still said nothing is written into `~/Code/brain`, that the
  clipboard digest couples to the tracker, and that class notes are
  artifacts only. The layout table did not list `brain.mjs`,
  `functions/api/transcript.js`, the brain-post test or `docs/history/`; the
  KV section did not know `transcript:*`, `stars`, `acks`, `overruled`.
  All corrected. The deferred list now carries the audit's decisions
  (no job, no stills, no more widget work) so they cannot be re-litigated.

**New, not changed**

- The summariser runs `claude -p --model sonnet` on the laptop. The hard
  boundary says "no Anthropic key"; this uses no key, but it does mean the
  post writer depends on a logged-in CLI while the desk does not. Fine as a
  laptop-only command; do not let it migrate into the desk.
- `isQuestion` now lives in `panel.js` and again in `brain.mjs`. When it
  changes, it changes twice. Worth lifting into `desk/contract.js` the next
  time either is touched.
- The first real session exported from production would be the first
  evidence for the escalation rate and the composer's worth. Nothing to do
  until then.
