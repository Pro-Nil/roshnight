/* ---------- Boards and route checks ---------- */
const cache = new Map();
function boardOf(c) {
  let b = cache.get(c);
  if (!b) { const B = generate(c); b = { B, trace: L.tracer(B) }; cache.set(c, b); if (cache.size > 400) cache.delete(cache.keys().next().value); }
  return b;
}
function verify(c, r, allowEmpty) {
  if (!Array.isArray(r) || (!r.length && !allowEmpty) || r.length > CM + CS) return null;
  const { B, trace } = boardOf(c), Q = new Int8Array(N * N);
  let m = 0, s = 0;
  for (const v of r) {
    if (!Number.isInteger(v) || v < 1 || v >= N * N * 8) return null;
    const i = v >> 3, p = v & 7;
    if (p < 1 || p > 4 || Q[i] || B.wall[i] || B.val[i] || i === B.src) return null;
    Q[i] = p; if (p < 3) m++; else s++;
  }
  if (m > CM || s > CS) return null;
  return { score: trace(Q), n: r.length, Q };
}

