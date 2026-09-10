# margin — a study companion in the margin of the lecture

**Run · verify · deploy**

```sh
npm run dev        # desk on :8789 with the mock model and a local KV; no key needed
npm test           # ~0.3s, no network: brain contract + 38 unit tests
npm run preview    # the sidebar as a plain page on :8790, driven by a shim (design review)
npm run deploy     # only when KB asks
```

margin is a Firefox sidebar that sits beside a YouTube lecture. (Named 2026-09-10; was "ta". The assistant that replies is still called the TA; `TA_*` env names, `x-ta-token` and the `TA_KV` binding are unchanged.) KB jots notes as
he watches; nothing interrupts. A note tagged `#doubt` gets an answer, every
note gets checked against a **precomputed concept brain**, and each reply
lands as one muted line under the note. A break is optional: a deeper pass
over every note, and the building of any widget that was asked for.

Built 2026-09-10 from `~/Code/learn/learn-app-plan.md` and the mockup at
https://claude.ai/code/artifact/0aaa12e2-4d34-48f3-b630-37c859c4e73c (titled "TA" — the name changed after). The
brief that started it is `~/Code/learn/learn-app-requirements.md`.

## Hard boundaries

- **Does not touch the study tracker.** `~/Code/learn` (`plan.json`, the
  tracker template and artifact) is a separate working thing. The only
  coupling is one-way: **End session** copies a digest to the clipboard that
  KB pastes into the tracker's note by hand. Nothing here writes there.
- **Static site, no framework, no build step, no CDNs.** Pages Functions +
  KV. The extension is plain files; `npm run ext` only zips them.
- **No Anthropic key.** Models come through OpenRouter (`desk/models.js`).
- **The brain is written by Claude, in a session, anchored to the transcript.**
  `scripts/check-brain.mjs` refuses a note whose quote is not really said
  within ±45s of its timestamp. Never loosen that check; fix the anchor.
- **Answers are one concept, cited, under 170 words, no lists.** Enforced by
  `desk/schema.js`, stated in `desk/prompts.js`. An answer that reads as an
  article is a bug.

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
  export.mjs                  pull a session (notes + replies) from KV into sessions/
  notes.mjs                   render a session file into class notes (notes/<video>-<date>.html)
tests/                        node --test; the contract test greps the renderer
sessions/                     exported session logs — the input to the class-notes page
notes/                        rendered class notes (gitignored; the artifact is the copy)
```

## State (KV, binding `TA_KV`)

One writer per key.

- `note:<videoId>:<noteId>` — written by the extension only:
  `{id, src, t, text, tags[], createdAt, updatedAt}`. `t` is seconds into the
  video when the note was jotted. Tags are `#word`, lowercase.
- `reply:<videoId>:<noteId>:<seq>` — written by the desk only:
  `{id, noteId, src, seq, kind, at, model, ms, ...fields}` where `kind` is
  `answer | check | deeper | widget | error` and the fields are those in
  `desk/contract.js`. A check that finds nothing is **not stored** — absence
  is the only "fine".
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
3. Open the margin sidebar (View → Sidebar, or the toolbar button), press the
   gear, enter the desk URL and `TA_TOKEN`, **Test**, **Save**.
4. For a permanent install: `npm run ext` (writes margin-extension.zip), sign the zip as **unlisted** on
   addons.mozilla.org (free, no listing), install the signed `.xpi`. Zen
   blocks unsigned add-ons and ignores `xpinstall.signatures.required`.

## After a session

```sh
TA_HOST=… TA_TOKEN=… npm run export 7xTGNNLPyMI     # KV → sessions/<video>/<date>.json
npm run notes sessions/7xTGNNLPyMI/<date>.json      # → notes/<video>-<date>.html
```

Then publish the rendered page as a Claude artifact (the Artifact tool, from
a session) — one artifact per session file. Nothing on the page is generated:
the index lines are the replies' own first sentences, and every timestamp
opens the lecture at that moment.

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

- Sources beyond the two Karpathy videos (Milestones 1–2). Adding one is
  `scripts/transcript.mjs <id> <milestone>` plus brain notes; the panel and
  desk need nothing.
- A Chrome build. The manifest is MV3 and would mostly port, but
  `sidebar_action` is Firefox's.
- Writing to the tracker artifact db from the extension. The clipboard
  digest is the coupling.
- Chapter-end break prompts, badges, unread counts, sounds. The panel never
  speaks first.
- **Surfacing closed sessions in brain.kaushikbhat.com.** KB's parked todo
  (2026-09-10): the brain repo restructured as plan (optional) → topic
  (video/paper/essay) → session, with the notes page under it. Needs its own
  Claude session; scope in `~/Code/learn/learn-app-plan.md` under "Todo".
  Until then class notes are Claude artifacts only (`scripts/notes.mjs`),
  and nothing is written into `~/Code/brain`.

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
- **The in-app browser cannot execute local files**, and hides the pane
  between calls. `npm run preview` serves the panel on :8790 with a shim for
  the extension API, and `javascript_tool` drives it; screenshots only work
  while the pane is visible.
