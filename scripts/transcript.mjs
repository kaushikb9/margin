#!/usr/bin/env node
// Fetch a YouTube transcript into site/transcripts/<id>.json and register it
// in site/brain/sources.json.
//   node scripts/transcript.mjs <videoId> [milestone]
//
// YouTube's timedtext endpoint returns an empty body to bare clients since
// the 2025 proof-of-origin change. The InnerTube player endpoint with the
// Android client identity still hands back a working caption URL, which is
// what this uses. If that stops working, the extension's content script can
// pull captions from inside the page session instead (content/youtube.js).
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const [id, milestone = null] = process.argv.slice(2);
if (!id) { console.error('usage: transcript.mjs <videoId> [milestone]'); process.exit(2); }
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const UA = 'com.google.android.youtube/20.10.38 (Linux; U; Android 11) gzip';
const player = await fetch('https://www.youtube.com/youtubei/v1/player', {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'user-agent': UA },
  body: JSON.stringify({ context: { client: { clientName: 'ANDROID', clientVersion: '20.10.38', androidSdkVersion: 30, hl: 'en', gl: 'US' } }, videoId: id }),
}).then(r => r.json());

const title = player?.videoDetails?.title;
const tracks = player?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
if (!tracks.length) { console.error(`transcript: no caption tracks for ${id} (status ${player?.playabilityStatus?.status}). Fix: check the id, or the video has no captions.`); process.exit(1); }
const track = tracks.find(t => t.languageCode === 'en') || tracks[0];
const raw = await fetch(track.baseUrl + '&fmt=json3', { headers: { 'user-agent': UA } }).then(r => r.text());
if (!raw) { console.error('transcript: caption request returned an empty body. Fix: YouTube changed the gate; try again later or capture from the page via the extension.'); process.exit(1); }

const segments = [];
if (raw.trimStart().startsWith('{')) {
  for (const ev of JSON.parse(raw).events || []) {
    if (!ev.segs) continue;
    const text = ev.segs.map(s => s.utf8 || '').join('').replace(/\n/g, ' ').trim();
    if (text) segments.push({ t: Math.round(ev.tStartMs / 100) / 10, text: decode(text) });
  }
} else {
  for (const m of raw.matchAll(/<p t="(\d+)"[^>]*>(.*?)<\/p>/gs)) {
    const text = decode(m[2].replace(/<[^>]+>/g, '')).replace(/\n/g, ' ').trim();
    if (text) segments.push({ t: Math.round(Number(m[1]) / 100) / 10, text });
  }
}
if (!segments.length) { console.error('transcript: parsed zero segments — format changed. Fix: inspect the raw body and update the parser.'); process.exit(1); }

// Chapters come from the watch page, which does not need the Android trick.
let chapters = [];
try {
  const html = await fetch(`https://www.youtube.com/watch?v=${id}`, { headers: { 'user-agent': 'Mozilla/5.0' } }).then(r => r.text());
  chapters = [...html.matchAll(/"chapterRenderer":\{"title":\{"simpleText":"(.*?)"\}.*?"timeRangeStartMillis":(\d+)/g)].map(m => ({ t: Math.floor(Number(m[2]) / 1000), title: m[1].replace(/\\"/g, '"') }));
} catch { /* optional */ }

const out = { id, title: title || id, milestone, duration: segments.at(-1).t, chapters, segments };
writeFileSync(join(root, 'site', 'transcripts', `${id}.json`), JSON.stringify(out));

const srcPath = join(root, 'site', 'brain', 'sources.json');
const sources = existsSync(srcPath) ? JSON.parse(readFileSync(srcPath, 'utf8')) : { sources: [] };
const row = { id, title: out.title, milestone, duration: out.duration, chapters: chapters.length, segments: segments.length };
const i = sources.sources.findIndex(s => s.id === id);
if (i >= 0) sources.sources[i] = row; else sources.sources.push(row);
writeFileSync(srcPath, JSON.stringify(sources, null, 1));
console.log(`transcript: ${id} "${out.title}" — ${segments.length} segments, ${chapters.length} chapters, ${Math.round(out.duration / 60)} min → site/transcripts/${id}.json`);

function decode(s) { return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'"); }
