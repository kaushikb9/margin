#!/usr/bin/env node
// One post per video into the brain, from everything on the desk for it.
//   TA_HOST=https://margin-3d0.pages.dev TA_TOKEN=… node scripts/brain.mjs <videoId>
//   node scripts/brain.mjs <videoId> --from sessions/<videoId>/<date>.json   (tests; refuses to run against localhost otherwise)
//
// Writes ~/Code/brain/site/posts/YYYY-MM-DD-<slug>.html (dated to the first
// note, never renamed — a second run finds the file by slug and rewrites it),
// inserts or replaces its index row between <!-- margin:<id> --> markers in
// the right month, keeping the index newest-first, and runs the brain's own
// check. Nothing is committed or deployed: that stays KB's.
//
// The post follows brain/skills/brain-post.md: plain HTML, no script, one
// keep block. The keep block sits at the top: a concise summary of what KB
// starred, written by the deeper model from the starred lines and nothing
// else, cached in sessions/<video>/summary.json until the stars change. With
// nothing starred this script refuses. Below it, the raw thread, with a ★ on
// every starred line. Nothing is repeated. Widgets: a one-line marker.
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { chat } from '../desk/client.js';
import { modelFor } from '../desk/models.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const BRAIN = process.env.BRAIN_DIR || join(homedir(), 'Code', 'brain');
const args = process.argv.slice(2);
const videoId = args.find(a => !a.startsWith('--'));
const fromIdx = args.indexOf('--from');
const fromFile = fromIdx >= 0 ? args[fromIdx + 1] : null;
if (!videoId) { console.error('usage: brain.mjs <videoId> [--from session.json]'); process.exit(2); }

// ---- load: live desk, or a session file for tests ----
let session;
if (fromFile) {
  session = JSON.parse(readFileSync(fromFile, 'utf8'));
} else {
  const host = (process.env.TA_HOST || '').replace(/\/$/, '');
  const token = process.env.TA_TOKEN || '';
  if (!host || !token) { console.error('brain: set TA_HOST and TA_TOKEN (the live desk), or pass --from <session.json>'); process.exit(2); }
  if (/localhost|127\.0\.0\.1/.test(host)) { console.error('brain: refusing to write a post from a local desk; use the live one'); process.exit(2); }
  const r = await fetch(`${host}/api/notes?source=${encodeURIComponent(videoId)}`, { headers: { 'x-ta-token': token } });
  if (!r.ok) { console.error(`brain: desk ${r.status} ${await r.text().catch(() => '')}`); process.exit(1); }
  const { notes, replies } = await r.json();
  const byNote = new Map(notes.map(n => [n.id, { ...n, replies: [] }]));
  for (const x of replies) byNote.get(x.noteId)?.replies.push(x);
  session = { source: videoId, exportedAt: new Date().toISOString(), notes: [...byNote.values()] };
}
let tx = null; try { tx = JSON.parse(readFileSync(join(root, 'site/transcripts', videoId + '.json'), 'utf8')); } catch { /* unknown to the brain: title from the session */ }
const title = tx?.title || session.title || videoId;
const notes = session.notes.filter(n => n.text?.trim()).sort((a, b) => a.t - b.t || (a.createdAt || '').localeCompare(b.createdAt || ''));
if (!notes.length) { console.error(`brain: no notes on ${videoId}`); process.exit(1); }

