# margin — a study companion in the margin of the lecture

## Run · verify · deploy

```sh
npm run dev        # desk on :8789 with the mock model and a local KV; no key needed
./check.sh         # ~0.5s, no network: brain contract + 41 unit tests (npm test is the same)
npm run preview    # the sidebar as a plain page on :8790, driven by a shim (design review)
npm run deploy     # runs ./check.sh first, refuses on red; only when KB asks
```

margin is a Firefox sidebar that sits beside a YouTube lecture. (Named 2026-09-10; was "ta". The assistant that replies is still called the TA; `TA_*` env names, `x-ta-token` and the `TA_KV` binding are unchanged.) KB jots notes as
he watches; nothing interrupts. A note that reads as a question (or ends in
"?") gets an answer; every other note gets the silent check against a
**precomputed concept brain**, which speaks only when a claim contradicts
the lecture. (No checkbox, no tags, since 0.1.6 WIP: `isQuestion` in
`panel.js` decides.) Each reply
lands as one muted line under the note. A thread is a conversation: a
follow-up is answered with the thread in view, and when the notes are not
enough the desk escalates to the reasoning model on its own (`enough: false`
from the composer). Asking to be shown something ("show me", "slider") in
a follow-up builds a widget as the reply. ☆ stars mark a thing to remember. Nothing
is owed on a reply: no acks, no count of what awaits you. There is no break, no session, no end: the
brain post is regenerated from whatever is in KV.

Built 2026-09-10 from `docs/history/learn-app-plan.md` and the mockup at
https://claude.ai/code/artifact/0aaa12e2-4d34-48f3-b630-37c859c4e73c (titled "TA" — the name changed after). The
brief that started it and every mockup are in `docs/history/`.

## Hard boundaries

- **Does not touch the study tracker.** `~/Code/learn` (`plan.json`, the
  tracker template and artifact) is a separate working thing. There is
  no coupling: End session and the clipboard digest were cut in 0.1.4.
  Nothing here writes there.
- **Static site, no framework, no build step, no CDNs.** Pages Functions +
  KV. The extension is plain files; `npm run ext` only zips them.
- **No Anthropic key.** Models come through OpenRouter (`desk/models.js`).
- **The brain is written by Claude, in a session, anchored to the transcript.**
  `scripts/check-brain.mjs` refuses a note whose quote is not really said
  within ±45s of its timestamp. Never loosen that check; fix the anchor.
- **Answers are one concept, cited, under 170 words, no lists.** Enforced by
  `desk/schema.js`, stated in `desk/prompts.js`. An answer that reads as an
  article is a bug.

## Two things called "the brain"

Inside this repo "the brain" is `site/brain/*.json`, the concept notes the
TA answers from. Everywhere else on this machine "the brain" is
`~/Code/brain`, KB's private blog. When this repo writes posts there, say
"the blog" or "brain.kaushik.sh" in code and docs to keep them apart.

## Layout

