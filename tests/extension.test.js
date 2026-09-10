// Static checks on the extension: manifest shape, no CDNs, tokens verbatim,
// every data string through textContent or esc(), the runtime's CSP.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');
const manifest = JSON.parse(read('../extension/manifest.json'));

test('manifest: MV3, sidebar, gecko id, youtube content script', () => {
  assert.equal(manifest.manifest_version, 3);
  assert.ok(manifest.sidebar_action?.default_panel);
  assert.ok(manifest.browser_specific_settings?.gecko?.id);
  assert.ok(manifest.content_scripts.some(c => c.matches.some(m => m.includes('youtube.com'))));
  assert.deepEqual(manifest.host_permissions, ['*://www.youtube.com/*'], 'youtube.com host access: Firefox MV3 leaves it off for installed add-ons, so it is declared and requested from the panel');
});

test('no CDN or remote script anywhere in the extension', () => {
  for (const f of ['../extension/sidebar/panel.html', '../site/widget/runtime.html']) {
    const s = read(f);
    assert.ok(!/https?:\/\/[^"']+\.(js|css)/.test(s), `${f} loads a remote asset`);
  }
});

test('panel.css carries the design tokens verbatim', () => {
  const css = read('../extension/sidebar/panel.css');
  const tokens = read('/Users/kb/Code/brain/design-system/tokens.css');
  for (const line of ['--bg:        #faf8f4;', '--gold:      #a8720a;', '--t-body:    17px;', '--bg: #131210; --ink: #e8e4dc;']) {
    assert.ok(tokens.includes(line) && css.includes(line), `token line missing or diverged: ${line}`);
  }
});

test('panel.js builds DOM with textContent, never innerHTML from data', () => {
  const js = read('../extension/sidebar/panel.js');
  assert.ok(!/innerHTML\s*=/.test(js), 'no innerHTML assignment in panel.js');
  assert.ok(/const esc = /.test(js));
});

test('widget runtime: sandboxed by CSP, listens for spec only', () => {
  const r = read('../site/widget/runtime.html');
  assert.match(r, /Content-Security-Policy.*default-src 'none'/);
  assert.ok(!/fetch\(|XMLHttpRequest|localStorage/.test(r));
  const panel = read('../extension/sidebar/panel.js');
  assert.match(panel, /sandbox="allow-scripts"/.test(read('../extension/sidebar/panel.html')) ? /allow-scripts|wframe/ : /never/);
});

test('panel.css is versioned and the version changes with the file', () => {
  const html = read('../extension/sidebar/panel.html');
  const m = html.match(/panel\.css\?v=(\d+)/);
  assert.ok(m, 'panel.html must link panel.css?v=N — Firefox caches extension CSS across reloads');
  const css = read('../extension/sidebar/panel.css');
  assert.ok(css.startsWith(`/* v${m[1]} `), `panel.css must begin with "/* v${m[1]} " so the bump is made in both places`);
});
