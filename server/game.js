'use strict';
// Runs the game's own board and beam code on the server, so scores are never taken on trust.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const JS = path.join(__dirname, '..', 'src', 'js');
const source = ['core.js', 'board.js'].map(f => fs.readFileSync(path.join(JS, f), 'utf8')).join('\n');
const engine = vm.runInNewContext(`${source}\n;({ generate, L, CM, CS, N })`, Object.create(null), { timeout: 2000 });
const { generate, L, CM, CS, N } = engine;

const CODE_RE = /^[A-Z0-9]{1,10}$/;
const CACHE_LIMIT = 5000;
const cache = new Map();

function boardOf(code) {
  let entry = cache.get(code);
  if (entry) { cache.delete(code); cache.set(code, entry); return entry; }
  const B = generate(code);
  entry = { B, trace: L.tracer(B) };
  cache.set(code, entry);
  if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value);
  return entry;
}

// Returns { score, n } for a legal route, or null.
function verifyRoute(code, route) {
  if (typeof code !== 'string' || !CODE_RE.test(code)) return null;
  if (!Array.isArray(route) || route.length < 1 || route.length > CM + CS) return null;
  const { B, trace } = boardOf(code);
  const placed = new Int8Array(N * N);
  let mirrors = 0, splitters = 0;
  for (const value of route) {
    if (!Number.isInteger(value) || value < 1 || value >= N * N * 8) return null;
    const cell = value >> 3, piece = value & 7;
    if (piece < 1 || piece > 4 || placed[cell] || B.wall[cell] || B.val[cell] || cell === B.src) return null;
    placed[cell] = piece;
    if (piece < 3) mirrors++; else splitters++;
  }
  if (mirrors > CM || splitters > CS) return null;
  return { score: trace(placed), n: route.length };
}

module.exports = { verifyRoute, CODE_RE, generate };
