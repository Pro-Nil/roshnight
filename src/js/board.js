const L = CORE(), { N, DR, DC } = L;
const $ = id => document.getElementById(id);
const COLOR = { night: "#0a0e1c", block: "#1a2240", edge: "#39446e", grid: "rgba(152,160,194,.09)", grid5: "rgba(152,160,194,.2)",
  sodium: "255,174,66", lamp: "#ffd98a", hazard: "#ff5a86", glass: "#6fe9d6", mirror: "#eef5ff", tick: "#98a0c2", bot: "111,233,214" };
const LABEL = '"Barlow Condensed","Arial Narrow",sans-serif';
const CM = 12, CS = 2;

function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function hashCode(s) { let h = 2166136261; for (const ch of s) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
// A board's difficulty lives in its code, so scores, shared links and the server all agree. Normal codes carry no mark.
const LEVELS = {
  E: { name: "Easy", note: "Open streets, lots of circles and few diamonds.", blocks: [10, 6], guards: 1, wall: 0.15, avenue: 1, circles: [38, 8], diamonds: [7, 4], heavy: 0 },
  N: { name: "Normal", note: "The classic city.", blocks: [20, 9], guards: 2, wall: 0.5, avenue: 2, circles: [26, 8], diamonds: [16, 6], heavy: 0 },
  H: { name: "Hard", note: "More blockades, fewer circles and guarded prizes.", blocks: [32, 10], guards: 3, wall: 0.75, avenue: 3, circles: [18, 6], diamonds: [28, 8], heavy: 2 },
  X: { name: "Expert", note: "Packed with walls and heavy diamonds. Safe lines are rare.", blocks: [46, 12], guards: 4, wall: 1, avenue: 4, circles: [10, 5], diamonds: [42, 10], heavy: 4 }
};
const levelOf = code => { const m = /^0([EHX])/.exec(code); return m ? m[1] : "N"; };
function randomCode(level) { const a = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; let s = level && level !== "N" ? "0" + level : ""; for (let i = 0; i < 5; i++) s += a[Math.floor(Math.random() * a.length)]; return s; }

function generate(code) {
  const rnd = mulberry(hashCode(code)), ri = n => Math.floor(rnd() * n), lv = LEVELS[levelOf(code)];
  const wall = new Uint8Array(N * N), val = new Int16Array(N * N), windows = new Uint8Array(N * N);
  const side = ri(4), p = 3 + ri(24);
  const [r0, c0, dir] = [[p, 0, 0], [0, p, 1], [p, N - 1, 2], [N - 1, p, 3]][side];
  const src = r0 * N + c0, clear = new Set([src]);
  for (let k = 1; k <= 8; k++) clear.add((r0 + DR[dir] * k) * N + c0 + DC[dir] * k);

  const blocks = lv.blocks[0] + ri(lv.blocks[1]);
  for (let k = 0; k < blocks; k++) {
    const t = rnd(); let h, w;
    if (t < 0.25) { h = 1; w = 1 + ri(2); }
    else if (t < 0.7) { h = 1; w = 3 + ri(4); }
    else { h = 2; w = 2 + ri(3); }
    if (rnd() < 0.5) [h, w] = [w, h];
    const r = ri(N - h + 1), c = ri(N - w + 1);
    let ok = true;
    for (let a = r; a < r + h; a++) for (let b = c; b < c + w; b++) if (clear.has(a * N + b)) ok = false;
    if (!ok) continue;
    for (let a = r; a < r + h; a++) for (let b = c; b < c + w; b++) { wall[a * N + b] = 1; windows[a * N + b] = rnd() < 0.3 ? 1 + ri(3) : 0; }
  }
  const open = i => !wall[i] && !val[i] && i !== src;
  const put = (r, c, v) => { if (r < 0 || r >= N || c < 0 || c >= N) return false; const i = r * N + c; if (!open(i)) return false; val[i] = v; return true; };
  const circle = () => { const x = rnd(); return x < 0.55 ? 1 + ri(4) : x < 0.87 ? 5 + ri(5) : 10 + ri(4); };
  const diamond = () => { const x = rnd(); return -(lv.heavy + (x < 0.5 ? 1 + ri(4) : x < 0.85 ? 5 + ri(5) : 10 + ri(6))); };

  // Prizes are worth a lot, and heavy diamonds sit on the easy lines into them.
  for (let k = 0; k < 6; k++) {
    const r = 2 + ri(N - 4), c = 2 + ri(N - 4);
    if (!put(r, c, 14 + ri(12))) continue;
    const dirs = [0, 1, 2, 3];
    for (let s = 3; s > 0; s--) { const o = ri(s + 1); [dirs[s], dirs[o]] = [dirs[o], dirs[s]]; }
    for (let g = 0; g < lv.guards; g++) { const dist = 1 + ri(3); put(r + DR[dirs[g]] * dist, c + DC[dirs[g]] * dist, -(lv.heavy + 8 + ri(12))); }
    if (rnd() < lv.wall) { const x = r + DR[dirs[2]], y = c + DC[dirs[2]], i = x * N + y; if (open(i) && !clear.has(i)) { wall[i] = 1; windows[i] = 1 + ri(3); } }
  }
  // Avenues hold many circles, each with a diamond or two that forces a decision.
  for (let k = 0; k < 4; k++) {
    const line = 1 + ri(N - 2), horiz = rnd() < 0.5, count = 5 + ri(3);
    for (let m = 0; m < count; m++) { const q = ri(N); horiz ? put(line, q, 3 + ri(7)) : put(q, line, 3 + ri(7)); }
    for (let m = 0; m < lv.avenue; m++) { const q = ri(N); horiz ? put(line, q, diamond()) : put(q, line, diamond()); }
  }
  for (let k = lv.circles[0] + ri(lv.circles[1]); k > 0; k--) put(ri(N), ri(N), circle());
  for (let k = lv.diamonds[0] + ri(lv.diamonds[1]); k > 0; k--) put(ri(N), ri(N), diamond());
  return { wall, val, src, dir, windows, work: 2400000 };
}

const DAILY_DUR = 300000;
// A day runs midnight to midnight India time, so everyone shares one board.
const dayKey = (off = 0) => new Date(Date.now() + 19800000 - off * 86400000).toISOString().slice(0, 10);
function dailyCode(off = 0) {
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let n = hashCode("roshnight-day-" + dayKey(off)), s = "D";
  for (let i = 0; i < 5; i++) { s += abc[n % 32]; n = Math.floor(n / 32); }
  return s;
}
