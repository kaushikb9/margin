// The sidebar. Local-first: every note lands in browser.storage.local at once
// and the desk catches up. Replies come from the desk and are stored beside
// the notes so the panel renders the same offline. Nothing here pops, badges
// or auto-expands: a reply is one muted line under the note until opened.
//
// Renderer fields (kept in step with desk/contract.js — tests/contract.test.js
// greps this file): concept title body cites widgetHint enough verdict claim
// correction changed why inputs outputs compute note text fromLecture.

// Outside Firefox (npm run preview) there is no extension API. The shim gives
// the panel an in-memory store and a fixed page state so the real UI can be
// exercised against a real desk in an ordinary tab. Nothing else changes.
const api = (typeof browser !== 'undefined' && browser?.tabs) ? browser
  : (typeof chrome !== 'undefined' && chrome?.tabs) ? chrome
  : previewShim();
function previewShim() {
  const mem = {}; const q = new URLSearchParams(location.search);
  const state = { videoId: q.get('v') || '7xTGNNLPyMI', t: Number(q.get('t') || 5354), title: q.get('title') || 'Deep Dive into LLMs like ChatGPT', playing: true };
  document.documentElement.dataset.preview = '1';
  return {
    storage: { local: { get: async k => ({ [k]: mem[k] }), set: async o => Object.assign(mem, o) } },
    tabs: { query: async () => [{ id: 1 }], sendMessage: async (_id, msg) => { if (msg.type === 'state') { state.t += 2; return { ...state }; } if (msg.type === 'seek') { state.t = msg.t; return { ok: true }; } return null; } },
  };
}
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = t => { t = Math.max(0, Math.floor(t || 0)); const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60; return (h ? `${h}:${String(m).padStart(2, '0')}` : String(m)) + ':' + String(s).padStart(2, '0'); };
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

const SOURCES = { '7xTGNNLPyMI': 'Milestone 1', 'kCc8FmEb1nY': 'Milestone 2' };

// ---------- state ----------
let settings = { deskUrl: '', token: '' };
let page = { videoId: null, t: 0, title: '', playing: false };
let session = { notes: [], replies: [] };   // for page.videoId
let open = new Set();                        // expanded note ids
let menu = null;                             // note id whose edit/delete row is showing
let editing = null;                          // {id, text} while a note is being edited
let confirmDelete = null;                    // note id after the first press of Delete
let view = 'main';                           // main | settings
let tabId = null;
let tick = null;

// ---------- storage ----------
const store = {
  async get(k, d) { const r = await api.storage.local.get(k); return r[k] ?? d; },
  async set(k, v) { await api.storage.local.set({ [k]: v }); },
};
const sessionKey = src => `s:${src}`;
async function loadSession(src) { session = await store.get(sessionKey(src), { notes: [], replies: [] }); }
async function saveSession() { if (page.videoId) await store.set(sessionKey(page.videoId), session); }

