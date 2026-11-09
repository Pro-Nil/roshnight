const CORE = function () {
  const N = 30, DR = [0, 1, 0, -1], DC = [1, 0, -1, 0], SL = [3, 2, 1, 0], BS = [1, 0, 3, 2];
  // Piece codes: 1 mirror /, 2 mirror \, 3 splitter /, 4 splitter \.
  function tracer(B) {
    const seen = new Int32Array(N * N * 4), lit = new Int32Array(N * N), used = new Int32Array(N * N);
    const stack = new Int32Array(N * N * 8);
    let st = 0;
    const run = function (P, segs) {
      st++; let sp = 0, score = 0, hits = 0;
      stack[sp++] = B.src * 4 + B.dir;
      if (segs) segs.length = 0;
      while (sp) {
        const s = stack[--sp];
        if (seen[s] === st) continue;
        seen[s] = st;
        const d = s & 3, i0 = s >> 2;
        let r = (i0 / N) | 0, c = i0 % N, len = 0, end = 1;
        const r0 = r, c0 = c;
        for (;;) {
          const x = r + DR[d], y = c + DC[d];
          if (x < 0 || x >= N || y < 0 || y >= N) { end = 1; break; }
          const j = x * N + y;
          if (B.wall[j]) { end = 2; break; }
          r = x; c = y; len++;
          if (B.val[j] && lit[j] !== st) { lit[j] = st; score += B.val[j]; }
          const p = P[j];
          if (p) {
            if (used[j] !== st) { used[j] = st; hits++; }
            stack[sp++] = j * 4 + ((p & 1) ? SL[d] : BS[d]);
            if (p > 2) stack[sp++] = j * 4 + d;
            end = 0; break;
          }
        }
        if (segs) segs.push([r0, c0, d, len, end]);
      }
      run.hits = hits;
      return score;
    };
    run.isLit = j => lit[j] === st;
    run.isUsed = j => used[j] === st;
    return run;
  }
  return { N, DR, DC, SL, BS, tracer };
};

