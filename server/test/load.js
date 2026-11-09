'use strict';
// Simulates active matches against a private server and reports what players would feel.
// Usage: node test/load.js 1000 4000 8000
const { fork, spawn, execSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const PORT = 18950;
const ROOM = 8, HOLD_MS = 25000, UPDATE_MS = 4000;
const hex = n => crypto.randomBytes(n).toString('hex');
const sleep = ms => new Promise(r => setTimeout(r, ms));

if (process.env.LOAD_WORKER) worker();
else main();

function worker() {
  const count = Number(process.env.LOAD_WORKER);
  const agent = new http.Agent({ keepAlive: true, maxSockets: 150 });
  const post = (p, body, token) => new Promise((resolve, reject) => {
    const text = JSON.stringify(body), began = performance.now();
    const req = http.request({ port: PORT, host: '127.0.0.1', path: p, method: 'POST', agent, headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(text), ...(token ? { Authorization: `Bearer ${token}` } : {}) } }, res => {
      let out = ''; res.on('data', d => { out += d; });
      res.on('end', () => (res.statusCode < 300 ? resolve({ data: JSON.parse(out), ms: performance.now() - began }) : reject(new Error(String(res.statusCode)))));
    });
    req.on('error', reject); req.end(text);
  });
  const stats = { joined: 0, failed: 0, updates: [], fanout: [], errors: {} };
  const fail = e => { stats.errors[e.message] = (stats.errors[e.message] || 0) + 1; };
  const sample = (list, v) => { if (list.length < 40000) list.push(v); else list[Math.floor(Math.random() * list.length)] = v; };
  let running = true;

  function listen(player) {
    const req = http.get({ port: PORT, host: '127.0.0.1', agent: false, path: `/api/room/stream?room=${player.room}&session=${player.session}`, headers: { Authorization: `Bearer ${player.token}` } }, res => {
      if (res.statusCode !== 200) { fail(new Error(`stream ${res.statusCode}`)); res.resume(); return; }
      stats.joined++;
      let buf = '';
      res.setEncoding('utf8');
      res.on('data', d => {
        buf += d;
        let at;
        while ((at = buf.indexOf('\n\n')) >= 0) {
          const line = buf.slice(0, at); buf = buf.slice(at + 2);
          if (!line.startsWith('data: ')) continue;
          for (const p of JSON.parse(line.slice(6)).peers) {
            if (p.peer === player.peer) continue;
            const cl = p.presence.cl;
            if (cl && player.seen.get(p.peer) !== cl) { player.seen.set(p.peer, cl); if (player.live) sample(stats.fanout, Date.now() - cl); }
          }
        }
      });
    });
    req.on('error', e => { if (running) fail(new Error('stream closed')); });
    player.stream = req;
  }
  const playerOf = async (room, create) => {
    const me = (await post('/api/hello', {})).data, session = hex(16);
    const res = await post(create ? '/api/room/create' : '/api/room/join', { room, session }, me.token);
    const p = { token: me.token, session, room, peer: res.data.peer, seen: new Map(), live: false };
    await post('/api/room/presence', { room, session, presence: { tag: 'Load', j: Date.now(), cl: Date.now(), st: 'play', sc: 0, n: 0 } }, me.token);
    listen(p);
    return p;
  };
  process.on('message', async m => {
    if (m.go !== 'start') return;
    const players = [];
    const rooms = Math.ceil(count / ROOM);
    for (let r = 0; r < rooms; r++) {
      const room = `m-${hex(4)}`;
      try {
        players.push(await playerOf(room, true));
        const rest = await Promise.allSettled(Array.from({ length: ROOM - 1 }, () => playerOf(room, false)));
        for (const x of rest) { if (x.status === 'fulfilled') players.push(x.value); else { stats.failed++; fail(x.reason); } }
      } catch (e) { stats.failed++; fail(e); }
      await sleep(12);
    }
    process.send({ ready: true });
    await sleep(1500);
    players.forEach(p => { p.live = true; });
    const timers = players.map(p => setTimeout(function tick() {
      if (!running) return;
      post('/api/room/presence', { room: p.room, session: p.session, presence: { tag: 'Load', j: 1, cl: Date.now(), st: 'play', sc: Math.floor(Math.random() * 200), n: 4 } }, p.token).then(r => sample(stats.updates, r.ms)).catch(fail);
      setTimeout(tick, UPDATE_MS);
    }, Math.random() * UPDATE_MS));
    await sleep(HOLD_MS);
    running = false;
    timers.forEach(clearTimeout);
    await sleep(800);
    process.send({ stats });
    process.exit(0);
  });
  process.send({ loaded: true });
}

const pct = (list, q) => { if (!list.length) return null; const s = [...list].sort((a, b) => a - b); return Math.round(s[Math.min(s.length - 1, Math.floor(s.length * q))]); };

function serverMemory(pid) {
  try { return Math.round(Number(execSync(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`).toString().split('","')[4].replace(/[^\d]/g, '')) / 1024); } catch { return null; }
}

async function stage(players) {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'roshnight-load-'));
  const server = spawn(process.execPath, [path.join(__dirname, '..', 'index.js')], { env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', DATA_DIR: data, DISABLE_RATE_LIMITS: '1', MAX_STREAMS: '60000', STREAMS_PER_IP: '100000', REDIS_URL: '', SESSION_SECRET: '' }, stdio: ['ignore', 'ignore', 'inherit'] });
  await sleep(1200);
  const workers = Math.min(8, Math.max(1, Math.ceil(players / 800)));
  const each = Math.ceil(players / workers);
  const results = [];
  let ready = 0;
  const kids = Array.from({ length: workers }, () => fork(__filename, { env: { ...process.env, LOAD_WORKER: String(each) } }));
  const began = Date.now();
  await new Promise(resolve => {
    kids.forEach(k => {
      k.on('message', m => {
        if (m.loaded) k.send({ go: 'start' });
        if (m.ready && ++ready === workers) console.log(`  all connected after ${Math.round((Date.now() - began) / 1000)}s`);
        if (m.stats) { results.push(m.stats); if (results.length === workers) resolve(); }
      });
    });
  });
  const memory = serverMemory(server.pid);
  server.kill();
  await sleep(300);
  fs.rmSync(data, { recursive: true, force: true });
  const merged = list => results.flatMap(r => r[list]);
  const errors = {};
  results.forEach(r => Object.entries(r.errors).forEach(([k, v]) => { errors[k] = (errors[k] || 0) + v; }));
  const summary = { players: results.reduce((a, r) => a + r.joined, 0), asked: players, failed: results.reduce((a, r) => a + r.failed, 0), serverMB: memory, updateMs: { p50: pct(merged('updates'), .5), p95: pct(merged('updates'), .95), p99: pct(merged('updates'), .99), count: merged('updates').length }, deliveryMs: { p50: pct(merged('fanout'), .5), p95: pct(merged('fanout'), .95), p99: pct(merged('fanout'), .99), count: merged('fanout').length }, errors };
  console.log(JSON.stringify(summary));
}

async function main() {
  const stages = process.argv.slice(2).map(Number).filter(Boolean);
  console.log(`CPU: ${os.cpus()[0].model}, ${os.cpus().length} threads. One server process. Rooms of ${ROOM}, each player sends an update every ${UPDATE_MS / 1000}s.`);
  for (const players of stages.length ? stages : [1000, 4000]) { console.log(`\n${players} players`); await stage(players); await sleep(2000); }
}