// ---------- desk ----------
function haveDesk() { return Boolean(settings.deskUrl && settings.token); }
async function desk(path, { method = 'GET', body } = {}) {
  if (!haveDesk()) throw new Error('no desk configured');
  const res = await fetch(settings.deskUrl.replace(/\/$/, '') + path, {
    method,
    headers: { 'x-ta-token': settings.token, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `desk ${res.status}`);  // a 409 with needTranscript carries 'no transcript…'
  return data;
}

// ---------- page link ----------
async function activeTab() {
  const tabs = await api.tabs.query({ active: true, currentWindow: true });
  return tabs[0] || null;
}
const YT = { origins: ['*://www.youtube.com/*'] };
let hasAccess = true;
async function checkAccess() {
  try { hasAccess = api.permissions?.contains ? await api.permissions.contains(YT) : true; } catch { hasAccess = true; }
}
let lastMerge = 0;
async function pollPage() {
  // A fresh install, or a desk configured after the video loaded, must not
  // sit on an empty queue: retry the merge every 15s until something lands.
  if (haveDesk() && page.videoId && !session.notes.length && Date.now() - lastMerge > 15000) { lastMerge = Date.now(); mergeFromDesk(); }
  const tab = await activeTab();
  if (!tab) return setPage({ videoId: null });
  tabId = tab.id;
  try {
    const s = await api.tabs.sendMessage(tab.id, { type: 'state' });
    setPage(s || { videoId: null });
  } catch { setPage({ videoId: null }); }
}
async function setPage(s) {
  const changed = s.videoId !== page.videoId;
  page = { ...page, ...s };
  if (changed) {
    open = new Set();
    if (page.videoId) { await loadSession(page.videoId); mergeFromDesk(); }
  }
  render();
}
async function seek(t) { if (tabId != null) try { await api.tabs.sendMessage(tabId, { type: 'seek', t }); } catch {} }

// ---------- sync ----------
async function mergeFromDesk() {
  if (!haveDesk() || !page.videoId) return;
  try {
    const r = await desk(`/api/notes?source=${encodeURIComponent(page.videoId)}`);
    const byId = new Map(session.notes.map(n => [n.id, n]));
    for (const n of r.notes || []) { const local = byId.get(n.id); if (!local) session.notes.push({ ...n, status: 'synced' }); else { local.acks = [...new Set([...(local.acks || []), ...(n.acks || [])])]; local.stars = [...new Set([...(local.stars || []), ...(n.stars || [])])]; local.overruled = local.overruled || Boolean(n.overruled); } }
    const seen = new Set(session.replies.map(x => x.id));
    for (const x of r.replies || []) if (!seen.has(x.id)) session.replies.push(x);
    session.notes.sort((a, b) => a.t - b.t || a.createdAt.localeCompare(b.createdAt));
    await saveSession(); render();
  } catch (e) { status(`desk: ${e.message}`); }
}
async function pushNote(n) {
  if (!haveDesk()) return;
  try { await desk('/api/notes', { method: 'PUT', body: { source: page.videoId, note: { id: n.id, text: n.text, tags: n.tags, t: n.t, createdAt: n.createdAt, acks: n.acks || [], stars: n.stars || [], overruled: Boolean(n.overruled) } } }); n.status = 'synced'; }
  catch (e) { n.status = 'local'; status(`desk: ${e.message}`); }
  await saveSession();
}
// A video the desk has never seen: the desk tries to fetch the transcript
// itself; if YouTube refuses the worker, the page script fetches it from
// inside the tab and hands it over, then the ask is retried once.
async function sendTranscript() {
  if (tabId == null) return false;
  status('Fetching the transcript from the page…');
  let tx; try { tx = await api.tabs.sendMessage(tabId, { type: 'transcript' }); } catch (e) { tx = { error: e.message }; }
  if (!tx || tx.error) { status(`No transcript: ${tx?.error || 'page did not answer'}`); return false; }
  try { await desk('/api/transcript', { method: 'PUT', body: { source: page.videoId, title: tx.title, segments: tx.segments } }); status(''); return true; }
  catch (e) { status(`desk: ${e.message}`); return false; }
}
async function ask(mode, n, extra = {}, retried = false) {
  if (!haveDesk()) return null;
  n.pending = mode; render();
  try {
    const r = await desk('/api/ask', { method: 'POST', body: { mode, source: { id: page.videoId, title: page.title }, note: { id: n.id, text: n.text, tags: n.tags, t: n.t }, ...extra } });
    if (r.you) session.replies.push(r.you);
    if (r.reply) session.replies.push(r.reply);
    return r.reply;
  } catch (e) {
    if (!retried && /no transcript/i.test(e.message)) {
      n.pending = null;
      if (await sendTranscript()) return ask(mode, n, extra, true);
    }
    session.replies.push({ id: `${n.id}-e${Date.now()}`, noteId: n.id, kind: 'error', at: new Date().toISOString(), error: e.message });
    return null;
  } finally { n.pending = null; await saveSession(); render(); }
}

// ---------- notes ----------
// The note decides: a question is answered, a statement is checked. Stored
// as the #doubt tag so the desk, the seed files and the brain post need no
// new field. Want an answer to a statement? End it with a question mark.
const QUESTION = /\?\s*$|^(how|why|what|when|where|which|who|is|are|does|do|did|can|could|would|should|will|isn'?t|aren'?t|doesn'?t|don'?t)\b/i;
const isQuestion = text => QUESTION.test(text.trim());
async function addNote(raw) {
  const text = raw.replace(/\s+/g, ' ').trim();
  const tags = isQuestion(text) ? ['#doubt'] : [];
  const n = { id: uid(), t: page.t || 0, text, tags, createdAt: new Date().toISOString(), status: 'local' };
  session.notes.push(n); await saveSession(); render();
  await pushNote(n);
  await route(n);
}
// Asked → answer. Everything → the silent check; it only speaks if a claim
// contradicts the lecture. Both async.
async function route(n) {
  if (!haveDesk()) return;
  const has = k => repliesFor(n.id).some(r => r.kind === k);
  if (n.tags.includes('#doubt') && !has('answer')) await ask('answer', n);
  else if (!has('check') && !has('answer')) await ask('check', n);
}
const repliesFor = id => session.replies.filter(r => r.noteId === id);
const TA_KINDS = ['answer', 'deeper', 'check', 'widget'];
const awaiting = n => repliesFor(n.id).filter(r => TA_KINDS.includes(r.kind) && !(n.acks || []).includes(r.id));
async function ack(n, r) { n.acks = [...new Set([...(n.acks || []), r.id])]; await saveSession(); render(); await pushNote(n); }
// A star is the bigger ack: on a reply it also acknowledges it. 'note' stars the note itself.
async function star(n, id) {
  const set = new Set(n.stars || []);
  if (set.has(id)) set.delete(id); else { set.add(id); if (id !== 'note') n.acks = [...new Set([...(n.acks || []), id])]; }
  n.stars = [...set]; await saveSession(); render(); await pushNote(n);
}
const starred = (n, id) => (n.stars || []).includes(id);
// Edit fixes the words of a note you wrote. It never re-asks the TA: the
// replies stay as they were. Delete removes the note and everything under it.
async function editNote(n, text) {
  text = text.replace(/\s+/g, ' ').trim(); if (!text || text === n.text) { editing = null; render(); return; }
  n.text = text; editing = null; menu = null; await saveSession(); render(); await pushNote(n);
}
async function deleteNote(n) {
  session.notes = session.notes.filter(x => x.id !== n.id);
  session.replies = session.replies.filter(r => r.noteId !== n.id);
  open.delete(n.id); menu = null; confirmDelete = null;
  await saveSession(); render();
  if (!haveDesk()) return;
  try { await desk(`/api/notes?source=${encodeURIComponent(page.videoId)}&id=${encodeURIComponent(n.id)}`, { method: 'DELETE' }); }
  catch (e) { status(`desk: ${e.message}`); }
}
const lastSubstantive = id => [...repliesFor(id)].reverse().find(r => ['answer', 'deeper', 'check'].includes(r.kind));

// ---------- render ----------
function status(msg) { for (const id of ['deskStatus', 'mainStatus']) { const e = $(id); if (e) e.textContent = msg; } }
function render() {
  const onSource = Boolean(page.videoId);
  $('noaccess').hidden = hasAccess || view === 'settings';
  $('offsource').hidden = onSource || !hasAccess || view === 'settings';
  $('nodesk').hidden = !onSource || haveDesk() || view === 'settings';
  $('main').hidden = !onSource || view !== 'main';
  $('settings').hidden = view !== 'settings';
  $('backBtn').hidden = view === 'main';
  $('milestone').hidden = !onSource || !SOURCES[page.videoId];
  $('milestone').textContent = SOURCES[page.videoId] || '';
  $('srcTitle').textContent = page.title || page.videoId || '';
  $('srcTime').textContent = fmt(page.t || 0);

  const notes = session.notes;
  // Just the count. Acks and stars are reactions, not a queue you owe.
  $('count').textContent = notes.length ? `${notes.length} note${notes.length === 1 ? '' : 's'}` : '';

  if (view === 'main') renderQueue(notes);
}

function renderQueue(notes) {
  const q = $('queue'); q.textContent = '';
  for (const n of [...notes].sort((a, b) => b.t - a.t || b.createdAt.localeCompare(a.createdAt))) q.appendChild(renderNote(n));
}

function renderNote(n) {
  const row = el('div', 'jot');
  const meta = el('p', 'meta'); meta.appendChild(el('span', 'avatar', 'K')); meta.appendChild(el('b', null, 'Kaushik')); meta.appendChild(document.createTextNode(` · ${ago(n.createdAt)}`));
  if (open.has(n.id)) { const at = el('button', 'at', `at ${fmt(n.t)}`); at.title = 'Jump the lecture to this moment'; at.onclick = () => seek(n.t); meta.appendChild(at); }
  const st = el('button', 'star' + (starred(n, 'note') ? ' on' : ''), starred(n, 'note') ? '★' : '☆'); st.title = 'Star: a thing to remember'; st.onclick = () => star(n, 'note'); meta.appendChild(st);
  const more = el('button', 'more', '⋯'); more.title = 'Edit or delete'; more.onclick = () => { menu = menu === n.id ? null : n.id; confirmDelete = null; render(); }; meta.appendChild(more);
  row.appendChild(meta);
  const body = el('div');
  if (editing && editing.id === n.id) {
    const ta = el('textarea', 'edit'); ta.value = editing.text; ta.rows = 2;
    ta.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); editNote(n, ta.value); } if (e.key === 'Escape') { editing = null; render(); } };
    body.appendChild(ta); body.appendChild(el('p', 'hint', 'Enter saves, Escape cancels. The replies stay as they are.'));
    setTimeout(() => ta.focus(), 0);
  } else body.appendChild(el('p', 'txt', n.text));
  if (menu === n.id && !(editing && editing.id === n.id)) {
    const acts = el('div', 'acts');
    const ed = el('button', null, 'Edit'); ed.onclick = () => { editing = { id: n.id, text: n.text }; render(); }; acts.appendChild(ed);
    if (confirmDelete === n.id) { const d = el('button', 'danger', 'Delete this note and everything under it'); d.onclick = () => deleteNote(n); acts.appendChild(d); }
    else { const d = el('button', null, 'Delete'); d.onclick = () => { confirmDelete = n.id; render(); }; acts.appendChild(d); }
    body.appendChild(acts);
  }
  const replies = repliesFor(n.id);
  if (n.pending) body.appendChild(el('p', 'pending', n.pending === 'answer' ? 'Answering…' : n.pending === 'check' ? 'Reading…' : n.pending === 'deeper' ? 'Thinking…' : 'Building…'));
  if (replies.length && !open.has(n.id)) {
    const last = replies[replies.length - 1];
    const line = el('button', 'collapsed' + (last.kind === 'error' ? ' error' : ''));
    // No status word: the title says it was answered, the gold says it was
    // corrected, and "N replies" says there is more.
    if (last.kind === 'check') line.appendChild(document.createTextNode((last.correction || '').split(/(?<=[.!?])\s/)[0].slice(0, 60) + '…'));
    else if (last.kind === 'error') line.appendChild(el('b', null, 'Could not answer'));
    else line.appendChild(document.createTextNode(last.title || (last.kind === 'you' ? 'You replied' : last.kind === 'widget' ? 'Built' : '')));
    line.appendChild(el('span', 'n' + (awaiting(n).length ? ' open' : ''), `${replies.length} ${replies.length === 1 ? 'reply' : 'replies'}`));
    line.onclick = () => { open.add(n.id); render(); };
    body.appendChild(line);
  } else if (replies.length) {
    for (const r of replies) body.appendChild(renderReply(n, r));
    body.appendChild(renderFollowUp(n));
    const close = el('button', 'linkbtn', 'Collapse'); close.onclick = () => { open.delete(n.id); render(); }; body.appendChild(close);
  }
  row.appendChild(body);
  return row;
}