// ---- helpers ----
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = t => { t = Math.max(0, Math.floor(t || 0)); const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60; return (h ? `${h}:${String(m).padStart(2, '0')}` : String(m)) + ':' + String(s).padStart(2, '0'); };
const yt = t => `https://www.youtube.com/watch?v=${videoId}&t=${Math.floor(t)}s`;
const day = iso => { const d = new Date(iso); return `${d.getDate()} ${d.toLocaleString('en-GB', { month: 'long' })} ${d.getFullYear()}`; };
const dayShort = iso => { const d = new Date(iso); return `${String(d.getDate()).padStart(2, '0')} ${d.toLocaleString('en-GB', { month: 'short' }).slice(0, 3)}`; };  // 'Sep', like the hand rows; newer ICU says 'Sept'
const monthOf = iso => { const d = new Date(iso); return `${d.toLocaleString('en-GB', { month: 'long' })} ${d.getFullYear()}`; };
const isQuestion = s => /\?\s*$|^(how|why|what|when|where|which|who|is|are|does|do|did|can|could|would|should|will)\b/i.test(s.trim());
const TA = ['answer', 'deeper', 'check', 'widget'];
const lastCheck = n => [...(n.replies || [])].reverse().find(r => r.kind === 'check');
const firstDate = notes.map(n => n.createdAt).filter(Boolean).sort()[0] || session.exportedAt;
const lastDate = [...notes.map(n => n.createdAt), ...notes.flatMap(n => (n.replies || []).map(r => r.at))].filter(Boolean).sort().at(-1) || firstDate;
const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

// ---- the keep block: stars, or refuse ----
const starred = [];
for (const n of notes) {
  const stars = n.stars || [];
  if (stars.includes('note')) starred.push({ t: n.t, who: 'me', text: n.text });
  for (const r of n.replies || []) if (stars.includes(r.id) && TA.includes(r.kind)) starred.push({ t: n.t, who: 'ta', text: r.kind === 'check' ? r.correction : r.body || r.title });
}
if (!starred.length) { console.error(`brain: nothing starred on ${videoId} — star at least one note or reply in margin; a post with nothing to remember is not finished`); process.exit(3); }

// ---- things to remember: a concise summary of the stars, cached until they change ----
const starHash = createHash('sha1').update(starred.map(x => x.text).join('\n')).digest('hex').slice(0, 12);
const cacheDir = join(root, 'sessions', videoId); mkdirSync(cacheDir, { recursive: true });
const cachePath = join(cacheDir, 'summary.json');
let summaryText = null;
try { const c = JSON.parse(readFileSync(cachePath, 'utf8')); if (c.hash === starHash) summaryText = c.text; } catch { /* none yet */ }
if (!summaryText) {
  // The key comes from the environment or margin's .dev.vars, never from a file in the brain.
  let key = process.env.OPENROUTER_API_KEY;
  if (!key) try { key = readFileSync(join(root, '.dev.vars'), 'utf8').match(/^OPENROUTER_API_KEY=(.+)$/m)?.[1]?.trim(); } catch { /* absent */ }
  if (!key || process.env.TA_MOCK === '1') {
    // No model: the starred lines themselves, first sentence each. Deterministic; used by the tests.
    summaryText = starred.map(x => x.text.split(/(?<=[.!?])\s/)[0]).join('\n');
    if (!process.env.TA_MOCK) console.error('brain: no OPENROUTER_API_KEY; the keep block is the starred lines verbatim, not a summary');
  } else {
    const env = { OPENROUTER_API_KEY: key, ...process.env };
    const system = `KB starred these lines while studying a lecture: some are his own notes, some are a teaching assistant's replies. Write "the things to remember" from them: the few ideas that matter, each in one plain sentence, in KB's own voice (first person where the line is his). Use only what the lines say; no new facts, no numbers that are not in the lines. At most 6 sentences, under 120 words, no headings, no bullets, no em dashes. Return ONLY a JSON object: {"text": "<the sentences, separated by newlines>"}`;
    const user = starred.map((x, i) => `${i + 1}. [${x.who === 'ta' ? 'TA' : 'me'}] ${x.text}`).join('\n\n');
    const words = t => t.trim().split(/\s+/).filter(Boolean).length;
    const parse = c => { const m = c.match(/"text"\s*:\s*"((?:[^"\\]|\\.)*)"/s); try { return m ? JSON.parse('"' + m[1] + '"').trim() : ''; } catch { return ''; } };
    let r = await chat({ model: modelFor('deeper', env), system, user, job: 'deeper', env });
    let text = parse(r.content);
    if (words(text) > 120) {
      // Once more, with the overrun named. Models treat "under 120 words" as advice.
      r = await chat({ model: modelFor('deeper', env), system, user: `${user}\n\nYour previous reply was ${words(text)} words. The limit is 120. Keep the ${Math.min(6, text.split(/\n+/).length)} most important sentences and cut the rest.`, job: 'deeper', env });
      const again = parse(r.content); if (again) text = again;
    }
    if (!text || /[<>]/.test(text)) { console.error('brain: the summary came back empty or unusable; nothing written'); process.exit(1); }
    if (words(text) > 120) {
      // Still over: keep whole sentences up to the limit rather than refuse.
      const lines = []; let n = 0;
      for (const l of text.split(/\n+/)) { const w = words(l); if (n + w > 120 && lines.length) break; lines.push(l); n += w; }
      console.error(`brain: summary was ${words(text)} words after a retry; kept the first ${lines.length} lines (${n} words)`);
      text = lines.join('\n');
    }
    summaryText = text;
    writeFileSync(cachePath, JSON.stringify({ hash: starHash, text, model: r.model, at: new Date().toISOString() }, null, 1));
  }
}
const keepHtml = summaryText.split(/\n+/).map(l => `  <p>${esc(l.trim())}</p>`).filter(l => l.length > 11).join('\n');

