// The sidebar. Local-first: every note lands in browser.storage.local at once
// and the desk catches up. Replies come from the desk and are stored beside
// the notes so the panel renders the same offline. Nothing here pops, badges
// or auto-expands: a reply is one muted line under the note until opened.
//
// Renderer fields (kept in step with desk/contract.js — tests/contract.test.js
// greps this file): concept title body cites widgetHint enough verdict claim
// correction changed why inputs outputs compute note text.

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
  if (!res.ok) throw new Error(data.error || `desk ${res.status}`);
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
    for (const n of r.notes || []) if (!byId.has(n.id)) session.notes.push({ ...n, status: 'synced' });
    const seen = new Set(session.replies.map(x => x.id));
    for (const x of r.replies || []) if (!seen.has(x.id)) session.replies.push(x);
    session.notes.sort((a, b) => a.t - b.t || a.createdAt.localeCompare(b.createdAt));
    await saveSession(); render();
  } catch (e) { status(`desk: ${e.message}`); }
}
async function pushNote(n) {
  if (!haveDesk()) return;
  try { await desk('/api/notes', { method: 'PUT', body: { source: page.videoId, note: { id: n.id, text: n.text, tags: n.tags, t: n.t, createdAt: n.createdAt } } }); n.status = 'synced'; }
  catch (e) { n.status = 'local'; status(`desk: ${e.message}`); }
  await saveSession();
}
async function ask(mode, n, extra = {}) {
  if (!haveDesk()) return null;
  n.pending = mode; render();
  try {
    const r = await desk('/api/ask', { method: 'POST', body: { mode, source: { id: page.videoId, title: page.title }, note: { id: n.id, text: n.text, tags: n.tags, t: n.t }, ...extra } });
    if (r.you) session.replies.push(r.you);
    if (r.reply) session.replies.push(r.reply);
    return r.reply;
  } catch (e) {
    session.replies.push({ id: `${n.id}-e${Date.now()}`, noteId: n.id, kind: 'error', at: new Date().toISOString(), error: e.message });
    return null;
  } finally { n.pending = null; await saveSession(); render(); }
}

// ---------- notes ----------
async function addNote(raw, ask) {
  const text = raw.replace(/\s+/g, ' ').trim();
  const tags = ask ? ['#doubt'] : [];
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
  $('milestone').hidden = !onSource;
  $('milestone').textContent = SOURCES[page.videoId] || 'Lecture';
  $('srcTitle').textContent = page.title || page.videoId || '';
  $('srcTime').textContent = fmt(page.t || 0);

  const notes = session.notes;
  const answered = notes.filter(n => repliesFor(n.id).some(r => r.kind === 'answer' || r.kind === 'deeper')).length;
  const checks = notes.filter(n => repliesFor(n.id).some(r => r.kind === 'check' && !n.overruled)).length;
  $('count').textContent = notes.length ? `${notes.length} note${notes.length === 1 ? '' : 's'}${answered ? ` · ${answered} answered` : ''}${checks ? ` · ${checks} corrected` : ''}` : '';

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
  row.appendChild(meta);
  const body = el('div');
  body.appendChild(el('p', 'txt', n.text));
  const replies = repliesFor(n.id);
  if (n.pending) body.appendChild(el('p', 'pending', n.pending === 'answer' ? 'Answering…' : n.pending === 'check' ? 'Reading…' : n.pending === 'deeper' ? 'Thinking…' : 'Building…'));
  if (replies.length && !open.has(n.id)) {
    const last = replies[replies.length - 1];
    const line = el('button', 'collapsed ' + (last.kind === 'check' ? 'check' : last.kind === 'error' ? 'error' : ''));
    const label = { you: 'You replied', answer: 'Answered', deeper: 'Answered', check: 'On what you wrote', widget: 'Built', error: 'Could not answer' }[last.kind] || last.kind;
    const b = el('b', null, label); line.appendChild(b);
    line.appendChild(document.createTextNode(` · ${last.title || last.claim?.slice(0, 40) || ''}`));
    line.appendChild(el('span', 'n', `${replies.length} ${replies.length === 1 ? 'reply' : 'replies'}`));
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

function renderCites(cites) {
  const c = el('div', 'cites');
  for (const x of cites || []) { const b = el('button', 'cite', `${x.src === page.videoId ? '' : x.src + ' '}${fmt(x.t)}`); b.title = 'Jump'; b.onclick = () => seek(x.t); c.appendChild(b); }
  return c;
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
  who.appendChild(document.createTextNode(` · ${ago(r.at)}${r.title ? ' · ' + r.title : ''}`));
  box.appendChild(who);

  if (r.kind === 'answer' || r.kind === 'deeper') {
    box.appendChild(el('p', 'body', r.body));
    if (r.kind === 'deeper' && r.why) box.appendChild(el('p', 'why', (r.changed ? 'Changed: ' : 'Unchanged. ') + r.why));
    box.appendChild(renderCites(r.cites));
    const acts = el('div', 'acts');
    acts.appendChild(actionPoke(n, r));
    box.appendChild(acts);
  } else if (r.kind === 'check') {
    box.appendChild(el('p', 'claim', `“${r.claim}”`));
    box.appendChild(el('p', 'body', r.correction));
    box.appendChild(renderCites(r.cites));
    const acts = el('div', 'acts');
    acts.appendChild(actionPoke(n, r));
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

function actionPoke(n, r) {
  const built = repliesFor(n.id).some(x => x.kind === 'widget');
  if (built) { const s = el('span', 'state'); s.appendChild(el('b', null, 'Built')); return s; }
  const b = el('button', null, r.kind === 'check' ? 'Show me' : 'Poke at it');
  b.onclick = () => ask('widget', n, { reply: r });
  return b;
}

// The thread is a conversation: a follow-up is answered with the thread in
// view, and the desk escalates to the reasoning pass when the notes are not
// enough. No button for that; it just takes a little longer.
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
  t.querySelector('.wgen').textContent = `built ${ago(r.at)}`;
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
    const ask = $('askTa').checked;
    $('jot').value = ''; $('askTa').checked = false;   // resets: per note, never a mode
    addNote(v, ask);
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
