'use strict';
// Works out the bot's route for the daily board once, in a background thread, so every player gets the
// same answer and phones skip the search. The search is the game's own bot code, unchanged.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { Worker, isMainThread, parentPort, workerData } = require('node:worker_threads');

const JS = path.join(__dirname, '..', 'src', 'js');

function search(code) {
  const read = f => fs.readFileSync(path.join(JS, f), 'utf8');
  const bot = read('bot.js').split('/* ---------- Bot')[0];
  let pieces = null;
  const self = { postMessage: m => { if (m.done) pieces = m.pieces; } };
  const sandbox = { self, performance: { now: () => Date.now() } };
  const { CORE, generate, hashCode, WORKER } = vm.runInNewContext(
    `${read('core.js')}\n${read('board.js')}\n${bot}\n;({ CORE, generate, hashCode, WORKER })`, sandbox);
  WORKER(CORE());
  const B = generate(code);
  self.onmessage({ data: { wall: B.wall, val: B.val, src: B.src, dir: B.dir, work: B.work, seed: hashCode(`bot:${code}`) } });
  const P = Int8Array.from(pieces), r = [];
  for (let i = 0; i < P.length; i++) if (P[i]) r.push(i * 8 + P[i]);
  return { r, s: CORE().tracer(B)(P) };
}

if (!isMainThread) {
  parentPort.postMessage(search(workerData.code));
} else {
  const results = new Map();
  // Returns { r, s } when ready, or null while the search is still running.
  const botFor = code => {
    let entry = results.get(code);
    if (!entry) {
      entry = { result: null };
      results.set(code, entry);
      if (results.size > 4) results.delete(results.keys().next().value);
      const started = Date.now();
      const worker = new Worker(__filename, { workerData: { code } });
      worker.once('message', result => { entry.result = result; console.log(`  Bot for ${code}: ${result.s} in ${((Date.now() - started) / 1000).toFixed(1)}s`); });
      worker.once('error', error => { console.error('bot search failed:', error.message); results.delete(code); });
      worker.once('exit', exit => { if (exit && !entry.result) results.delete(code); });
    }
    return entry.result;
  };
  module.exports = { botFor, search };
}