// ---- the margin ----
const STAR = '<span class="star" title="Starred">★</span> ';
function replyHtml(r, n) {
  const st = (n.stars || []).includes(r.id) ? STAR : '';
  if (r.kind === 'you') return `<div class="ta you"><span class="who"><b>Me</b></span><p>${esc(r.text)}</p></div>`;
  if (r.kind === 'answer' || r.kind === 'deeper') return `<div class="ta"><span class="who">${st}<b>TA</b>${r.title ? ' · ' + esc(r.title) : ''}${r.fromLecture ? ' · from the lecture only' : ''}${cite(r)}</span><p>${esc(r.body)}</p></div>`;
  if (r.kind === 'check') return `<div class="ta check"><span class="who">${st}<b>TA, on what I wrote</b>${cite(r)}</span><p>${esc(r.correction)}</p>${n.overruled ? '<p class="kept">I kept my version.</p>' : ''}</div>`;
  if (r.kind === 'widget') return `<div class="ta"><span class="who"><b>TA</b> built a widget here: ${esc(r.title)}</span></div>`;
  return '';
}
const cite = r => (r.cites?.[0] ? ` · <a href="${yt(r.cites[0].t)}">${esc(fmt(r.cites[0].t))}</a>` : '') + (r.model && r.model !== 'mock' ? ` <span class="model">${esc(r.model.replace(/^[^/]+\//, ''))}</span>` : '');
const threadHtml = notes.map(n => `  <li>
    <span class="at"><a href="${yt(n.t)}">${esc(fmt(n.t))}</a></span>
    <p class="me">${(n.stars || []).includes('note') ? STAR : ''}${esc(n.text)}</p>
${(n.replies || []).map(r => replyHtml(r, n)).filter(Boolean).map(h => '    ' + h).join('\n')}
  </li>`).join('\n');

const statements = notes.filter(n => !isQuestion(n.text));
const questions = notes.length - statements.length;
const corrected = statements.filter(n => lastCheck(n) && !n.overruled).length;
const summary = `${tx ? `${Math.round((tx.segments.at(-1)?.t || 0) / 60)} minutes of lecture. ` : ''}My notes in the margin as I watched, the TA's replies under them${corrected ? `, and ${corrected === 1 ? 'one thing' : corrected + ' things'} I wrote down confidently that ${corrected === 1 ? 'was' : 'were'} wrong` : ''}. ${notes.length} notes, ${questions} of them questions.`;

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(title)}</title>
<link rel="icon" href="/icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<meta name="theme-color" content="#1c1b18">
<link rel="stylesheet" href="/tokens.css?v=__TOKENS_V__">
<link rel="stylesheet" href="/post.css?v=__POST_V__">
</head>
<body class="post">