function ago(iso) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}
function clock(iso) { const d = new Date(iso); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; }

// One anchor, on the who-line, like the note's own. The rest stay in the data.
function citeLink(cites) {
  const x = (cites || [])[0]; if (!x) return null;
  const b = el('button', 'at', `at ${fmt(x.t)}`); b.title = 'Jump the lecture to this moment'; b.onclick = () => seek(x.t);
  return b;
}

function renderReply(n, r) {
  const box = el('div', 'reply' + (r.kind === 'check' ? ' check' : '') + (r.kind === 'you' ? ' you' : '') + (r.kind === 'check' && n.overruled ? ' overruled' : ''));
  if (r.kind === 'you') {
    const w = el('p', 'who'); w.appendChild(el('span', 'avatar', 'K')); w.appendChild(el('b', null, 'Kaushik')); w.appendChild(document.createTextNode(` · ${ago(r.at)}`)); box.appendChild(w);
    box.appendChild(el('p', 'txt', r.text));
    return box;
  }
  const who = el('p', 'who');
  const label = { you: 'Kaushik', answer: 'TA', deeper: 'TA · thought about it', check: 'TA · on what you wrote', widget: 'TA · built', error: 'TA' }[r.kind] || r.kind;
  who.appendChild(el('span', 'avatar ta', 'TA'));
  who.appendChild(el('b', null, label));
  who.appendChild(document.createTextNode(` · ${ago(r.at)}`));
  const at = citeLink(r.cites); if (at) who.appendChild(at);
  box.appendChild(who);
  if (r.title && r.kind !== 'check') box.appendChild(el('p', 'rtitle', r.title));
  if (r.fromLecture) box.appendChild(el('p', 'why', 'From the lecture only, no notes for this video yet.'));
  if (TA_KINDS.includes(r.kind)) {
    const acked = (n.acks || []).includes(r.id);
    const b = el('button', 'ack' + (acked ? ' on' : ''), acked ? '👍 ok' : '👍');
    b.title = acked ? 'Acknowledged' : 'Nothing more needed on this';
    if (!acked) b.onclick = () => ack(n, r);
    who.appendChild(b);
    const st = el('button', 'star' + (starred(n, r.id) ? ' on' : ''), starred(n, r.id) ? '★' : '☆'); st.title = 'Star: a thing to remember'; st.onclick = () => star(n, r.id); who.appendChild(st);
  }

  if (r.kind === 'answer' || r.kind === 'deeper') {
    box.appendChild(el('p', 'body', r.body));
    if (r.kind === 'deeper' && r.why) box.appendChild(el('p', 'why', (r.changed ? 'Changed: ' : 'Unchanged. ') + r.why));
  } else if (r.kind === 'check') {
    box.appendChild(el('p', 'claim', `“${r.claim}”`));
    box.appendChild(el('p', 'body', r.correction));
    const acts = el('div', 'acts');
    if (n.overruled) { const s = el('span', 'state'); s.appendChild(el('b', null, 'Kept your version')); const u = el('button', null, 'Undo'); u.onclick = async () => { n.overruled = false; await saveSession(); render(); }; acts.appendChild(s); acts.appendChild(u); }
    else { const f = el('button', null, 'Keep my version'); f.onclick = async () => { n.overruled = true; await saveSession(); render(); }; acts.appendChild(f); }
    box.appendChild(acts);
  } else if (r.kind === 'widget') {
    box.appendChild(renderWidget(r));
  } else if (r.kind === 'error') {
    box.appendChild(el('p', 'body', `Could not answer: ${r.error || 'unknown'}`));
    const acts = el('div', 'acts'); const again = el('button', null, 'Try again'); again.onclick = () => route(n); acts.appendChild(again); box.appendChild(acts);
  }
  return box;
}

