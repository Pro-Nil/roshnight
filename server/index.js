'use strict';
const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { monitorEventLoopDelay } = require('node:perf_hooks');
const { verifyRoute, CODE_RE, dailyCode, dailyAge, DAILY_DUR } = require('./game');
const { MemoryStore } = require('./store-memory');

const env = process.env;
const ROOT = path.join(__dirname, '..');
const DATA = env.DATA_DIR || path.join(ROOT, 'data');
const CFG = {
  port: Number(env.PORT) || 8000,
  host: env.HOST || '0.0.0.0',
  trustProxy: Math.max(0, Number(env.TRUST_PROXY) || 0),
  hsts: env.HSTS === '1',
  origins: new Set((env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean)),
  maxStreams: Number(env.MAX_STREAMS) || 20000,
  streamsPerIp: Number(env.STREAMS_PER_IP) || 200,
  limits: env.DISABLE_RATE_LIMITS !== '1',
};
const MAX_BODY = 8 * 1024;
const MAX_BUFFER = 256 * 1024;
const ROOM_MAX = 32;
const ROOM_RE = /^m-[a-z0-9]{3,10}$/;
const SESSION_RE = /^[a-f0-9]{32}$/;
const GRACE_MS = 30000;
const STALE_MS = 60000;
const HEARTBEAT_MS = 15000;
const BOARD_CACHE_MS = 5000;
const DAILY_COUNTDOWN_MS = 3600;
const DAILY_LATE_MS = 8000;

