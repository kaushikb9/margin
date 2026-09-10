import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, cpSync, readFileSync, writeFileSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const BRAIN = join(homedir(), 'Code', 'brain');
const can = existsSync(join(BRAIN, 'site/index.html'));

test('brain.mjs refuses a session with nothing starred, then writes a post that passes the brain\'s check', { skip: !can && 'no ~/Code/brain on this machine' }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'brain-'));
  cpSync(BRAIN, dir, { recursive: true, filter: p => !p.includes('/.git') && !p.includes('/node_modules') });
  const session = JSON.parse(readFileSync(join(root, 'sessions/7xTGNNLPyMI/2026-09-10.json'), 'utf8'));
  const plain = join(dir, 'plain.json'); writeFileSync(plain, JSON.stringify(session));
  const run = (file) => { try { return { code: 0, out: execFileSync('node', [join(root, 'scripts/brain.mjs'), '7xTGNNLPyMI', '--from', file], { env: { ...process.env, BRAIN_DIR: dir }, stdio: 'pipe' }).toString() }; } catch (e) { return { code: e.status, out: e.stderr.toString() }; } };
  const r1 = run(plain);
  assert.equal(r1.code, 3, 'no stars must refuse with exit 3'); assert.match(r1.out, /nothing starred/);
  session.notes[0].stars = ['note'];
  const starred = join(dir, 'starred.json'); writeFileSync(starred, JSON.stringify(session));
  const r2 = run(starred);
  assert.equal(r2.code, 0, r2.out);
  const posts = readdirSync(join(dir, 'site/posts'));
  const mine = posts.find(p => p.includes('deep-dive-into-llms'));
  assert.ok(mine, 'post file written'); assert.match(mine, /^2026-09-10-/, 'dated to the first note');
  const html = readFileSync(join(dir, 'site/posts', mine), 'utf8');
  assert.equal((html.match(/class="keep"/g) || []).length, 1); assert.doesNotMatch(html, /<script/);
  const index = readFileSync(join(dir, 'site/index.html'), 'utf8');
  assert.equal((index.match(/<!-- margin:7xTGNNLPyMI -->/g) || []).length, 1, 'one index row');
  const r3 = run(starred); assert.equal(r3.code, 0); assert.match(r3.out, /rewrote/);
  assert.equal((readFileSync(join(dir, 'site/index.html'), 'utf8').match(/<!-- margin:7xTGNNLPyMI -->/g) || []).length, 1, 'rerun replaces the row, never duplicates');
  rmSync(dir, { recursive: true, force: true });
});