// The thread is a conversation: a follow-up is answered with the thread in
// view; the desk escalates to the reasoning pass when the notes are not
// enough, and builds a widget when you ask for something to play with. No
// buttons for either; it just takes a little longer.
function renderFollowUp(n) {
  const box = el('div', 'followup');
  const ta = el('textarea'); ta.rows = 1; ta.placeholder = 'Reply… Enter sends.';
  ta.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); const v = ta.value.trim(); if (v) { ta.value = ''; ask('answer', n, { followUp: v }); } } };
  box.appendChild(ta);
  return box;
}

// ---------- widgets ----------
function renderWidget(r) {
  const t = $('tpl-widget').content.firstElementChild.cloneNode(true);
  t.querySelector('.wname').textContent = r.title;
  t.querySelector('.wgen').textContent = ago(r.at);
  t.querySelector('.wnote').textContent = r.note;
  const frame = t.querySelector('.wframe');
  frame.src = settings.deskUrl.replace(/\/$/, '') + '/widget/runtime';
  const theme = getComputedStyle(document.documentElement);
  const vars = {}; for (const k of ['--bg', '--card', '--ink', '--muted', '--line', '--gold', '--gold-soft', '--sans', '--mono']) vars[k] = theme.getPropertyValue(k).trim();
  frame.addEventListener('load', () => frame.contentWindow.postMessage({ type: 'spec', spec: { title: r.title, note: r.note, inputs: r.inputs, outputs: r.outputs, compute: r.compute }, vars }, '*'));
  return t;
}
window.addEventListener('message', e => {
  if (e.data?.type === 'height') for (const f of document.querySelectorAll('.wframe')) if (f.contentWindow === e.source) f.style.height = Math.min(480, Math.max(80, e.data.height)) + 'px';
  if (e.data?.type === 'error') status(`widget: ${e.data.message}`);
});

