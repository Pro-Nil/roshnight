/* ---------- Game state ---------- */
const cv = $("cv"), ctx = cv.getContext("2d"), wrap = $("wrap"), stat = document.createElement("canvas"), statW = document.createElement("canvas");
let B, code, trace, ghostTrace, overTrace, P = new Int8Array(N * N), hist = [];
let tool = "m", orient = 1, hover = -1, dragFrom = -1, moved = false, pressed = false, touching = false;
let segs = [], score = 0, lit = new Uint8Array(N * N), used = new Uint8Array(N * N), litAt = new Float64Array(N * N), floats = [];
let ghost = null, botP = null, botScore = null, botDone = false, worker = null, overlay = null, overlayId = null;
let bestRun = null, saved = [];
let roundDur = 180000;
let mode = "solo", locked = false, finished = false, blackout = false, startAt = 0, endAt = 0, revealAt = 0, lastSec = -1, localBest = null;
let cs = 20, ox = 0, oy = 0, dpr = 1, size = 0;
const free = i => !B.wall[i] && !B.val[i] && i !== B.src;
const count = () => { let m = 0, s = 0; for (let i = 0; i < N * N; i++) { if (P[i] === 1 || P[i] === 2) m++; else if (P[i] > 2) s++; } return { m, s }; };
const rc = i => [(i / N) | 0, i % N];
const where = i => { const [r, c] = rc(i); return `<b>Row ${r + 1}, column ${c + 1}.</b>`; };
const glyph = o => (o === 1 ? "/" : "\\");
function encode() { const r = []; for (let i = 0; i < N * N; i++) if (P[i] && used[i]) r.push(i * 8 + P[i]); return r; }

function startGame(c, opts) {
  code = c; mode = opts.mode;
  const b = boardOf(code); B = b.B;
  trace = L.tracer(B); ghostTrace = L.tracer(B); overTrace = L.tracer(B);
  P = new Int8Array(N * N);
  hist = []; hover = -1; ghost = null; dragFrom = -1; moved = false; overlay = null; overlayId = null; floats = []; litAt.fill(0);
  finished = false; lastSec = -1; lit.fill(0); bestRun = null; saved = [];
  localBest = +LS.get("roshnight-best-" + code) || null;
  $("verdict").hidden = true; $("toolbox").hidden = false;
  $("chip").textContent = "Board " + code;
  $("timer").classList.remove("low");
  $("pl-head").textContent = mode === "live" ? "Standings" : "Board leaders";
  startAt = opts.startAt; endAt = opts.endAt; roundDur = endAt - startAt;
  blackout = Date.now() < startAt; locked = blackout; $("count").hidden = !blackout;
  revealAt = blackout ? 0 : performance.now();
  show("game");
  refresh(false);
  runBot();
}
function tick() {
  if (screen !== "game" || finished) return;
  const now = Date.now();
  if (now < startAt) {
    const s = Math.ceil((startAt - now) / 1000);
    if (s !== lastSec) { lastSec = s; $("count").textContent = s; sfx.beep(); }
    $("timer").textContent = clock(endAt - startAt);
    return;
  }
  if (blackout) { blackout = false; locked = false; $("count").hidden = true; revealAt = performance.now(); sfx.go(); refresh(false); cv.focus({ preventScroll: true }); }
  const left = endAt - now, sec = Math.ceil(left / 1000);
  if (sec !== lastSec) {
    lastSec = sec; $("timer").textContent = clock(left);
    $("timer").classList.toggle("low", left <= 30000);
    if (sec <= 10 && sec > 0) sfx.tick();
  }
  if (left <= 0) finish();
}
setInterval(tick, 100);
function finish() {
  if (finished) return;
  finished = true; locked = true; hover = -1; ghost = null; dragFrom = -1; pressed = false;
  $("count").hidden = true; blackout = false;
  $("toolbox").hidden = true; $("verdict").hidden = false;
  if (bestRun) { P = bestRun.P.slice(); hist = []; }
  refresh(false);
  offerScore(true);
  if (M && M.rid) M.room.presence({ st: "done", sc: score, n: encode().length, r: encode() }).catch(() => {});
  renderVerdict(); renderPlayers();
  sfx.end();
}
function exitGame() {
  if (!finished) { finished = true; const b = bestRun; offerScore(true); if (M && M.rid) M.room.presence({ st: "done", sc: b ? b.score : 0, n: b ? b.n : 0, r: b ? b.r : [] }).catch(() => {}); }
  $("count").hidden = true;
  if (worker) { worker.terminate(); worker = null; }
  flushScore();
  if (M) backToLobby(); else show("home");
}