```
site/                         the desk's static half (Pages output dir)
  brain/d1.json, d2.json      the concept brain: 36 notes, one cluster (phone keyboard)
  brain/sources.json          which videos are known
  transcripts/<videoId>.json  caption segments + chapters, fetched by scripts/transcript.mjs
  widget/runtime.html         the sandboxed widget runtime (lives here, not in the extension — see below)
  _headers                    CSP for the runtime, cache for brain/transcripts
functions/
  _middleware.js              CORS + x-ta-token on /api/*
  api/health.js               open: is the desk up, which models, mock or live
  api/ask.js                  POST {mode: answer|check|deeper|widget, source, note, prior?, reply?}
  api/notes.js                GET session log · PUT note · DELETE note+replies
  api/_util.js                auth, KV keys, brain/transcript loading via ASSETS
desk/                         the pipeline, pure, imported by functions and tests
  contract.js                 the response shapes and limits — the one place they live
  retrieve.js                 BM25 over notes + a position prior from the jot's timestamp
  prompts.js                  composer / checker / deeper / widget prompts
  schema.js                   validators for every model output
  models.js                   which OpenRouter model does which job; env overrides
  client.js                   the OpenRouter call, and the mock used when there is no key
  ask.js                      answer() check() deeper() widget() — retry + fallback
extension/                    the Firefox sidebar (MV3, sidebar_action)
  manifest.json
  content/youtube.js          reads video id / time from the page; seeks; caption fallback
  sidebar/panel.{html,css,js} the panel. panel.css carries tokens.css verbatim.
scripts/
  check-brain.mjs             the brain contract (run by npm test)
  quote.mjs                   find real quotes: `quote.mjs <videoId> grep "phrase"` / `at mm:ss`
  transcript.mjs              fetch a video's captions into site/transcripts/
  bench.mjs                   run KB's real doubts through candidate models (needs a key)
  benchmarks.mjs              OpenRouter's benchmark aggregate joined to live prices (needs a key)
  seed.mjs                    preload notes from seeds/<file>.json and let the TA respond (idempotent)
  export.mjs                  pull a session (notes + replies) from KV into sessions/
  notes.mjs                   render a session file into class notes (notes/<video>-<date>.html)
  brain.mjs                   `npm run brain <videoId>`: one post per video into ~/Code/brain (see below)
functions/api/transcript.js   GET have-we-got-it · PUT the captions the page script fetched (lecture-only mode)
tests/                        node --test; the contract test greps the renderer; brain-post.test.js runs brain.mjs against a copy of ~/Code/brain
seeds/                        notes to preload, e.g. KB's tracker notes for the Deep Dive
sessions/                     exported session logs; <video>/summary.json caches the post's keep block
docs/history/                 the brief, plan and mockups margin was built from (moved from ~/Code/learn)
notes/                        rendered class notes (gitignored; the artifact is the copy)
```

## State (KV, binding `TA_KV`)

One writer per key.

- `note:<videoId>:<noteId>` — written by the extension only:
  `{id, src, t, text, tags[], stars[], overruled, createdAt, updatedAt}`.
  `t` is seconds into the video when the note was jotted. `tags` is `#doubt`
  or empty. `stars` holds reply ids plus `'note'` for the note itself; the
  brain post's keep block is written from them.
- `reply:<videoId>:<noteId>:<seq>` — written by the desk only:
  `{id, noteId, src, seq, kind, at, model, ms, ...fields}` where `kind` is
  `answer | check | deeper | widget | error` and the fields are those in
  `desk/contract.js`. A check that finds nothing is **not stored** — absence
  is the only "fine".
- `transcript:<videoId>` — written by the desk when the page script hands it
  captions for a video the worker cannot fetch (lecture-only mode).
- The extension also keeps everything in `browser.storage.local` under
  `s:<videoId>` so the panel renders offline; the desk is merged in on open.

## The four seams

Reply shapes live in `desk/contract.js`. The prompt states them, the
validator enforces them, the API stores them, `panel.js` renders them.
`tests/contract.test.js` fails if any of the four drifts. Change a field in
all four in the same commit.

## Models

Defaults in `desk/models.js`, chosen 2026-09-10 from `npm run benchmarks`
(OpenRouter's Artificial Analysis aggregate, joined to live prices): **GLM 5.3
Flash** for composer, checker and widget (41.9 intel / 71.5 code at
$0.15/$0.50 per M — near full GLM 5.3 at a tenth of the price), **GLM 5.3**
for the deeper pass. Fallbacks are cross-family (DeepSeek V4, Qwen, Kimi) so
one provider's outage does not take the desk down. No GPT or Claude family
anywhere, by KB's rule.

Read side by side on 2026-09-10: composer 6/6 on KB's real d1 doubts (median
~3s), checker 4/4 on notes with known verdicts (median ~2s). DeepSeek V4
Flash answered as well but at 7–31s. Re-run `npm run bench composer …` and
`bench checker …` after any prompt or model change. Override per job without a code
change: `TA_MODEL_COMPOSER`, `TA_MODEL_CHECKER`, `TA_MODEL_DEEPER`,
`TA_MODEL_WIDGET`, and `TA_FALLBACK_<JOB>` as a comma list.