// ---------- settings ----------
async function loadSettings() { settings = await store.get('settings', settings); $('deskUrl').value = settings.deskUrl; $('deskToken').value = settings.token; }
async function saveSettings() {
  settings = { deskUrl: $('deskUrl').value.trim(), token: $('deskToken').value.trim() };
  await store.set('settings', settings); status('Saved.'); view = 'main'; render(); mergeFromDesk();
}
async function testDesk() {
  try {
    const url = $('deskUrl').value.trim().replace(/\/$/, '');
    const h = await (await fetch(url + '/api/health')).json();
    const ok = await fetch(url + '/api/notes?source=7xTGNNLPyMI', { headers: { 'x-ta-token': $('deskToken').value.trim() } });
    status(`Desk ${h.ok ? 'up' : 'unhealthy'} · ${h.brain?.notes || 0} notes · ${h.mock ? 'mock model' : h.models?.composer} · token ${ok.status === 200 ? 'ok' : 'rejected'}`);
  } catch (e) { status(`Desk unreachable: ${e.message}`); }
}

// ---------- wire ----------
$('jot').addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    const v = $('jot').value.trim(); if (!v) return;
    $('jot').value = '';
    addNote(v);
  }
});
$('backBtn').onclick = () => { view = 'main'; render(); };
$('settingsBtn').onclick = () => { view = view === 'settings' ? 'main' : 'settings'; render(); };
$('saveSettings').onclick = saveSettings;
$('testDesk').onclick = testDesk;
$('grantAccess').onclick = async () => {
  try { hasAccess = await api.permissions.request(YT); } catch (e) { status(`could not request access: ${e.message}`); }
  render(); if (hasAccess) status('Allowed. Reload the lecture tab once.');
};

(async () => {
  await loadSettings();
  await checkAccess();
  await pollPage();
  tick = setInterval(pollPage, 2000);
  api.tabs.onActivated?.addListener(pollPage);
})();
