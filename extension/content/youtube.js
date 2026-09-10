// Runs on youtube.com. Answers the sidebar's questions about the page:
//   {type:"state"}      → {videoId, t, title, playing, duration}
//   {type:"seek", t}    → moves the player to t seconds
//   {type:"transcript"} → caption segments fetched from the page (fallback
//                         when the desk does not ship this video's transcript)
// It never writes to the page and never talks to the desk.

const api = typeof browser !== 'undefined' ? browser : chrome;

function videoId() {
  const u = new URL(location.href);
  return u.searchParams.get('v') || (u.pathname.startsWith('/shorts/') ? u.pathname.split('/')[2] : null);
}

function state() {
  const v = document.querySelector('video');
  const titleEl = document.querySelector('h1.ytd-watch-metadata yt-formatted-string, h1.title yt-formatted-string, #title h1');
  return {
    videoId: videoId(),
    t: v ? Math.floor(v.currentTime) : null,
    duration: v ? Math.floor(v.duration || 0) : null,
    playing: v ? !v.paused : false,
    title: (titleEl?.textContent || document.title.replace(/ - YouTube$/, '')).trim(),
  };
}

async function transcript() {
  // The watch page embeds the caption track list; the track URL works from
  // the page's own session where it does not from a bare client.
  const id = videoId(); if (!id) return { error: 'no video' };
  try {
    const html = await (await fetch(location.href, { credentials: 'include' })).text();
    const m = html.match(/"captionTracks":(\[.*?\])/);
    if (!m) return { error: 'no caption tracks on this page' };
    const tracks = JSON.parse(m[1]);
    const track = tracks.find(t => t.languageCode === 'en') || tracks[0];
    const res = await fetch(track.baseUrl + '&fmt=json3', { credentials: 'include' });
    const text = await res.text();
    if (!text) return { error: 'caption request returned empty (proof-of-origin gate)' };
    const data = JSON.parse(text);
    const segments = [];
    for (const ev of data.events || []) {
      if (!ev.segs) continue;
      const s = ev.segs.map(x => x.utf8 || '').join('').replace(/\n/g, ' ').trim();
      if (s) segments.push({ t: Math.round(ev.tStartMs / 100) / 10, text: s });
    }
    return { id, title: state().title, segments, chapters: [] };
  } catch (e) {
    return { error: String(e.message || e) };
  }
}

api.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'state') { sendResponse(state()); return; }
  if (msg?.type === 'seek') {
    const v = document.querySelector('video');
    if (v && typeof msg.t === 'number') { v.currentTime = msg.t; v.play().catch(() => {}); }
    sendResponse({ ok: Boolean(v) }); return;
  }
  if (msg?.type === 'transcript') { transcript().then(sendResponse); return true; }
});
