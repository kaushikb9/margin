// POST /api/ask
//   {mode: "answer"|"check"|"deeper"|"widget",
//    source: {id, title}, note: {id, text, tags, t},
//    followUp?: "<KB's reply inside the thread>"   (stored as kind "you", then answered)
//    prior?: <earlier reply>,  reply?: <reply the widget is for>}
// The thread (every stored reply under the note) is loaded here and handed to
// the pipeline, so a follow-up is answered in context.
// Runs the pipeline and stores the result as the next reply:* key under the
// note. Returns {reply} or {error}. An invalid model output becomes a reply of
// kind "error" so the note is never silently unanswered.
import { json, bad, loadBrain, loadTranscripts, replyKey, replyPrefix, ID_RE, log, listPrefix } from './_util.js';
import { answer, check, deeper, widget } from '../../desk/ask.js';
import { REPLY_KINDS } from '../../desk/contract.js';

const MODES = { answer, check, deeper, widget };

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return bad('body must be JSON'); }
  const { mode, source, note, prior, reply, followUp } = body || {};
  if (!MODES[mode]) return bad(`mode: one of ${Object.keys(MODES).join('|')}`);
  if (!source?.id || !ID_RE.test(source.id)) return bad('source.id: video id');
  if (!note?.id || !ID_RE.test(note.id)) return bad('note.id');
  if (typeof note.text !== 'string' || !note.text.trim()) return bad('note.text: empty');
  if (typeof note.t !== 'number') return bad('note.t: seconds into the source');

  const origin = new URL(request.url).origin;
  const brain = await loadBrain(env, origin);
  const transcripts = await loadTranscripts(env, origin);
  const src = { id: source.id, title: source.title || transcripts[source.id]?.title || source.id };
  const jot = { id: note.id, text: note.text.trim(), tags: Array.isArray(note.tags) ? note.tags : [], t: note.t };
  const started = Date.now();

  // The thread so far. A follow-up from KB is stored first so the record
  // reads in order even if the answer fails.
  let thread = env.TA_KV ? await listPrefix(env.TA_KV, replyPrefix(src.id, note.id)) : [];
  thread.sort((a, b) => a.seq - b.seq);
  if (typeof followUp === 'string' && followUp.trim()) {
    const seq = thread.length + 1;
    const you = { id: `${note.id}-${seq}`, noteId: note.id, src: src.id, seq, kind: 'you', at: new Date().toISOString(), text: followUp.trim().slice(0, 2000) };
    if (env.TA_KV) await env.TA_KV.put(replyKey(src.id, note.id, seq), JSON.stringify(you));
    thread.push(you);
  }

  const r = await MODES[mode]({
    brain, transcripts, jot, source: src, t: note.t, prior, reply, thread, env,
    log: line => log(env, line),
  });

  // A check that finds nothing renders nothing. Do not store it.
  if (mode === 'check' && r.ok && r.value.verdict === 'ok') {
    log(env, `check ${note.id}: ok (${Date.now() - started}ms, ${r.model})`);
    return json({ reply: null, retrieved: r.retrieved });
  }

  const kind = r.ok ? (r.escalated ? 'deeper' : mode) : 'error';
  if (!REPLY_KINDS.includes(kind)) return bad('internal: bad kind', 500);
  const seq = thread.length + 1;
  const stored = {
    id: `${note.id}-${seq}`, noteId: note.id, src: src.id, seq, kind,
    at: new Date().toISOString(), model: r.model || null, ms: Date.now() - started,
    ...(r.ok ? r.value : { error: r.error, attempts: r.attempts || [] }),
    ...(r.escalated ? { escalated: true } : {}),
  };
  if (env.TA_KV) await env.TA_KV.put(replyKey(src.id, note.id, seq), JSON.stringify(stored));
  log(env, `${mode} ${note.id}: ${kind} in ${stored.ms}ms via ${stored.model}${r.ok ? '' : ` — ${r.error}`}`);
  const you = thread.find(x => x.kind === 'you' && x.seq === thread.length);
  return json({ reply: stored, you: you || null, retrieved: r.retrieved || null });
}
