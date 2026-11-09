'use strict';
// Starts a private server and attacks it. Exits non-zero if any defence fails.
const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { verifyRoute, generate, dailyCode } = require('../game');

const PORT = 18600 + (process.pid % 300);
const BASE = `http://127.0.0.1:${PORT}`;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'roshnight-sec-'));
let passed = 0, failed = 0;
function check(name, ok, detail) {
  if (ok) passed++; else failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail !== undefined ? '  -> ' + JSON.stringify(detail) : ''}`);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const hex = n => crypto.randomBytes(n).toString('hex');

async function post(p, body, token, headers = {}) {
  const r = await fetch(BASE + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });
  let data = null; try { data = await r.json(); } catch {}
  return { status: r.status, data };
}
const newPlayer = async () => (await post('/api/hello', {})).data;
function raw(text, waitMs = 1500) {
  return new Promise(resolve => {
    const s = net.connect(PORT, '127.0.0.1'); let out = '';
    s.on('data', d => { out += d; }); s.on('error', () => {});
    s.on('close', () => resolve(out));
    s.write(text); setTimeout(() => s.destroy(), waitMs);
  });
}
function legalRoute(code) {
  const B = generate(code);
  for (let cell = 0; cell < 900; cell++) for (const p of [1, 2]) {
    const v = cell * 8 + p, res = verifyRoute(code, [v]);
    if (res && res.score > 0) return { route: [v], score: res.score, B };
  }
  throw new Error('no route');
}
const alive = async () => (await fetch(`${BASE}/api/health`)).status === 200;

async function main() {
  const child = spawn(process.execPath, [path.join(__dirname, '..', 'index.js')], { env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', DATA_DIR: DATA, REDIS_URL: '', SESSION_SECRET: '' }, stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = ''; child.stderr.on('data', d => { stderr += d; });
  for (let i = 0; i < 50 && !(await alive().catch(() => false)); i++) await sleep(100);

  // Files and headers
  for (const p of ['/server/index.js', '/data/secret', '/data/scores.json', '/src/js/core.js', '/package.json', '/.git/config', '/%2e%2e/server/index.js', '/..%2fserver/index.js']) {
    const text = await raw(`GET ${p} HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n`, 800);
    check(`private path refused: ${p}`, / 40\d /.test(text.split('\r\n')[0]) && !text.includes('SESSION_SECRET'), text.slice(0, 80));
  }
  const page = await fetch(BASE + '/');
  const csp = page.headers.get('content-security-policy') || '';
  check('content policy blocks injected scripts', /script-src 'sha256-/.test(csp) && !/script-src[^;]*unsafe-inline/.test(csp) && csp.includes("default-src 'none'"), csp);
  check('page cannot be framed', page.headers.get('x-frame-options') === 'DENY' && csp.includes("frame-ancestors 'none'"));
  check('browser type-sniffing off', page.headers.get('x-content-type-options') === 'nosniff');
  check('server software not advertised', !page.headers.get('x-powered-by'));

  // Identity
  const alice = await newPlayer(), bob = await newPlayer();
  const code = 'SECTEST1', legal = legalRoute(code);
  check('players get distinct identities', alice.id !== bob.id && !!alice.token);
  const forgedSig = `${bob.id}.${alice.token.split('.')[1]}`;
  const forgedNone = `${bob.id}.`;
  check('no login is refused', (await post('/api/score', { code, r: legal.route })).status === 401);
  check('forged signature is refused', (await post('/api/score', { code, r: legal.route }, forgedSig)).status === 401);
  check('empty signature is refused', (await post('/api/score', { code, r: legal.route }, forgedNone)).status === 401);

  // Scores
  const wall = legal.B.wall.findIndex(x => x);
  const target = legal.B.val.findIndex(x => x);
  const bad = {
    'piece on blockade': [wall * 8 + 1], 'piece on target': [target * 8 + 1], 'piece on start': [legal.B.src * 8 + 1],
    'same cell twice': [legal.route[0], legal.route[0]], 'too many pieces': Array.from({ length: 15 }, (_, i) => (i + 100) * 8 + 1),
    'too many splitters': [808 * 8 + 3, 809 * 8 + 3, 810 * 8 + 3], 'text in route': ['x'], 'fraction in route': [10.5], 'negative': [-9], 'not a list': 'abc', 'empty route': [],
  };
  for (const [name, r] of Object.entries(bad)) check(`illegal route refused: ${name}`, (await post('/api/score', { code, r }, alice.token)).status >= 400);
  const lied = await post('/api/score', { code, r: legal.route, score: 99999, s: 99999, id: bob.id, uid: bob.id }, alice.token);
  check('legal route accepted', lied.status === 200 && lied.data.accepted, lied);
  const board = (await (await fetch(`${BASE}/api/board/${code}`)).json()).entries;
  check('claimed score and identity ignored', board.length === 1 && board[0].id === alice.id && JSON.stringify(board[0]).indexOf('99999') < 0, board);
  check('bad board code refused', (await fetch(`${BASE}/api/board/..%2f..%2fetc`)).status >= 400);

  // Request shapes
  check('NaN in JSON refused', (await post('/api/room/create', '{"room":"m-aaa1","session":NaN}', alice.token)).status === 400);
  check('oversized body refused', [413, 400].includes((await post('/api/tag', { tag: 'x'.repeat(20000) }, alice.token)).status));
  const form = await fetch(`${BASE}/api/tag`, { method: 'POST', headers: { 'Content-Type': 'text/plain', Authorization: `Bearer ${alice.token}` }, body: '{"tag":"x"}' });
  check('non-JSON content type refused', form.status === 415);
  check('other websites cannot post', (await post('/api/tag', { tag: 'x' }, alice.token, { Origin: 'https://evil.example' })).status === 403);
  check('deeply nested JSON handled', (await post('/api/tag', '['.repeat(4000), alice.token)).status === 400 && await alive());
  check('invalid token characters refused', (await post('/api/score', {}, 'a.b\u0000c'.replace('\u0000', '%'))).status === 401);
  const longName = await post('/api/tag', { tag: 'x'.repeat(17) }, alice.token);
  check('over-long name refused', longName.status === 400);
  await post('/api/tag', { tag: 'A\u0000‮B<img>' }, alice.token);
  await post('/api/score', { code: 'SECTEST2', r: legalRoute('SECTEST2').route }, alice.token);
  const tagged = (await (await fetch(`${BASE}/api/board/SECTEST2`)).json()).entries[0];
  check('control and direction characters removed from names', tagged.tag === 'AB<img>', tagged);

  // Rooms
  const sA = hex(16), sB = hex(16), room = 'm-sectest';
  const made = await post('/api/room/create', { room, session: sA }, alice.token);
  check('room created', made.status === 200, made);
  check('existing room cannot be taken over', (await post('/api/room/create', { room, session: sB }, bob.token)).status === 409);
  check('missing room is not created by joining', (await post('/api/room/join', { room: 'm-nothere', session: sB }, bob.token)).status === 404);
  check('bad room name refused', (await post('/api/room/join', { room: '../../x', session: sB }, bob.token)).status === 400);
  check('non-member cannot act in a room', (await post('/api/room/presence', { room, session: sB, presence: { tag: 'x' } }, bob.token)).status === 404);
  const streamOut = await fetch(`${BASE}/api/room/stream?room=${room}&session=${sB}`, { headers: { Authorization: `Bearer ${bob.token}` } });
  check('non-member cannot listen to a room', streamOut.status === 404);
  const peersOut = await fetch(`${BASE}/api/room/peers?room=${room}&session=${sB}`, { headers: { Authorization: `Bearer ${bob.token}` } });
  check('non-member cannot read a room', peersOut.status === 404);
  await post('/api/room/presence', { room, session: sA, presence: { tag: 'Host', j: 1, st: 'lobby', cfg: { dur: 120000 } } }, alice.token);
  const joined = await post('/api/room/join', { room, session: sB }, bob.token);
  check('player can join with the code', joined.status === 200);
  const round = { rid: 'abc', code: 'X1', dur: 120000, start: Date.now() };
  await post('/api/room/presence', { room, session: sB, presence: JSON.parse('{"tag":"Mallory","j":2,"own":true,"h":' + JSON.stringify(round) + ',"evil":1,"__proto__":{"polluted":1},"cfg":{"dur":1,"x":2}}') }, bob.token);
  await sleep(50);
  const seen = (await post('/api/room/join', { room, session: sB }, bob.token)).data.peers;
  const mallory = seen.find(p => p.peer === joined.data.peer), host = seen.find(p => p.presence.tag === 'Host');
  check('player cannot make themselves host', mallory && !mallory.presence.own && host && host.presence.own === true, seen);
  check('player cannot start the round', mallory && !mallory.presence.h);
  check('unknown fields dropped', mallory && !('evil' in mallory.presence) && !('polluted' in mallory.presence) && !mallory.presence.cfg);
  const hostStart = await post('/api/room/presence', { room, session: sA, presence: { tag: 'Host', j: 1, h: round } }, alice.token);
  const after = (await post('/api/room/join', { room, session: sB }, bob.token)).data.peers.find(p => p.presence.tag === 'Host');
  check('host can start the round', hostStart.status === 200 && after.presence.h && after.presence.h.rid === 'abc', after);
  const big = await post('/api/room/presence', { room, session: sA, presence: { tag: 'y'.repeat(9000) } }, alice.token);
  check('huge room update refused', big.status === 413 || big.status === 400);
  const inf = await post('/api/room/presence', { room, session: sA, presence: { j: 1, sc: 1e308 * 10 } }, alice.token);
  check('impossible number cannot break other players', inf.status === 200 && JSON.stringify((await post('/api/room/join', { room, session: sB }, bob.token)).data).indexOf('null') < 0 && await alive());
  const fullRoom = 'm-fulltest';
  await post('/api/room/create', { room: fullRoom, session: hex(16) }, alice.token);
  let full = 0;
  for (let i = 0; i < 34; i++) { const guest = await newPlayer(); const r = await post('/api/room/join', { room: fullRoom, session: hex(16) }, guest.token); if (r.status === 403) full++; }
  check('room size is capped', full >= 2, full);

  // One seat per player in a room
  const seatRoom = 'm-seat', tab1 = hex(16), tab2 = hex(16), seatOwner = await newPlayer();
  const seat = await post('/api/room/create', { room: seatRoom, session: tab1 }, seatOwner.token);
  await post('/api/room/presence', { room: seatRoom, session: tab1, presence: { tag: 'Owner', j: 1, st: 'lobby' } }, seatOwner.token);
  const second = await post('/api/room/join', { room: seatRoom, session: tab2 }, seatOwner.token);
  check('a second tab cannot join a room as another player', second.status === 409 && second.data.error === 'already_in_room', second);
  const tabStream = new AbortController();
  const held = await fetch(`${BASE}/api/room/stream?room=${seatRoom}&session=${tab1}`, { headers: { Authorization: `Bearer ${seatOwner.token}` }, signal: tabStream.signal });
  const stillBlocked = await post('/api/room/join', { room: seatRoom, session: tab2 }, seatOwner.token);
  check('a second tab stays blocked while the first is connected', held.status === 200 && stillBlocked.status === 409, stillBlocked);
  tabStream.abort();
  await new Promise(r => setTimeout(r, 300));
  const back = await post('/api/room/join', { room: seatRoom, session: tab2 }, seatOwner.token);
  const backSelf = back.data.peers && back.data.peers.find(p => p.peer === back.data.peer);
  check('a closed or reloaded tab can come back as the same player', back.status === 200 && back.data.peers.length === 1 && back.data.peer !== seat.data.peer, back);
  check('host keeps the host role after coming back', !!backSelf && backSelf.presence.own === true, back.data);
  check('the replaced tab cannot return as a second player', (await post('/api/room/join', { room: seatRoom, session: tab1 }, seatOwner.token)).status === 409);

  // One attempt at today's board
  const today = dailyCode(), todayRoute = legalRoute(today).route, racer = await newPlayer(), sneak = await newPlayer();
  check('score without an attempt is not counted', (await post('/api/score', { code: today, r: todayRoute }, sneak.token)).data.accepted === false);
  check('only today can be started', (await post('/api/daily/start', { code: dailyCode(1) }, racer.token)).status === 400);
  const first = await post('/api/daily/start', { code: today }, racer.token);
  check('first attempt starts', first.data.status === 'go' && first.data.left > 300000, first.data);
  const again = await post('/api/daily/start', { code: today }, racer.token);
  check('refresh resumes the same clock', again.data.status === 'resume' && again.data.left <= first.data.left, again.data);
  check('attempt score is counted', (await post('/api/score', { code: today, r: todayRoute }, racer.token)).data.accepted === true);
  await post('/api/daily/finish', { code: today }, racer.token);
  check('finished board cannot be replayed', (await post('/api/daily/start', { code: today }, racer.token)).data.status === 'done');
  const hidden = (await (await fetch(`${BASE}/api/board/${today}`)).json()).entries[0];
  check('routes stay hidden on today\'s board', hidden && hidden.r === undefined && hidden.s > 0, hidden);
  check('past daily boards cannot be scored', (await post('/api/score', { code: dailyCode(1), r: legalRoute(dailyCode(1)).route }, racer.token)).data.accepted === false);

  // Malformed traffic
  const junk = await raw('NOT HTTP AT ALL\r\n\r\n', 500);
  check('garbage connection answered and survived', junk.includes('400') && await alive(), junk.slice(0, 60));
  const hugeHeader = await raw(`GET / HTTP/1.1\r\nHost: x\r\nX-Big: ${'a'.repeat(100000)}\r\n\r\n`, 800);
  check('giant header refused', /431|400/.test(hugeHeader) && await alive(), hugeHeader.slice(0, 60));
  const started = Date.now();
  const slow = await new Promise(resolve => { const s = net.connect(PORT, '127.0.0.1'); s.write('GET / HTTP/1.1\r\nHost: x\r\nX-Slow: '); s.on('close', () => resolve(Date.now() - started)); s.on('error', () => {}); s.on('data', () => {}); setTimeout(() => { s.destroy(); resolve(99999); }, 15000); });
  check('slow connection attack is cut off', slow < 14000, slow);

  // Floods (last, because they use up this address's allowance)
  let limited = 0;
  await Promise.all(Array.from({ length: 200 }, async () => { if ((await post('/api/hello', {})).status === 429) limited++; }));
  check('sign-up flood is limited', limited > 50, limited);
  let misses = 0;
  for (let i = 0; i < 200 && !misses; i++) if ((await post('/api/room/join', { room: `m-g${hex(3)}`, session: sB }, bob.token)).status === 429) misses = i + 1;
  check('room-code guessing is limited', misses > 0 && misses < 200, misses);
  check('server still healthy after attacks', await alive());
  check('no internal errors during attacks', !/unhandled|request failed/.test(stderr), stderr.slice(0, 400));
  const secretFile = fs.readFileSync(path.join(DATA, 'secret'), 'utf8');
  check('session secret is strong', secretFile.length >= 64);

  child.kill();
  await sleep(200);
  fs.rmSync(DATA, { recursive: true, force: true });
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(2); });
