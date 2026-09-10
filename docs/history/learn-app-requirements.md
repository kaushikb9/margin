# learn-app — requirements brief

**Status: brief, not a plan.** Written 2026-09-09 at the end of a session that
was about something else. Nothing here has been designed, decided or built.
Start a fresh session pointed at this file, interview me, then plan.

**Hard boundary: this does not touch the study tracker.** `plan.json`,
`tracker.template.html`, `learn-ai-tracker.html`, the published artifact and
the nightly review task are a separate, working thing. Do not edit them, do
not republish the artifact, do not fold this idea into them. If the two ever
merge it is a later decision, made deliberately.

---

## Why this came up

I am working through the AI Systems Foundations plan in this folder. The
first milestone opens with Karpathy's *Deep Dive into LLMs*, which runs three
and a half hours. After two sessions I am ninety minutes in.

What I said, verbatim:

> still only through 90mins of Karpathy video. there are so many questions and
> cant get a handle on this. I can add notes and comments but its async and
> not really easy to toggle between windows

The tracker is a good **record** and a bad **companion**. It captures what I
learned after the fact. It does nothing while I am actually watching, which
is when the questions arrive and when they are cheapest to answer. Every
question currently costs a window switch, a context re-explanation, and a
delay until someone reads the note.

The failure is not motivation and not the curriculum. It is that asking a
question mid-source is expensive.

## The two ideas, as I put them

### 1. A browser extension

A simple extension where I can ask any question and it already knows the
source I am on, so it answers in that context. Should work for YouTube
videos, PDFs, and whatever else.

The essential property is **zero setup per question**. No pasting a link, no
explaining what I am watching, no new tab.

### 2. A web app, "learn a hard concept"

Input is always a source: a YouTube video, an essay, a PDF, anything like
that. From that it produces an ELI5 version that is relevant to me.

Constraints I stated:

- **It must not produce a blog post or an article.** That is the obvious
  failure mode and it is not what I want.
- **Break it into concepts,** one at a time.
- **Explain with one continuous example** carried across the whole thing,
  rather than a fresh analogy per concept.
- **An interactive thing after each concept or topic,** where I can poke at
  it and understand it live. Karpathy does this constantly in the video and
  it is the part that works.
- **Format is dynamic per topic.** Not one template applied to everything.

And the tension I raised myself:

> its pointless to make a generic tool. each video/concept needs to generate
> a ELI5

That tension is the central design question of this project. Do not paper
over it.

## Evidence: what the thing has to actually handle

These are real questions from my notes on the first ninety minutes. They are
the ground truth for whether a design works. If a proposed design cannot
serve these, it is wrong.

- **Mechanism questions.** "a lot of the world knowledge is stored in the
  parameters of the network" — what? how? Asked twice, with visible
  frustration.
- **Distinction questions.** Token versus vector versus embedding.
  "understood at a high level but not very clear."
- **Shape-of-the-field questions.** Is there something called training or is
  everything pre-training? What does releasing a model even mean?
- **Confident misconceptions.** I wrote down "low temperature = higher
  accuracy" as a new learning. It is wrong, and I would not have known to
  ask about it. The system has to catch things I state confidently, not only
  things I mark as doubts.
- **Factual slips.** I transcribed Llama 3 as trained on fifteen million
  tokens. It is fifteen trillion. Same category: I did not know to ask.
- **Genuinely deep questions.** If we fine-tune a model to say "I don't
  know", how does it know that the next question is one it does not know?

The last one is the proof that this is worth building. That question is good
enough to be worth answering well and immediately, and instead it sat in a
note for two days.

### The interactive pieces I actually bookmarked

Unprompted, from the video, I saved three tools. These are the model for what
"an interactive thing after each concept" means:

- **Tiktokenizer** for seeing text become tokens.
- **bbycroft.net/llm** for walking a transformer layer by layer.
- **The FineWeb write-up** for what training data actually is.

They are small, single-purpose, and manipulable. None of them is a diagram
and none of them is prose.

## What already exists here

Read these before designing anything.

| Thing | Where | Relevance |
|---|---|---|
| The curriculum | `plan.json` | The concepts this app would explain, already sequenced and prioritised. Off limits for edits. |
| The tracker | `AGENTS.md`, `tracker.template.html` | The record half of the problem. Its db schema and review protocol show the patterns I accepted. |
| My notes so far | tracker artifact db, `progress/d1` | The evidence above, in full. Read it. |
| The original brief | `learn-ai-requirements.md` | Who I am, what I do, what I am aiming at. |

Also read, outside this folder:

- `~/.claude/CLAUDE.md` — how to work with me. Interview first, plan in text,
  Done-when and Reject-if, mockup before pixels.
- `~/Code/brain/design-system/INVARIANTS.md` and `tokens.css` — mandatory.
  Copy the tokens, do not re-derive a palette.
- `~/Code/AGENTS.md` — the repo map and the standing architecture constraint:
  static site, no framework, no build step, no CDNs, state in Cloudflare KV
  behind Pages Functions.

## Open questions for the interview

I have not decided any of these. The first three matter most.

1. **Which half first?** The companion that answers questions in the moment,
   or the app that turns a source into an explained walkthrough. They solve
   different halves of the same friction and I described both in one breath.
   They may or may not be one product.
2. **How does a generic tool produce a bespoke explanation?** My own
   objection. Candidate answers worth putting to me: a library of
   parameterised widgets the generator picks from; a generation step that
   writes a one-off page per source; or a hybrid where structure is generic
   and only the worked example is bespoke.
3. **Where does it run?** A Chrome extension, a Cloudflare Pages app, a local
   tool, or a Claude artifact. The extension is the only thing I have never
   built here, and it is the only form that removes the window switch.
4. **What does "relevant to me" mean concretely?** Analogies drawn from
   payments and infrastructure, which is what I know? Grounded in my earlier
   notes? Pitched at what I have already ticked off in the tracker?
5. **Does the source get ingested up front?** A transcript or PDF in context
   makes answers accurate and citable and makes prefix caching worth it.
   Answering from the model's own knowledge is cheaper and vaguer.
6. **Does anything flow back to the tracker?** Questions asked and answered
   are exactly the material the nightly review wants. A one-way, narrow link
   would fit my existing rule that apps stay separate with narrow couplings.
7. **Which sources for a first version?** YouTube alone would cover the
   current milestone.

## Do not

- Do not produce a blog, an article, or a summary. Stated twice.
- Do not build a generic summariser with a chat box bolted on.
- Do not build a custom comment or annotation layer. That was retired on
  2026-09-05; artifacts have native comments.
- Do not touch the study plan or the tracker artifact.
- Do not write code before interviewing me and planning in text.
- Do not skip the mockup.

## One observation worth keeping

Building this well requires transcript ingestion, chunking, retrieval over a
source, prompt caching across many questions about the same long document,
and some way to tell whether the explanations actually land. That is
Milestones 3, 4 and 7 of the plan I am currently studying.

If it is built deliberately, it is the capstone. If it is built carelessly,
it is another vibe-coded tool of the exact kind the study plan exists to cure.
That is a reason to be slow and explicit here, not a reason to avoid it.