function secret() {
  if (env.SESSION_SECRET) {
    if (env.SESSION_SECRET.length < 32) throw new Error('SESSION_SECRET must be at least 32 characters.');
    return env.SESSION_SECRET;
  }
  if (env.REDIS_URL) throw new Error('SESSION_SECRET is required when REDIS_URL is set, and must match on every instance.');
  const file = path.join(DATA, 'secret');
  try { return fs.readFileSync(file, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  fs.mkdirSync(DATA, { recursive: true, mode: 0o700 });
  const value = crypto.randomBytes(48).toString('hex');
  fs.writeFileSync(file, value, { mode: 0o600 });
  return value;
}
const SECRET = secret();
const sign = text => crypto.createHmac('sha256', SECRET).update(text).digest('base64url');

function issueToken() { const uid = `u_${crypto.randomBytes(11).toString('hex')}`; return { uid, token: `${uid}.${sign(uid)}` }; }
function readToken(req) {
  const match = /^Bearer ([\w-]+)\.([\w-]+)$/.exec(req.headers.authorization || '');
  if (!match) return null;
  const want = Buffer.from(sign(match[1])), got = Buffer.from(match[2]);
  return want.length === got.length && crypto.timingSafeEqual(want, got) ? match[1] : null;
}
const peerId = (uid, session) => sign(`peer:${uid}:${session}`).slice(0, 16);

// ---------- Static page with a strict content policy ----------
const page = fs.readFileSync(path.join(ROOT, 'index.html'));
const pageGzip = zlib.gzipSync(page, { level: 9 });
const pageTag = `"${crypto.createHash('sha256').update(page).digest('base64url').slice(0, 24)}"`;
const scriptHashes = [...page.toString('utf8').matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => `'sha256-${crypto.createHash('sha256').update(m[1]).digest('base64')}'`);
const CSP = [
  "default-src 'none'", `script-src ${scriptHashes.join(' ')}`, 'worker-src blob:', "connect-src 'self'",
  "style-src 'unsafe-inline' https://fonts.googleapis.com", 'font-src https://fonts.gstatic.com', "img-src 'none'",
  "base-uri 'none'", "form-action 'none'", "frame-ancestors 'none'",
].join('; ');
const SAFE_HEADERS = {
  'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Resource-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  ...(CFG.hsts ? { 'Strict-Transport-Security': 'max-age=31536000; includeSubDomains' } : {}),
};

// ---------- Rate limits ----------
class Limiter {
  constructor(perMinute, burst) { this.rate = perMinute / 60000; this.burst = burst; this.keys = new Map(); }
  allow(key, cost = 1) {
    if (!CFG.limits) return true;
    const now = Date.now();
    let bucket = this.keys.get(key);
    if (!bucket) {
      if (this.keys.size >= 200000) this.keys.delete(this.keys.keys().next().value);
      bucket = { left: this.burst, at: now }; this.keys.set(key, bucket);
    }
    bucket.left = Math.min(this.burst, bucket.left + (now - bucket.at) * this.rate); bucket.at = now;
    if (bucket.left < cost) return false;
    bucket.left -= cost;
    return true;
  }
  sweep() { const now = Date.now(); for (const [k, b] of this.keys) if (b.left + (now - b.at) * this.rate >= this.burst) this.keys.delete(k); }
}
const LIMIT = {
  page: new Limiter(1200, 300), hello: new Limiter(120, 60), read: new Limiter(1800, 400),
  scoreUser: new Limiter(120, 30), scoreIp: new Limiter(6000, 1000), tag: new Limiter(30, 10),
  joinUser: new Limiter(60, 20), joinIp: new Limiter(600, 120), missIp: new Limiter(60, 30),
  presence: new Limiter(1200, 120), stream: new Limiter(120, 40), daily: new Limiter(30, 15),
};
setInterval(() => Object.values(LIMIT).forEach(l => l.sweep()), 30000).unref();

// ---------- Load shedding ----------
const lag = monitorEventLoopDelay({ resolution: 20 });
lag.enable();
let overloaded = false;
setInterval(() => { overloaded = lag.percentile(99) / 1e6 > 800; lag.reset(); }, 2000).unref();

class HttpError extends Error { constructor(status, code) { super(code); this.status = status; this.code = code; } }
const deny = (status, code) => { throw new HttpError(status, code); };

function clientIp(req) {
  let ip = req.socket.remoteAddress || '';
  if (CFG.trustProxy > 0) {
    const chain = String(req.headers['x-forwarded-for'] || '').split(',').map(s => s.trim()).filter(Boolean);
    if (chain.length >= CFG.trustProxy) ip = chain[chain.length - CFG.trustProxy];
  }
  ip = ip.replace(/^::ffff:/, '');
  return ip.includes(':') ? ip.split(':').slice(0, 4).join(':') : ip;
}
function checkOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return;
  if (CFG.origins.has(origin)) return;
  let host;
  try { host = new URL(origin).host; } catch { deny(403, 'forbidden'); }
  if (host !== req.headers.host) deny(403, 'forbidden');
}
async function readJson(req) {
  if (!/^application\/json\b/i.test(req.headers['content-type'] || '')) deny(415, 'bad_request');
  const declared = Number(req.headers['content-length']);
  if (declared > MAX_BODY) { req.resume(); deny(413, 'too_large'); }
  const chunks = []; let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) deny(413, 'too_large');
    chunks.push(chunk);
  }
  let value;
  try { value = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { deny(400, 'bad_request'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) deny(400, 'bad_request');
  return value;
}
function json(res, status, body, extra) {
  const text = JSON.stringify(body);
  res.writeHead(status, { ...SAFE_HEADERS, 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(text), 'Cache-Control': 'no-store', ...extra });
  res.end(text);
}
const auth = req => readToken(req) || deny(401, 'unauthorized');
function cleanTag(value) {
  if (typeof value !== 'string') deny(400, 'bad_request');
  const text = value.normalize('NFC').replace(/[\p{C}\p{Zl}\p{Zp}]/gu, '').trim();
  if ([...text].length > 16) deny(400, 'bad_request');
  return text;
}
const roomName = value => (typeof value === 'string' && ROOM_RE.test(value) ? value : deny(400, 'bad_request'));
const sessionId = value => (typeof value === 'string' && SESSION_RE.test(value) ? value : deny(400, 'bad_request'));

// ---------- Players' room state: only known fields of known shapes get through ----------
const STATES = new Set(['lobby', 'play', 'done']);
const num = (v, lo, hi) => (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : undefined);
function cleanRoute(v) { return Array.isArray(v) && v.length <= 14 && v.every(x => Number.isInteger(x) && x >= 1 && x < 7200) ? v : undefined; }
function cleanRound(v, isHost) {
  if (!isHost || !v || typeof v !== 'object') return undefined;
  const dur = num(v.dur, 60000, 3600000), start = num(v.start, 0, 1e14);
  if (dur === undefined || start === undefined || typeof v.rid !== 'string' || !/^[a-z0-9]{1,12}$/.test(v.rid)) return undefined;
  if (typeof v.code !== 'string' || !CODE_RE.test(v.code)) return undefined;
  return { rid: v.rid, code: v.code, dur, start };
}
function cleanPresence(input, isHost) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) deny(400, 'bad_request');
  const out = {};
  const set = (k, v) => { if (v !== undefined) out[k] = v; };
  if (typeof input.tag === 'string') set('tag', cleanTag(input.tag.slice(0, 64)));
  set('j', num(input.j, 0, 1e14)); set('cl', num(input.cl, 0, 1e14));
  if (STATES.has(input.st)) out.st = input.st;
  set('sc', num(input.sc, -9999, 99999)); set('n', num(input.n, 0, 14));
  set('r', cleanRoute(input.r));
  if (typeof input.rid === 'string' && /^[a-z0-9]{1,12}$/.test(input.rid)) out.rid = input.rid;
  if (input.cfg && typeof input.cfg === 'object') { const dur = num(input.cfg.dur, 60000, 3600000); if (dur !== undefined) out.cfg = { dur }; }
  set('h', cleanRound(input.h, isHost));
  return out;
}