## Install in Zen

1. `npm run dev` (or deploy), note the URL.
2. Zen → `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on**
   → pick `extension/manifest.json`. This resets on restart.
3. Open the margin sidebar (View → Sidebar, or the toolbar button). On a
   signed install it first asks to **Allow on youtube.com** — press it (or
   turn it on under about:addons → margin → Permissions) and reload the
   lecture tab. Then the gear: desk URL and `TA_TOKEN`, **Test**, **Save**.
4. For a permanent install: `npm run ext` (writes margin-extension.zip), sign the zip as **unlisted** on
   addons.mozilla.org (free, no listing), install the signed `.xpi`. Zen
   blocks unsigned add-ons and ignores `xpinstall.signatures.required`.
   AMO rejects a manifest without `data_collection_permissions`; margin
   declares `websiteActivity` (it reads which video you are on and sends
   your notes to the desk you configured). Bump `version` for each upload; `strict_min_version` must be ≥142 or AMO warns
   that `data_collection_permissions` predates the minimum. Icons: `margin.svg`
   is the source; the PNGs are rendered from it (`qlmanage -t -s 512`, then
   `sips`) because AMO's icon field wants PNG.

## When a lecture is done: the brain post

```sh
TA_HOST=https://margin-3d0.pages.dev TA_TOKEN=… npm run brain 7xTGNNLPyMI
```

One post per video, into `~/Code/brain/site/posts/YYYY-MM-DD-<slug>.html`
(dated to the first note, found by slug on later runs, never renamed) plus
its index row between `<!-- margin:<id> -->` markers. The keep block sits at the top:
a concise "things to remember" written from KB's starred lines and
nothing else by **`claude -p --model sonnet`** (this runs on KB's laptop,
where the CLI is logged in; no key), cached in `sessions/<video>/summary.json`
until the stars change. Without the CLI it falls back to OpenRouter's deeper
model, and without a key to the starred lines verbatim, saying so. Below it the raw
thread, corrections on their gold rail, a ★ on every starred line. Nothing
is repeated. **No stars, no post** — the script refuses (exit 3). Widgets are not rendered; a line says one was
built. It reads the live desk only (refuses localhost), then runs the
brain's own `npm test`. Committing and deploying the brain stay KB's. Not
nightly: run it by hand until it has produced three posts worth keeping.

`npm run export` and `npm run notes` still exist for a per-session artifact
page; they are not the record.

## Deploy

```sh
npx wrangler kv namespace create TA_KV          # paste the id into wrangler.toml
npx wrangler pages project create margin     # live at https://margin-3d0.pages.dev
npx wrangler pages secret put OPENROUTER_API_KEY --project-name margin
npx wrangler pages secret put TA_TOKEN --project-name margin
npm run deploy
```

Without `OPENROUTER_API_KEY` the desk runs the mock model and says so in
`/api/health`; the sidebar's **Test** button reads it. There is no front
page — the desk is a key-holder, a notebook and a sandbox, not a site.

## Deferred, don't build unless asked

- Brain notes for sources beyond the two Karpathy videos (Milestones 1–2).
  A new video already works in lecture-only mode (the page script fetches
  its captions; answers come from the transcript, no notes). Adding notes is
  `scripts/transcript.mjs <id> <milestone>` plus a `d<n>.json`.
- A Chrome build. The manifest is MV3 and would mostly port, but
  `sidebar_action` is Firefox's.
- Any coupling to the tracker (`~/Code/learn`). The tracker is the plan and
  the score; margin is the notebook; the blog is the record.
- A nightly job for the brain post. It is a command KB runs; decided
  2026-09-10 after the review, and it stays that way until three posts
  exist that were worth keeping.
- Widget stills in the brain post. A line says a widget was built; the
  live widget is in the sidebar. Never run model-written `compute` outside
  the sandboxed runtime.
- More widget work (renderers, prompts) until a real session asks "show me"
  more than once.
- A break view, "go deeper on all", an end-session button, tags, a "not
  convinced" button — all cut on 2026-09-10 as redundant with the thread
  model and the brain post. Chapter-end prompts, badges, sounds: never.

## Learned the hard way

- **YouTube's timedtext endpoint returns an empty body to bare clients**
  (proof-of-origin gate, 2025+). The InnerTube `player` endpoint with the
  Android client identity still yields a working caption URL; that is what
  `scripts/transcript.mjs` uses. In the browser the page session works.
- **MV3 forbids `unsafe-eval` on extension pages**, and a widget's `compute`
  needs `new Function`. So the runtime is served from the desk
  (`site/widget/runtime.html`, clean URL `/widget/runtime`) and framed with
  `sandbox="allow-scripts"`: opaque origin, no storage, and its own CSP with
  `connect-src 'none'`. Do not move it back into the extension.
- **KV prefix listing with a padded empty seq matched nothing** — every reply
  got seq 1 and overwrote the last. `replyPrefix()` exists for this; use it.
- **Auto-captions garble numbers, and a model will quote them.** The checker
  fixed "15 million" and added a nonexistent "45B Llama 3" from the caption
  "Lama 3.1 4.5 405 billion". Prompts now pin every figure to the NOTES and
  forbid taking numbers from the transcript. A wrong number in a correction
  arrives in the same confident voice as a right one; the brain notes are the
  only trusted source, so put the figure in the note.
- **GLM 5.3 Flash cannot switch reasoning off** ("Reasoning is mandatory for
  this endpoint"), and OpenRouter counts the thinking against `max_tokens`.
  Cheap jobs run `effort: low` with caps that leave room; a provider that
  rejects the reasoning field is retried once without it.
- **The position prior must not outrank a strong lexical hit.** At 2.2× it
  ranked a neighbouring note above the one the jot literally named; at 0.6×
  with lexical damped by confidence, both cases pass (`tests/retrieve.test.js`
  carries KB's real doubts as the fixture).
- **Firefox MV3 grants host access to temporary add-ons and withholds it from
  installed ones.** The signed build showed "Open a YouTube lecture" on a
  tab that had the lecture open, with a blank console: the content script
  was never injected. `host_permissions` declares youtube.com so it appears
  under about:addons → Permissions, and the panel shows an *Allow on
  youtube.com* button (`permissions.request`) when access is missing.
- **A render guard must protect a draft, not a focused box.** Blocking every
  render while a queue textarea had focus hid the pending line and the
  reply after Enter (0.2.7) and kept the edit box open after Escape. The
  guard now holds only while a follow-up box has unsent text or an edit is
  in progress; sending and cancelling blur first.
- **The first render must happen even when there is no video.** After the
  poll was removed, `setPage` skipped rendering when the video was
  "unchanged" — including null→null at startup, which left a blank panel on
  any non-YouTube tab. `?v=none` on the preview shows that state.
- **Do not poll the page.** A 2s poll re-rendered the queue and threw the
  cursor out of the reply box after two letters. The sidebar now asks the
  page which video is open on tab events only, asks for the time at the
  moment a note is sent, and has no ticking clock. Drafts are kept in
  memory regardless.
- **Firefox keeps extension CSS cached across a temporary-add-on reload.** A
  stylesheet change shipped with a script change rendered as new JS in the
  old layout. `panel.html` links `panel.css?v=N` and the css file's first
  line carries the same N; the test fails if they differ. Bump both.
- **The in-app browser cannot execute local files**, and hides the pane
  between calls. `npm run preview` serves the panel on :8790 with a shim for
  the extension API, and `javascript_tool` drives it; screenshots only work
  while the pane is visible.
