#!/usr/bin/env node
// Render one session file into class notes: the threaded notebook (KB's
// notes in time order, replies nested) with a concept index on top. Pure
// rendering — nothing is generated; the index lines are the replies' own
// first sentences. Output is a self-contained page for a Claude artifact,
// widgets running inline. (Decided 2026-09-10: B as spine, C as index, one
// document per session.)
//   node scripts/notes.mjs sessions/<videoId>/<date>.json [out.html]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, basename } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const [inPath, outArg] = process.argv.slice(2);
if (!inPath) { console.error('usage: notes.mjs sessions/<videoId>/<date>.json [out.html]'); process.exit(2); }
const session = JSON.parse(readFileSync(inPath, 'utf8'));
const brain = ['d1', 'd2'].flatMap(d => JSON.parse(readFileSync(join(root, 'site/brain', d + '.json'), 'utf8')).notes);
const byConcept = new Map(brain.map(n => [n.id, n]));
let tx = null; try { tx = JSON.parse(readFileSync(join(root, 'site/transcripts', session.source + '.json'), 'utf8')); } catch { /* optional */ }

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = t => { t = Math.max(0, Math.floor(t || 0)); const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60; return (h ? `${h}:${String(m).padStart(2, '0')}` : String(m)) + ':' + String(s).padStart(2, '0'); };
const clock = iso => { const d = new Date(iso); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const firstSentences = (s, n = 2) => (s || '').split(/(?<=[.!?])\s+/).slice(0, n).join(' ');
const date = session.exportedAt.slice(0, 10);
const title = tx?.title || session.source;
const yt = t => `https://www.youtube.com/watch?v=${session.source}&t=${Math.floor(t)}s`;
const cites = cs => (cs || []).map(c => `<a class="cite" href="${yt(c.t)}" target="_blank" rel="noopener">${esc(fmt(c.t))}</a>`).join('');

const notes = session.notes.slice().sort((a, b) => a.t - b.t);
const last = n => [...(n.replies || [])].reverse().find(r => ['answer', 'deeper', 'check'].includes(r.kind));

// ---- concept index (C) ----
const touched = new Map();
for (const n of notes) for (const r of n.replies || []) if (r.concept && byConcept.has(r.concept)) {
  if (!touched.has(r.concept)) touched.set(r.concept, []);
  touched.get(r.concept).push({ note: n, reply: r });
}
const indexHtml = [...touched.entries()].map(([cid, hits]) => {
  const c = byConcept.get(cid);
  const anchor = c.anchors.find(a => a.src === session.source) || c.anchors[0];
  const rows = hits.map(({ note, reply }) => {
    const you = `<div class="row"><span class="k">${reply.kind === 'check' ? 'You wrote' : 'You asked'}</span><a class="kb" href="#n-${esc(note.id)}">${esc(note.text)}</a></div>`;
    const line = reply.kind === 'check'
      ? `<div class="row"><span class="k">What’s right</span><span>${esc(firstSentences(reply.correction))}</span></div>`
      : `<div class="row"><span class="k">Answer</span><span>${esc(firstSentences(reply.body))}</span></div>`;
    return you + line;
  }).join('');
  const poke = hits.some(h => (h.note.replies || []).some(r => r.kind === 'widget')) ? `<div class="row"><span class="k">Poke</span><span class="muted">built — in the thread</span></div>` : '';
  return `<div class="concept" id="c-${esc(cid)}"><h3>${esc(c.title)} <span class="caption">· ${esc(cid)}</span></h3>
  <div class="row"><span class="k">Lecture</span><span class="muted">“${esc(anchor.quote)}” · <a href="${yt(anchor.t)}" target="_blank" rel="noopener">${esc(fmt(anchor.t))}</a></span></div>${rows}${poke}</div>`;
}).join('\n');

// ---- threaded notebook (B) ----
let widgetSeq = 0; const widgets = [];
function replyHtml(r, note) {
  const who = { answer: 'TA', deeper: 'TA · deeper', check: 'Check this', widget: 'TA · built', error: 'TA' }[r.kind] || r.kind;
  if (r.kind === 'answer' || r.kind === 'deeper') return `<div class="reply"><p class="who"><b>${who}</b> · ${esc(r.title || '')} · ${clock(r.at)}</p>${r.kind === 'deeper' && r.why ? `<p class="why">${r.changed ? 'Changed: ' : 'Unchanged. '}${esc(r.why)}</p>` : ''}<p class="body">${esc(r.body)}</p><div class="cites">${cites(r.cites)}</div></div>`;
  if (r.kind === 'check') return `<div class="reply check${note.overruled ? ' overruled' : ''}"><p class="who"><b>${who}</b> · ${clock(r.at)}</p><p class="kb">“${esc(r.claim)}”</p><p class="body">${esc(r.correction)}</p><div class="cites">${cites(r.cites)}</div>${note.overruled ? '<p class="why">You kept your version.</p>' : ''}</div>`;
  if (r.kind === 'widget') { const id = 'w' + (++widgetSeq); widgets.push({ id, spec: { title: r.title, note: r.note, inputs: r.inputs, outputs: r.outputs, compute: r.compute } }); return `<div class="widget" id="${id}"><span class="wname">${esc(r.title)} · built ${clock(r.at)}</span><div class="wbody"></div><p class="caption">${esc(r.note)}</p></div>`; }
  if (r.kind === 'error') return `<div class="reply"><p class="who"><b>TA</b> · ${clock(r.at)}</p><p class="body muted">Could not answer: ${esc(r.error || '')}</p></div>`;
  return '';
}
const threadHtml = notes.map(n => `<div class="jot" id="n-${esc(n.id)}"><a class="at" href="${yt(n.t)}" target="_blank" rel="noopener">${esc(fmt(n.t))}</a><div><p class="txt">${esc(n.text)}${(n.tags || []).map(t => ` <span class="tag">${esc(t)}</span>`).join('')}</p>${(n.replies || []).map(r => replyHtml(r, n)).join('') || '<p class="caption" style="margin-top:0.25rem">No reply. The check found nothing.</p>'}</div></div>`).join('\n');

const html = `<title>Class notes · ${esc(title)} · ${date}</title>
<style>
:root { --bg:#faf8f4; --ink:#1c1b18; --muted:#78736a; --line:#e6e1d7; --card:#ffffff; --gold:#a8720a; --gold-soft:#f4ead2; --sans:-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",Roboto,sans-serif; --serif:"Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif; --mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; --t-body:17px; --t-item:15.5px; --t-second:15px; --t-caption:13px; color-scheme: light dark; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg:#131210; --ink:#e8e4dc; --muted:#8f887c; --line:#2a2721; --card:#1b1916; --gold:#e0b04f; --gold-soft:#2e2718; } }
:root[data-theme="dark"] { --bg:#131210; --ink:#e8e4dc; --muted:#8f887c; --line:#2a2721; --card:#1b1916; --gold:#e0b04f; --gold-soft:#2e2718; }
* { box-sizing:border-box; } html { background:var(--bg); }
body { margin:0; background:var(--bg); color:var(--ink); font:400 var(--t-body)/1.6 var(--sans); -webkit-font-smoothing:antialiased; }
main { max-width:44rem; margin:0 auto; padding:2.5rem 1.25rem 5rem; display:flex; flex-direction:column; gap:2.5rem; }
p { margin:0; } h1,h2,h3 { margin:0; font-weight:600; text-wrap:balance; } h1 { font-size:20px; } h2 { font-size:var(--t-body); } h3 { font-size:var(--t-item); }
a { color:inherit; text-decoration:underline; text-decoration-color:var(--line); text-underline-offset:3px; } a:hover { text-decoration-color:var(--ink); }
.eyebrow { font-size:var(--t-caption); text-transform:uppercase; letter-spacing:0.06em; font-weight:600; color:var(--muted); }
.caption { font-size:var(--t-caption); color:var(--muted); } .muted { color:var(--muted); }
.stack { display:flex; flex-direction:column; gap:0.85rem; }
.digest { display:flex; flex-direction:column; gap:1rem; }
.concept { display:flex; flex-direction:column; gap:0.45rem; padding-top:0.85rem; border-top:1px solid var(--line); }
.concept .row { display:grid; grid-template-columns:6.5rem 1fr; gap:0.5rem; font-size:var(--t-second); }
.concept .row .k { font-size:var(--t-caption); text-transform:uppercase; letter-spacing:0.05em; font-weight:600; color:var(--muted); padding-top:0.15rem; }
.concept .row .kb { font-family:var(--serif); }
.thread { display:flex; flex-direction:column; }
.jot { display:grid; grid-template-columns:3.6rem 1fr; gap:0.5rem; padding:0.75rem 0; border-top:1px solid var(--line); }
.jot .at { font-size:var(--t-caption); color:var(--muted); font-variant-numeric:tabular-nums; }
.jot .txt { font:400 var(--t-second)/1.5 var(--serif); }
.tag { font-size:var(--t-caption); color:var(--ink); background:var(--gold-soft); border-radius:999px; padding:0.02rem 0.5rem; }
.reply { margin-top:0.55rem; border-left:2px solid var(--line); padding-left:0.75rem; display:flex; flex-direction:column; gap:0.35rem; font-size:var(--t-second); }
.reply.check { border-left-color:var(--gold); } .reply.overruled .body { color:var(--muted); }
.reply .who { font-size:var(--t-caption); color:var(--muted); } .reply .who b { color:var(--ink); font-weight:600; } .reply.check .who b { color:var(--gold); }
.reply .body { line-height:1.6; white-space:pre-wrap; } .reply .kb { font:400 var(--t-second)/1.5 var(--serif); color:var(--muted); } .reply .why { font-size:var(--t-caption); color:var(--muted); }
.cites { display:flex; flex-wrap:wrap; gap:0.35rem; }
.cite { font-size:var(--t-caption); color:var(--muted); border:1px solid var(--line); border-radius:4px; padding:0.05rem 0.4rem; font-variant-numeric:tabular-nums; text-decoration:none; }
.widget { margin-top:0.55rem; border:1px solid var(--line); border-radius:6px; background:var(--card); padding:0.6rem 0.7rem; display:flex; flex-direction:column; gap:0.5rem; }
.widget .wname { font-size:var(--t-caption); font-weight:600; }
.wbody { display:flex; flex-direction:column; gap:0.5rem; }
.wbody label { display:flex; align-items:center; gap:0.6rem; color:var(--muted); font-size:var(--t-caption); } .wbody label .l { min-width:5.5rem; }
.wbody input[type=range] { flex:1; accent-color:var(--gold); } .wbody input[type=text], .wbody select { flex:1; font:0.85rem var(--mono); color:var(--ink); background:var(--bg); border:1px solid var(--line); border-radius:5px; padding:0.3rem 0.45rem; }
.wbody .val { font-variant-numeric:tabular-nums; color:var(--ink); font-weight:600; min-width:2.6rem; text-align:right; }
.wbody .ol { font-size:11px; text-transform:uppercase; letter-spacing:0.05em; color:var(--muted); font-weight:600; }
.bar { display:grid; grid-template-columns:5.5rem 1fr 3rem; align-items:center; gap:0.5rem; font-size:var(--t-caption); } .bar .tok { font-family:var(--mono); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.bar .meter { height:0.7rem; background:var(--line); border-radius:2px; overflow:hidden; } .bar .meter i { display:block; height:100%; background:var(--gold); } .bar .pct { text-align:right; font-variant-numeric:tabular-nums; color:var(--muted); } .bar.top .tok { font-weight:600; }
.toks { display:flex; flex-wrap:wrap; gap:3px; } .tk { font:0.8rem var(--mono); border-radius:3px; padding:0.1rem 0.25rem; background:var(--gold-soft); white-space:pre; } .tk:nth-child(even) { background:var(--card); border:1px solid var(--line); }
.num { font:600 1.4rem var(--mono); } table { border-collapse:collapse; font:0.78rem var(--mono); } td,th { border:1px solid var(--line); padding:0.15rem 0.35rem; text-align:right; min-width:2.2rem; } th { color:var(--muted); } td.hot { background:var(--gold-soft); }
.err { color:var(--muted); font-size:12px; }
footer { font-size:var(--t-caption); color:var(--muted); border-top:1px solid var(--line); padding-top:1rem; }
@media (prefers-reduced-motion: no-preference) { .bar .meter i { transition: width 90ms linear; } }
</style>
<main>
<header class="stack">
  <p class="eyebrow">Class notes · ${esc(date)}</p>
  <h1>${esc(title)}</h1>
  <p class="caption">${notes.length} note${notes.length === 1 ? '' : 's'} from ${esc(fmt(notes[0]?.t || 0))} to ${esc(fmt(notes.at(-1)?.t || 0))} · ${touched.size} concept${touched.size === 1 ? '' : 's'} touched · timestamps open the lecture</p>
</header>
${touched.size ? `<section class="stack"><h2>By concept</h2><div class="digest">${indexHtml}</div></section>` : ''}
<section class="stack"><h2>As it happened</h2><div class="thread">${threadHtml}</div></section>
<footer>Rendered from <code>${esc(basename(inPath))}</code> by TA. Nothing here was generated for this page; every line is a note or a reply from the session.</footer>
</main>
<script>
(function(){
  var W=${JSON.stringify(widgets)};
  function el(t,c,x){var e=document.createElement(t);if(c)e.className=c;if(x!=null)e.textContent=x;return e;}
  function fnum(n){return Number.isInteger(n)?String(n):n.toFixed(2);}
  W.forEach(function(w){
    var host=document.querySelector('#'+w.id+' .wbody'); if(!host) return;
    var s=w.spec, inputs={}, outs={}, fn;
    try{fn=new Function('inputs',s.compute);}catch(e){host.appendChild(el('p','err','Did not build: '+e.message));return;}
    s.inputs.forEach(function(i){var lab=el('label');lab.appendChild(el('span','l',i.label));var c;
      if(i.kind==='slider'){c=el('input');c.type='range';c.min=i.min;c.max=i.max;c.step=i.step;c.value=i.value;var v=el('span','val',fnum(i.value));c.oninput=function(){inputs[i.id]=Number(c.value);v.textContent=fnum(inputs[i.id]);run();};lab.appendChild(c);lab.appendChild(v);inputs[i.id]=Number(i.value);}
      else if(i.kind==='text'){c=el('input');c.type='text';c.value=i.value;c.spellcheck=false;c.oninput=function(){inputs[i.id]=c.value;run();};lab.appendChild(c);inputs[i.id]=i.value;}
      else{c=el('select');i.options.forEach(function(o){var op=el('option',null,String(o));op.value=String(o);if(o===i.value)op.selected=true;c.appendChild(op);});c.onchange=function(){inputs[i.id]=c.value;run();};lab.appendChild(c);inputs[i.id]=String(i.value);}
      host.appendChild(lab);});
    s.outputs.forEach(function(o){var b=el('div');b.appendChild(el('div','ol',o.label));var body=el('div');b.appendChild(body);host.appendChild(b);outs[o.id]=body;});
    function run(){var out;try{out=fn(Object.assign({},inputs));}catch(e){host.textContent='';host.appendChild(el('p','err','compute threw: '+e.message));return;}
      s.outputs.forEach(function(o){var v=out&&out[o.id],h=outs[o.id];h.textContent='';
        if(o.kind==='bars'&&Array.isArray(v)){var mx=-1,mi=0;v.forEach(function(b,i){if(b.value>mx){mx=b.value;mi=i;}});v.forEach(function(b,i){var r=el('div','bar'+(i===mi?' top':''));r.appendChild(el('span','tok',String(b.label)));var m=el('span','meter');var f=el('i');f.style.width=(Math.max(0,Math.min(1,b.value))*100).toFixed(1)+'%';m.appendChild(f);r.appendChild(m);r.appendChild(el('span','pct',(b.value*100).toFixed(1)+'%'));h.appendChild(r);});}
        else if(o.kind==='tokens'&&Array.isArray(v)){var l=el('div','toks');v.forEach(function(t){l.appendChild(el('span','tk',String(t).replace(/ /g,'·')));});h.appendChild(l);}
        else if(o.kind==='text')h.appendChild(el('div',null,String(v)));
        else if(o.kind==='number')h.appendChild(el('div','num',typeof v==='number'?fnum(v):String(v)));
        else if(o.kind==='grid'&&v&&v.rows){var tb=el('table');var g=0;v.rows.forEach(function(r){r.forEach(function(x){if(x>g)g=x;});});if(v.labels){var tr=el('tr');tr.appendChild(el('th'));v.labels.forEach(function(x){tr.appendChild(el('th',null,String(x)));});tb.appendChild(tr);}v.rows.forEach(function(r,ri){var tr2=el('tr');if(v.labels)tr2.appendChild(el('th',null,String(v.labels[ri]||'')));r.forEach(function(x){tr2.appendChild(el('td',x===g&&g>0?'hot':null,fnum(x)));});tb.appendChild(tr2);});h.appendChild(tb);}
      });}
    run();
  });
})();
</script>
`;

const out = outArg || join(root, 'notes', `${session.source}-${date}.html`);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html);
console.log(`notes: ${notes.length} notes, ${touched.size} concepts, ${widgets.length} widget${widgets.length === 1 ? '' : 's'} → ${out}`);
