# TA — plan

**Status: built 2026-09-10 at `~/Code/margin`.** Written 2026-09-09 from the
interview in the session that opened `learn-app-requirements.md`. This file is
the design as agreed; `~/Code/margin/AGENTS.md` is the truth about the code. Where
they differ, the code's file wins and this one is history.

Next milestone — what a session becomes afterwards — is discussed at
https://claude.ai/code/artifact/743db42c-459f-4871-92f6-896d503c8c87
(source `learn-app-notes-mockup.html`).

Mockup: https://claude.ai/code/artifact/0aaa12e2-4d34-48f3-b630-37c859c4e73c
Source: `learn-app-mockup.html` (republish that path to update the artifact).

**Hard boundary, restated.** This does not touch the tracker. `plan.json`,
`tracker.template.html`, `learn-ai-tracker.html`, the tracker artifact and the
nightly review task are a separate working thing. The only coupling is one
appended note to `progress/<dayId>`, written only when KB presses End session.

---

## The idea in one paragraph

Karpathy stays the professor. TA is a Firefox sidebar that sits beside the
lecture and takes jots — doubts and notes — without answering anything. At a
break, KB opens the queue: doubts get answered one concept at a time from a
**precomputed concept brain**, and the notes he wrote get read back with any
claim that contradicts the brain flagged. Nothing interrupts the lecture.

## Why the two ideas in the brief are one product

The brief describes a companion that answers in the moment, and an app that
turns a source into a concept-by-concept ELI5. They are the same thing: the
walkthrough is what an *answer* looks like, sized to one question. Building it
as "chew the whole video up front" produces a document, and a document is the
article KB ruled out twice. Answering one question at a time is what
structurally prevents the failure mode.

The brief's own objection — *"its pointless to make a generic tool. each
video/concept needs to generate a ELI5"* — resolves as: **precompute the
knowledge, never render it as a document.** The brain is internal. The only
thing KB ever sees is an answer to something he asked.

## Decisions from the interview (2026-09-09)

| Question | Decision |
|---|---|
| Which half first | One product. The answer format *is* the walkthrough. |
| Where it runs | Firefox sidebar extension, in Zen. |
| Model access | OpenRouter, OSS models. No Anthropic key. |
| Breadth of v1 | Milestones 1 and 2. |
| How the brain is built | Built by Claude in a session, **no review pass**. |
| Widgets | Generated **per thread, at the break** — from the note, the answer and what did not land. Not per concept in advance. *(Revised 2026-09-10.)* |
| "Relevant to me" | Simple day-to-day examples, CS-grad level. No domain analogies. |
| Interaction model | Classroom. Async TA answers under the note while the lecture runs; break is an optional deeper pass. *(Revised 2026-09-10.)* |

### Two of these carry known risk

- **No review pass on the brain.** Mitigation is not a review, it is that every
  concept note carries a timestamp anchor and a verbatim quote, so verification
  is ambient — a fabricated note has nowhere to hide while you read the answer.
  *Seen for real on 2026-09-10:* the checker's first Llama correction added a
  nonexistent "45B" from garbled captions. Prompts now pin numbers to the
  notes; "I think it is fine" and the deeper pass remain the human backstops.