// ---------- Rooms ----------
async function makeStore() {
  if (env.REDIS_URL) {
    const { RedisStore } = require('./store-redis');
    return new RedisStore(env.REDIS_URL);
  }
  return new MemoryStore(DATA);
}
const local = new Map(); // room name -> Map(peer -> { res, gen, timer })
const pendingPush = new Set();
let streamCount = 0;
const streamsByIp = new Map();
let store;

const live = members => { const cut = Date.now() - STALE_MS; return members.filter(m => m.seen > cut); };
const publicPeers = members => members.filter(m => m.presence && Number.isFinite(m.presence.j)).map(m => ({ peer: m.peer, by: m.uid, presence: { ...m.presence, ...(m.own ? { own: true } : {}) } }));

async function pushRoom(name) {
  const streams = local.get(name);
  if (!streams || !streams.size) return;
  const message = `data: ${JSON.stringify({ peers: publicPeers(live(await store.members(name))) })}\n\n`;
  for (const stream of streams.values()) {
    if (!stream.res || stream.res.writableEnded) continue;
    if (stream.res.writableLength > MAX_BUFFER) { stream.res.destroy(); continue; }
    stream.res.write(message);
  }
}
function schedulePush(name) {
  if (pendingPush.has(name)) return;
  pendingPush.add(name);
  setTimeout(() => { pendingPush.delete(name); pushRoom(name).catch(e => console.error('push failed:', e.message)); }, 100).unref();
}
async function removeMember(name, peer) {
  const members = await store.members(name);
  const leaving = members.find(m => m.peer === peer);
  await store.delMember(name, peer);
  if (leaving && leaving.own) {
    const next = live(members).filter(m => m.peer !== peer).sort((a, b) => a.joined - b.joined)[0];
    if (next) await store.putMember(name, { ...next, own: true });
  }
  await store.publish(name);
}

async function hello(req, res, ip) {
  if (!LIMIT.hello.allow(ip)) deny(429, 'rate_limited');
  await readJson(req);
  const existing = readToken(req);
  if (existing) { json(res, 200, { id: existing }); return; }
  const { uid, token } = issueToken();
  json(res, 200, { id: uid, token });
}
const memberNew = (uid, session, own) => ({ peer: peerId(uid, session), uid, own, joined: Date.now(), seen: Date.now(), presence: null });

