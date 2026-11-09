const L = CORE(), { N, DR, DC } = L;
const $ = id => document.getElementById(id);
const COLOR = { night: "#0a0e1c", block: "#1a2240", edge: "#39446e", grid: "rgba(152,160,194,.09)", grid5: "rgba(152,160,194,.2)",
  sodium: "255,174,66", lamp: "#ffd98a", hazard: "#ff5a86", glass: "#6fe9d6", mirror: "#eef5ff", tick: "#98a0c2", bot: "111,233,214" };
const LABEL = '"Barlow Condensed","Arial Narrow",sans-serif';
const CM = 12, CS = 2;

function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function hashCode(s) { let h = 2166136261; for (const ch of s) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function randomCode() { const a = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; let s = ""; for (let i = 0; i < 5; i++) s += a[Math.floor(Math.random() * a.length)]; return s; }

function generate(code) {
  const rnd = mulberry(hashCode(code)), ri = n => Math.floor(rnd() * n);
  const wall = new Uint8Array(N * N), val = new Int16Array(N * N), windows = new Uint8Array(N * N);
  const side = ri(4), p = 3 + ri(24);
  const [r0, c0, dir] = [[p, 0, 0], [0, p, 1], [p, N - 1, 2], [N - 1, p, 3]][side];
  const src = r0 * N + c0, clear = new Set([src]);
  for (let k = 1; k <= 8; k++) clear.add((r0 + DR[dir] * k) * N + c0 + DC[dir] * k);

  const blocks = 20 + ri(9);
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
  const diamond = () => { const x = rnd(); return -(x < 0.5 ? 1 + ri(4) : x < 0.85 ? 5 + ri(5) : 10 + ri(6)); };

  // Prizes are worth a lot, and heavy diamonds sit on the easy lines into them.
  for (let k = 0; k < 6; k++) {
    const r = 2 + ri(N - 4), c = 2 + ri(N - 4);
    if (!put(r, c, 14 + ri(12))) continue;
    const dirs = [0, 1, 2, 3].sort(() => rnd() - 0.5);
    for (let g = 0; g < 2; g++) { const dist = 1 + ri(3); put(r + DR[dirs[g]] * dist, c + DC[dirs[g]] * dist, -(8 + ri(12))); }
    if (rnd() < 0.5) { const x = r + DR[dirs[2]], y = c + DC[dirs[2]], i = x * N + y; if (open(i) && !clear.has(i)) { wall[i] = 1; windows[i] = 1 + ri(3); } }
  }
  // Avenues hold many circles, each with a diamond or two that forces a decision.
  for (let k = 0; k < 4; k++) {
    const line = 1 + ri(N - 2), horiz = rnd() < 0.5, count = 5 + ri(3);
    for (let m = 0; m < count; m++) { const q = ri(N); horiz ? put(line, q, 3 + ri(7)) : put(q, line, 3 + ri(7)); }
    for (let m = 0; m < 2; m++) { const q = ri(N); horiz ? put(line, q, diamond()) : put(q, line, diamond()); }
  }
  for (let k = 26 + ri(8); k > 0; k--) put(ri(N), ri(N), circle());
  for (let k = 16 + ri(6); k > 0; k--) put(ri(N), ri(N), diamond());
  return { wall, val, src, dir, windows, ms: 9000 };
}