- **Generated widgets.** A subtly wrong interactive teaches a subtly wrong
  thing, which is worse than no widget. Mitigation: generation is constrained to
  a fixed primitive set, sandboxed, no network. Built at the break from the
  thread (KB, 2026-09-10: "you wouldnt possibly know what all areas are
  unknown, unclear beforehand"), so the input is specific — the note, the
  answer, the thing that did not land — rather than a concept in the abstract.
  Cached by thread; reusable when a later thread hits the same concept and the
  same confusion. If the first ten are bad, fall back to two hand-built widgets
  rather than shipping flaky ones.

## Browser: Zen works, with one setup step

Zen is a Firefox fork and runs WebExtensions. Unsigned `.xpi` install is
blocked there — `xpinstall.signatures.required` does not take effect, unlike
Firefox Dev Edition or Nightly. So:

- **Development:** temporary load via `about:debugging`. Resets on restart.
- **Permanent:** sign the extension as **unlisted / self-distributed on AMO**
  (free, no public listing, no review queue for unlisted). Yields a signed
  `.xpi` that installs permanently from a local file.

Firefox's `sidebarAction` is a first-class docked sidebar, which suits this
better than Chrome's later `sidePanel`. No browser switch required.

## Architecture

Three parts. No framework, no build step, no CDNs, no npm dependency.

| Part | What | Where |
|---|---|---|
| The brain | Static JSON concept graph for d1+d2, built once, committed | `brain/d1.json`, `brain/d2.json` |
| The desk | One Pages Function: OpenRouter proxy, retrieval, widget cache | `functions/api/ask.js` |
| The panel | Firefox `sidebarAction` sidebar, plain JS | `extension/` |

The OpenRouter key lives in the Pages Function environment and never in the
extension. KV holds the widget cache and session state.

### The concept record

```
id, milestone, title, cluster
prereqs[], unlocks[]
oneLiner
explanation        // ~200 words, uses the cluster's running example
wrongVersion       // { claim, tell } — seeded from plan.json misconceptions
anchors[]          // { src, t, quote } — where the lecture actually says it
widgetHint         // likely shape if a thread asks for a poke, or null — a hint, not a build
```

**The running example is per cluster, not per concept.** That is what makes it
continuous rather than a fresh analogy each time. For d1+d2 the cluster is
**phone keyboard autocomplete** — it is literally next-token prediction, it is
day-to-day, and no CS grad needs it explained. Tokens are what the dictionary is
keyed on; temperature is how adventurous the three suggestions are; attention is
how the suggestion changes when you edit a word earlier in the sentence.

Attention is the known stretch. If the cluster snaps at d2, switch clusters at
the milestone boundary rather than forcing it.

### Seed material that already exists

- `plan.json` `misconceptions[]` — first entry is *"The LLM retrieves an answer
  from its parameters"*, whose correction is close to verbatim the answer to
  KB's 9 Sept doubt. This is the seed corpus for `wrongVersion`.
- `plan.json` `days[].concepts` is **one prose sentence per day**, not an atomic
  list. The brain needs a real concept-extraction pass over those sentences plus
  the resource transcripts. Roughly 40 records for d1+d2.
- KB's two recorded errors get added as `wrongVersion` entries by hand:
  *"low temperature = higher accuracy"* and *"Llama 3 trained on 15 million
  tokens"* (it is 15 trillion).

### How a question gets answered

1. The panel knows the video id, the current timestamp, and the transcript
   window around it (YouTube caption track, pulled client-side).
2. **Retrieval uses the question text plus position in the video.** The
   timestamp is a strong prior — concepts anchored near where you are rank
   first. This is the cheap win that makes a small model sufficient.
3. Composition: the model receives the retrieved concept notes and the
   transcript window, and is instructed to compose *from the notes*, cite a
   timestamp, and cover exactly one concept. It is not reasoning from scratch,
   which is why an OSS model is fine here.
4. **"Not convinced, go deeper"** re-routes the same question to a reasoning
   model with the full prerequisite subgraph and a wider transcript window.

### The classroom loop

- One box, Enter sends. **Everything is a note.** Tags are applied after a
  note exists, never chosen up front: `#doubt` is one tag, and KB invents the
  rest on the fly (`#key`, `#til`). *(KB, 2026-09-10, replacing the earlier
  doubt/note choice.)*
- **The TA works while the lecture runs.** *(KB, 2026-09-10: "the professor is
  continuing the explanation, while the TA is answering questions, evaluating
  notes in async".)* A `#doubt` note is answered within about a minute; every
  note is checked for claims that contradict the brain. The response lands
  **collapsed under the note** as one muted line — "Answered · concept · time"
  or "Check this · time" — the way comment threads work on the mockup
  artifact. No popup, no badge. The row grows and nothing else moves.
- The flag quotes him, corrects the claim, and offers **"I think it is fine"** as
  a real override that stays overruled. No error tally, no scolding.
- **The break is optional and never offered.** No chapter-end trigger; the
  panel never speaks first. It is a pause KB chooses to read what landed and
  to run a **deeper pass**: the reasoning model re-reads every note, answered
  or not, against the full transcript so far. If it changes its mind on an
  answer, the thread gets a second reply, never a silent edit.
- **End session** lives in the break view. It appends one note to
  `progress/<dayId>` in the tracker artifact db. One key, one-way, only on
  press.

## Build order

1. `extension/` shell — sidebar, jot composer, queue, break view. Static, no
   network. Load via `about:debugging`.
2. Transcript ingestion from the YouTube caption track, client-side.
3. Brain for d1 (~20 records), hand-anchored to real timestamps.
4. `functions/api/ask.js` — OpenRouter proxy, retrieval, composition prompt.
5. Async loop end to end against the real d1 notes: note lands, answer or
   check arrives collapsed beneath it within a minute.
5b. The break: deeper pass on the reasoning model, second reply on change.
6. Widget generation: **Poke at it** / **Show me** queue a request on the
   thread; the break builds it from the thread against the primitive set and
   lands it under the thread. Cached in KV by thread.
7. Brain for d2.
8. AMO unlisted signing, permanent install in Zen.
9. End-session digest to the tracker.

## Done when

- The sidebar opens beside the Karpathy video in Zen, permanently installed.
  Zero setup per question.
- All six question types from the brief get a correct, concept-sized,
  timestamp-cited answer — including *"how does it know the next question is one
  it doesn't know?"*
- Both recorded errors are flagged at the next break, unasked.
- At least one generated widget KB would have bookmarked.
- The tracker digest lands only when pressed; `plan.json`, the templates and the
  tracker artifact are byte-identical.

## Reject if

- Any answer reads as an article, a summary, or covers more than one concept.
- Any answer without a timestamp citation.
- Anything interrupts mid-video. A collapsed line under a note is not an
  interruption; a popup, badge, sound or auto-expand is.
- Any write to the tracker beyond one appended note.
- A build step, a framework, a CDN, or an npm dependency.
- A custom comment or annotation layer. Artifacts have native comments.

## Scope cut, 2026-09-10 evening

Shipped in margin 0.1.4: threads are conversations (reply under any answer);
the desk escalates to the reasoning model itself when the composer reports
`enough: false`; Poke builds on press; the break view, go-deeper-on-all,
End session, tags and "Not convinced" are gone; "Check this" is now "TA · on
what you wrote". End-to-end storyboard with the remaining chores removed:
https://claude.ai/code/artifact/7dfc594b-d984-4b72-bb40-0de0aa744707 —
proposes no checkbox (questions answered, statements checked), a nightly
writer into the brain, and transcript-on-first-note for new lectures.
**Decided (KB, 2026-09-10), all four:** no checkbox (questions answered,
statements checked); the nightly writer, owned by margin; stars instead of a
keep block; transcript on first note for new lectures. Build list and review
brief: `~/Code/margin/REVIEW.md`. **Paused before the one-shot build for an
external review (Fable).** The nightly writer, owned by margin — the
launchd job `com.kb.margin` lives in the margin repo; the brain stays a dumb
static site with one documented exception to its no-auto-post rule, scoped to
margin's resource posts. Still open: checkbox vs auto-detect; who writes the
keep block.

## Todo — surface resources in the brain (KB, 2026-09-10)

Decided the same evening, simplified: **no plan level, one post per resource**
(video, paper, essay). All sessions on a resource merge into that one post in
lecture order; the timestamps are the only session trace. Mockup in the
brain's own post.css: https://claude.ai/code/artifact/e003b712-e1c7-40a1-be1a-c3c9203a0441
(source `learn-app-brain-mockup.html`). Widgets become stills computed at the
defaults; the brain's no-script rule stays. Not built yet.

## Earlier framing (superseded, kept for the record)

KB's words: "once a session is done and properly closed lets surface it in
brain.kaushikbhat.com (repo: ~/Code/brain).. it might need changing the brain
repo itself a bit.. it should have notes folded within each plan (optional..
similar to the ai learning plan or such) -> one topic (video/paper/essay) ->
each session.. this might need a longer piece to be discussed in claude."

Not started. KB will open a Claude session for it when the other pieces are
done. Scope when picked up: the brain repo's structure (plan → topic →
session), what "properly closed" means for a session, and the blog's
no-script rule versus live widgets (question 2 on the class-notes artifact,
folded into this). Input is `~/Code/margin/sessions/<video>/<date>.json`;
`margin/scripts/notes.mjs` already renders the page.

## Open at build time — resolved as follows (2026-09-10)

KB said "go ahead build" with these unanswered, so the build assumed:
voice as in the mockup's tokenization note; keyboard cluster carried through
d2 (attention notes use it lightly); claim-checks land async; an overruled
flag stays local (it rides along in the clipboard digest only); models per
`margin/desk/models.js`, unbenchmarked, with `npm run bench` to decide properly.

### The questions as they stood

1. **Is the voice right?** The `c-tokenization` record in the mockup is the
   sample. It sets the tone for ~40 records.
2. **Does the keyboard cluster carry both milestones?** Attention is the stretch.
3. **Do claim-checks land async too, or only at the break?** Mock lands them
   async as one muted line. The alternative is live answers for `#doubt` only
   and checks deferred to the deeper pass — quieter, but a wrong note sits
   longer.
4. **Does "I think it is fine" reach KB?** Overruling a flag is a strong signal:
   either the brain is wrong or the misconception is deep. Ride along in the
   digest, or stay local?
5. **Which OpenRouter models?** One small model for composition, one reasoning
   model for escalation.

## Learned the hard way

- The in-app browser cannot run local files at all — it renders them as a
  static first-viewport snapshot, and page tools refuse to act on the tab. To
  dry-run page JS, either publish the artifact and test the live URL, or extract
  the script and run it in node against a stub DOM.