async function roomOpen(req, res, ip, create) {
  const uid = auth(req), body = await readJson(req), name = roomName(body.room), session = sessionId(body.session);
  if (!LIMIT.joinUser.allow(uid) || !LIMIT.joinIp.allow(ip)) deny(429, 'rate_limited');
  if (overloaded) deny(503, 'busy');
  const peer = peerId(uid, session);
  if (create) {
    if (!(await store.createRoom(name, memberNew(uid, session, true)))) deny(409, 'room_taken');
  } else {
    const members = live(await store.members(name));
    const mine = members.find(m => m.peer === peer);
    if (!members.length) { if (!LIMIT.missIp.allow(ip)) deny(429, 'rate_limited'); deny(404, 'not_found'); }
    if (!mine && members.length >= ROOM_MAX) deny(403, 'room_full');
    if (!mine) await store.putMember(name, memberNew(uid, session, false));
  }
  json(res, 200, { peer, peers: publicPeers(live(await store.members(name))) });
}
async function roomPresence(req, res) {
  const uid = auth(req), body = await readJson(req), name = roomName(body.room), session = sessionId(body.session), peer = peerId(uid, session);
  if (!LIMIT.presence.allow(peer)) deny(429, 'rate_limited');
  const members = await store.members(name), me = members.find(m => m.peer === peer);
  if (!me) deny(404, 'not_found');
  await store.putMember(name, { ...me, seen: Date.now(), presence: cleanPresence(body.presence, !!me.own) });
  await store.publish(name);
  json(res, 200, { ok: true });
}
async function roomLeave(req, res) {
  const uid = auth(req), body = await readJson(req), name = roomName(body.room), peer = peerId(uid, sessionId(body.session));
  const streams = local.get(name), stream = streams && streams.get(peer);
  if (stream && stream.timer) clearTimeout(stream.timer);
  if (stream && stream.res) stream.res.end();
  if (streams) { streams.delete(peer); if (!streams.size) { local.delete(name); store.unwatch(name).catch(() => {}); } }
  await removeMember(name, peer);
  json(res, 200, { ok: true });
}
async function roomPeers(req, res, ip, url) {
  const uid = auth(req), name = roomName(url.searchParams.get('room')), peer = peerId(uid, sessionId(url.searchParams.get('session')));
  if (!LIMIT.read.allow(ip)) deny(429, 'rate_limited');
  const members = await store.members(name), me = members.find(m => m.peer === peer);
  if (!me) deny(404, 'not_found');
  if (Date.now() - me.seen > 20000) await store.putMember(name, { ...me, seen: Date.now() });
  json(res, 200, { peers: publicPeers(live(members)) });
}
async function roomStream(req, res, ip, url) {
  const uid = auth(req), name = roomName(url.searchParams.get('room')), peer = peerId(uid, sessionId(url.searchParams.get('session')));
  if (!LIMIT.stream.allow(ip)) deny(429, 'rate_limited');
  if (streamCount >= CFG.maxStreams || overloaded) deny(503, 'busy');
  if ((streamsByIp.get(ip) || 0) >= CFG.streamsPerIp) deny(429, 'rate_limited');
  const members = await store.members(name);
  if (!members.some(m => m.peer === peer)) deny(404, 'not_found');
  res.writeHead(200, { ...SAFE_HEADERS, 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store, no-transform', 'X-Accel-Buffering': 'no' });
  res.flushHeaders();
  streamCount++; streamsByIp.set(ip, (streamsByIp.get(ip) || 0) + 1);
  if (!local.has(name)) { local.set(name, new Map()); await store.watch(name); }
  const streams = local.get(name);
  const old = streams.get(peer);
  if (old && old.timer) clearTimeout(old.timer);
  if (old && old.res) old.res.destroy();
  const stream = { res, gen: (old ? old.gen : 0) + 1, timer: null };
  streams.set(peer, stream);
  schedulePush(name);
  const beat = setInterval(async () => {
    res.write(': ping\n\n');
    try { const me = (await store.members(name)).find(m => m.peer === peer); if (me) await store.putMember(name, { ...me, seen: Date.now() }); } catch {}
  }, HEARTBEAT_MS);
  beat.unref();
  res.on('close', () => {
    clearInterval(beat);
    streamCount--;
    const left = (streamsByIp.get(ip) || 1) - 1;
    if (left > 0) streamsByIp.set(ip, left); else streamsByIp.delete(ip);
    if (streams.get(peer) !== stream) return;
    stream.res = null;
    stream.timer = setTimeout(() => {
      if (streams.get(peer) !== stream) return;
      streams.delete(peer);
      if (!streams.size && local.get(name) === streams) { local.delete(name); store.unwatch(name).catch(() => {}); }
      removeMember(name, peer).catch(e => console.error('leave failed:', e.message));
    }, GRACE_MS);
    stream.timer.unref();
  });
}

// ---------- Leaderboards ----------
const boardCache = new Map();
async function board(req, res, ip, code) {
  if (!LIMIT.read.allow(ip)) deny(429, 'rate_limited');
  if (!CODE_RE.test(code)) deny(400, 'bad_request');
  const now = Date.now();
  let cached = boardCache.get(code);
  if (!cached || now - cached.at > BOARD_CACHE_MS) {
    cached = { at: now, body: JSON.stringify({ entries: (await store.top(code, 200)).map(e => ({ id: e.id, tag: e.tag, s: e.s, n: e.n, r: dailyAge(code) === 0 ? undefined : e.r, at: e.at, d: e.d })) }) };
    boardCache.delete(code); boardCache.set(code, cached);
    if (boardCache.size > 5000) boardCache.delete(boardCache.keys().next().value);
  }
  res.writeHead(200, { ...SAFE_HEADERS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=5' });
  res.end(cached.body);
}
async function score(req, res, ip) {
  const uid = auth(req), body = await readJson(req);
  if (!LIMIT.scoreUser.allow(uid) || !LIMIT.scoreIp.allow(ip)) deny(429, 'rate_limited');
  if (overloaded) deny(503, 'busy');
  const checked = verifyRoute(body.code, body.r);
  if (!checked || checked.score <= 0) deny(422, 'invalid_route');
  if (dailyAge(body.code) !== null) {
    const attempt = await store.getAttempt(body.code, uid);
    if (!attempt || Date.now() > attempt.end + DAILY_LATE_MS) { json(res, 200, { accepted: false, reason: 'closed' }); return; }
  }
  const dur = num(body.d, 0, 3600000) ?? 0, entry = { s: checked.score, n: checked.n, r: body.r, at: Date.now(), d: dur };
  const accepted = await store.submit(body.code, uid, entry);
  if (accepted) boardCache.delete(body.code);
  json(res, 200, { accepted, entry: { r: entry.r, at: entry.at, d: entry.d, s: entry.s, n: entry.n } });
}
async function dailyStart(req, res) {
  const uid = auth(req), body = await readJson(req);
  if (!LIMIT.daily.allow(uid)) deny(429, 'rate_limited');
  if (body.code !== dailyCode()) deny(400, 'bad_request');
  const now = Date.now(), fresh = { start: now + DAILY_COUNTDOWN_MS, end: now + DAILY_COUNTDOWN_MS + DAILY_DUR, done: false };
  const old = await store.beginAttempt(body.code, uid, fresh), run = old || fresh;
  if (run.done || now >= run.end) { json(res, 200, { status: 'done' }); return; }
  json(res, 200, { status: old ? 'resume' : 'go', toStart: Math.max(0, run.start - now), left: run.end - now });
}
async function dailyFinish(req, res) {
  const uid = auth(req), body = await readJson(req);
  if (!LIMIT.daily.allow(uid)) deny(429, 'rate_limited');
  if (typeof body.code !== 'string' || !CODE_RE.test(body.code)) deny(400, 'bad_request');
  await store.endAttempt(body.code, uid);
  json(res, 200, { ok: true });
}
async function tag(req, res) {
  const uid = auth(req), body = await readJson(req);
  if (!LIMIT.tag.allow(uid)) deny(429, 'rate_limited');
  await store.setTag(uid, cleanTag(body.tag));
  json(res, 200, { ok: true });
}
let hotCache = { at: 0, body: '{"codes":[]}' };
async function hot(res) {
  if (Date.now() - hotCache.at > 30000) hotCache = { at: Date.now(), body: JSON.stringify({ codes: await store.hot(5) }) };
  res.writeHead(200, { ...SAFE_HEADERS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=30' });
  res.end(hotCache.body);
}

function servePage(req, res) {
  if (req.headers['if-none-match'] === pageTag) { res.writeHead(304, { ...SAFE_HEADERS, ETag: pageTag }); res.end(); return; }
  const gzip = /\bgzip\b/.test(req.headers['accept-encoding'] || ''), body = gzip ? pageGzip : page;
  res.writeHead(200, {
    ...SAFE_HEADERS, 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': CSP, ETag: pageTag, 'Cache-Control': 'no-cache', Vary: 'Accept-Encoding',
    'Content-Length': body.length, ...(gzip ? { 'Content-Encoding': 'gzip' } : {}),
  });
  res.end(req.method === 'HEAD' ? undefined : body);
}

async function route(req, res) {
  const url = new URL(req.url, 'http://x'), ip = clientIp(req), p = url.pathname, m = req.method;
  if ((m === 'GET' || m === 'HEAD') && (p === '/' || p === '/index.html')) { if (!LIMIT.page.allow(ip)) deny(429, 'rate_limited'); servePage(req, res); return; }
  if (m === 'GET' && p === '/api/health') { json(res, 200, { roshnight: true }); return; }
  if (m === 'GET' && p === '/api/time') { if (!LIMIT.read.allow(ip)) deny(429, 'rate_limited'); json(res, 200, { now: Date.now() }); return; }
  if (m === 'GET' && p === '/api/ready') { json(res, (await store.ping()) && !overloaded ? 200 : 503, { ready: true }); return; }
  if (m === 'GET' && p === '/api/hot') { if (!LIMIT.read.allow(ip)) deny(429, 'rate_limited'); await hot(res); return; }
  if (m === 'GET' && p.startsWith('/api/board/')) { await board(req, res, ip, p.slice(11)); return; }
  if (m === 'GET' && p === '/api/room/stream') { await roomStream(req, res, ip, url); return; }
  if (m === 'GET' && p === '/api/room/peers') { await roomPeers(req, res, ip, url); return; }
  if (m === 'POST') {
    checkOrigin(req);
    if (p === '/api/hello') return hello(req, res, ip);
    if (p === '/api/score') return score(req, res, ip);
    if (p === '/api/tag') return tag(req, res);
    if (p === '/api/daily/start') return dailyStart(req, res);
    if (p === '/api/daily/finish') return dailyFinish(req, res);
    if (p === '/api/room/create') return roomOpen(req, res, ip, true);
    if (p === '/api/room/join') return roomOpen(req, res, ip, false);
    if (p === '/api/room/presence') return roomPresence(req, res);
    if (p === '/api/room/leave') return roomLeave(req, res);
  }
  deny(404, 'not_found');
}

async function main() {
  store = await makeStore();
  store.onPublish(schedulePush);
  const server = http.createServer({ connectionsCheckingInterval: 1000 }, (req, res) => {
    route(req, res).catch(error => {
      if (res.headersSent) { res.destroy(); return; }
      if (error instanceof HttpError) { json(res, error.status, { error: error.code }, error.status === 503 ? { 'Retry-After': '5' } : undefined); return; }
      console.error('request failed:', error.message);
      json(res, 500, { error: 'server_error' });
    });
  });
  server.requestTimeout = 10000;
  server.headersTimeout = 5000;
  server.keepAliveTimeout = 5000;
  server.maxHeadersCount = 40;
  server.maxConnections = CFG.maxStreams + 10000;
  // A cap per address stops one machine using up every connection. Behind a proxy, the proxy does this.
  const socketsByIp = new Map();
  if (CFG.limits && !CFG.trustProxy) server.on('connection', socket => {
    const ip = socket.remoteAddress || '', count = (socketsByIp.get(ip) || 0) + 1;
    if (count > CFG.streamsPerIp * 3) { socket.destroy(); return; }
    socketsByIp.set(ip, count);
    socket.once('close', () => { const left = socketsByIp.get(ip) - 1; if (left > 0) socketsByIp.set(ip, left); else socketsByIp.delete(ip); });
  });
  server.on('clientError', (error, socket) => {
    // Browsers open spare connections early. Answering one that timed out would look like a failed page.
    if (error.code === 'ERR_HTTP_REQUEST_TIMEOUT' || !error.bytesParsed) { socket.destroy(); return; }
    if (socket.writable) socket.end(`HTTP/1.1 ${error.code === 'HPE_HEADER_OVERFLOW' ? '431 Request Header Fields Too Large' : '400 Bad Request'}\r\nConnection: close\r\n\r\n`);
  });
  server.listen(CFG.port, CFG.host, () => {
    console.log(`Roshnight is running.\n  On this PC:      http://localhost:${CFG.port}`);
    const lan = Object.values(require('node:os').networkInterfaces()).flat().find(a => a && a.family === 'IPv4' && !a.internal);
    if (lan) console.log(`  On your network: http://${lan.address}:${CFG.port}`);
    console.log(env.REDIS_URL ? '  Storage: Redis (shared between instances)' : '  Storage: this machine');
  });
  let stopping = false;
  const stop = async () => {
    if (stopping) return; stopping = true;
    server.close(); server.closeAllConnections();
    await store.close().catch(() => {});
    process.exit(0);
  };
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
}
process.on('unhandledRejection', error => console.error('unhandled:', error && error.message));
main().catch(error => { console.error(error.message); process.exit(1); });
