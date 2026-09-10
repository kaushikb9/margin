// POST /api/ask
//   {mode: "answer"|"check"|"deeper"|"widget",
//    source: {id, title}, note: {id, text, tags, t},
//    prior?: <earlier reply>,  reply?: <reply the widget is for>}
// Runs the pipeline and stores the result as the next reply:* key under the
// note. Returns {reply} or {error}. An invalid model output becomes a reply of
// kind "error" so the note is never silently unanswered.
import { json, bad, loadBrain, loadTranscripts, replyKey, replyPrefix, ID_RE, log } from './_util.js';
import { answer, check, deeper, widget } from '../../desk/ask.js';
import { REPLY_KINDS } from '../../desk/contract.js';

const MODES = { answer, check, deeper, widget };

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return bad('body must be JSON'); }
  const { mode, source, note, prior, reply } = body || {};
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

  const r = await MODES[mode]({
    brain, transcripts, jot, source: src, t: note.t, prior, reply, env,
    log: line => log(env, line),
  });

  // A check that finds nothing renders nothing. Do not store it.
  if (mode === 'check' && r.ok && r.value.verdict === 'ok') {
    log(env, `check ${note.id}: ok (${Date.now() - started}ms, ${r.model})`);
    return json({ reply: null, retrieved: r.retrieved });
  }

  const kind = r.ok ? mode : 'error';
  if (!REPLY_KINDS.includes(kind)) return bad('internal: bad kind', 500);
  const seq = await nextSeq(env, src.id, note.id);
  const stored = {
    id: `${note.id}-${seq}`, noteId: note.id, src: src.id, seq, kind,
    at: new Date().toISOString(), model: r.model || null, ms: Date.now() - started,
    ...(r.ok ? r.value : { error: r.error, attempts: r.attempts || [] }),
  };
  if (env.TA_KV) await env.TA_KV.put(replyKey(src.id, note.id, seq), JSON.stringify(stored));
  log(env, `${mode} ${note.id}: ${kind} in ${stored.ms}ms via ${stored.model}${r.ok ? '' : ` — ${r.error}`}`);
  return json({ reply: stored, retrieved: r.retrieved || null });
}

async function nextSeq(env, src, noteId) {
  if (!env.TA_KV) return 1;
  const page = await env.TA_KV.list({ prefix: replyPrefix(src, noteId) });
  return page.keys.length + 1;
}