<header>
  <div class="date">Last added ${esc(day(lastDate))} · from ${esc(day(firstDate))}</div>
  <h1>${esc(title)}</h1>
  <p class="summary">${esc(summary)}</p>
</header>

<div class="keep">
  <span class="eyebrow">Things to remember</span>
${keepHtml}
</div>

<h2>In the margin</h2>
<ul class="thread">
${threadHtml}
</ul>

<footer><a href="/">← All posts</a></footer>

</body>
</html>
`;

// ---- write, matching the index's ?v= numbers ----
const indexPath = join(BRAIN, 'site/index.html');
let index = readFileSync(indexPath, 'utf8');
const v = css => index.match(new RegExp(`/${css}\\.css\\?v=(\\d+)`))?.[1];
if (!v('tokens') || !v('post')) { console.error('brain: could not read ?v= numbers from site/index.html'); process.exit(1); }
const postsDir = join(BRAIN, 'site/posts');
const existing = readdirSync(postsDir).find(f => f.endsWith(`-${slug}.html`));
const file = existing || `${firstDate.slice(0, 10)}-${slug}.html`;
writeFileSync(join(postsDir, file), html.replace('__TOKENS_V__', v('tokens')).replace('__POST_V__', v('post')));
const clean = file.replace(/\.html$/, '');

// ---- the index row, between markers, in the right month, newest first ----
const row = `<!-- margin:${videoId} -->
    <li>
      <span class="day">${esc(dayShort(file.slice(0, 10)))}</span>
      <div>
        <a class="title" href="/posts/${clean}">${esc(title)}</a>
        <div class="why">Karpathy's lecture with my notes in the margin: ${notes.length} notes${corrected ? `, ${corrected} of my own claims corrected` : ''}.</div>
      </div>
    </li>
    <!-- /margin -->`;
const markerRe = new RegExp(`<!-- margin:${videoId} -->[\\s\\S]*?<!-- /margin -->`);
if (markerRe.test(index)) index = index.replace(markerRe, row);
else {
  const month = monthOf(file.slice(0, 10));
  const secRe = new RegExp(`(<section class="month">\\s*<span class="eyebrow">${month}</span>\\s*<ul class="posts">\\n)([\\s\\S]*?)(\\s*</ul>)`);
  const m = index.match(secRe);
  if (m) {
    // insert before the first existing row whose filename date is older than ours
    const lis = m[2].split(/(?=\s*(?:<!-- margin:[^>]+ -->\s*)?<li>)/).filter(s => s.trim());
    const dateOf = li => li.match(/href="\/posts\/(\d{4}-\d{2}-\d{2})/)?.[1] || '0000-00-00';
    const mine = file.slice(0, 10);
    let at = lis.findIndex(li => dateOf(li) < mine); if (at < 0) at = lis.length;
    lis.splice(at, 0, '    ' + row);
    index = index.replace(secRe, `$1${lis.join('\n')}$3`);
  } else {
    const section = `<section class="month">\n  <span class="eyebrow">${month}</span>\n  <ul class="posts">\n    ${row}\n  </ul>\n</section>\n\n`;
    index = index.replace(/(<!-- Newest first[\s\S]*?-->\n\n)/, `$1${section}`);
  }
}
writeFileSync(indexPath, index);

// ---- the brain's own check ----
try { execFileSync('npm', ['test'], { cwd: BRAIN, stdio: 'pipe' }); }
catch (e) { console.error(`brain: the brain's check failed after writing ${file}:\n${e.stdout?.toString().split('\n').filter(l => /✖|not ok|Error/.test(l)).slice(0, 8).join('\n')}`); process.exit(1); }
console.log(`brain: ${existing ? 'rewrote' : 'wrote'} site/posts/${file} — ${notes.length} notes, ${starred.length} starred → ${summaryText.split(/\n+/).length} lines to remember, ${corrected} corrected; index row ${markerRe.test(readFileSync(indexPath, 'utf8')) ? 'in place' : 'added'}; brain check green. Commit and deploy the brain when you are ready.`);
