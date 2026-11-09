const WORKER = function (L) {
  const { N, DR, DC, SL, tracer } = L, MIRRORS = 12, SPLITS = 2;
  const ri = n => Math.floor(Math.random() * n);
  self.onmessage = e => {
    const B = e.data, trace = tracer(B), P = new Int8Array(N * N);
    const free = new Uint8Array(N * N);
    for (let i = 0; i < N * N; i++) free[i] = (!B.wall[i] && !B.val[i] && i !== B.src) ? 1 : 0;
    const plus = [];
    let sum = 0;
    for (let i = 0; i < N * N; i++) if (B.val[i] > 0) { plus.push(i); sum += B.val[i]; }
    const mean = sum / Math.max(1, plus.length);
    let best = new Int8Array(N * N), bestF = trace(best) - 0, lastPost = 0;
    const post = (force) => {
      const now = performance.now();
      if (!force && now - lastPost < 250) return;
      lastPost = now;
      self.postMessage({ pieces: Array.from(best), done: false });
    };
    const offer = (A, f) => {
      if (f > bestF + 1e-9) { bestF = f; best = A.slice(); post(false); }
    };
    const fit = (A, segs) => { const s = trace(A, segs); return s - 0.01 * trace.hits; };

    function beam(width, deadline, keep) {
      let front = [[]];
      for (let depth = 0; depth < MIRRORS + SPLITS; depth++) {
        const pool = new Map(), segs = [], tmp = [];
        for (const st of front) {
          if (performance.now() > deadline) return;
          P.fill(0);
          let m = 0, s = 0;
          for (const v of st) { P[v >> 3] = v & 7; if ((v & 7) < 3) m++; else s++; }
          const kinds = [];
          if (m < MIRRORS) kinds.push(1, 2);
          if (s < SPLITS) kinds.push(3, 4);
          trace(P, segs);
          const tails = segs.filter(x => x[4] !== 0);
          for (const t of tails) for (let k = 1; k <= t[3]; k++) {
            const idx = (t[0] + DR[t[2]] * k) * N + t[1] + DC[t[2]] * k;
            if (!free[idx]) continue;
            for (const p of kinds) {
              const ns = st.concat(idx * 8 + p).sort((a, b) => a - b), key = ns.join();
              if (pool.has(key)) continue;
              P[idx] = p;
              const f = fit(P, tmp);
              P[idx] = 0;
              const ends = tmp.filter(x => x[4] !== 0).map(x => x[0] * 120 + x[1] * 4 + x[2]).sort().join();
              pool.set(key, { f, ns, ends });
            }
          }
        }
        if (!pool.size) return;
        const ranked = [...pool.values()].sort((a, b) => b.f - a.f);
        const A = new Int8Array(N * N);
        for (const v of ranked[0].ns) A[v >> 3] = v & 7;
        offer(A, ranked[0].f);
        for (const r of ranked.slice(0, 4)) { const C = new Int8Array(N * N); for (const v of r.ns) C[v >> 3] = v & 7; keep.push({ f: r.f, A: C }); }
        const per = new Map(); front = [];
        for (const r of ranked) {
          const n = per.get(r.ends) || 0;
          if (n < 3) { per.set(r.ends, n + 1); front.push(r.ns); if (front.length >= width) break; }
        }
      }
    }

    function anneal(start, deadline) {
      const hot = mean * 0.9, cold = mean * 0.05, t0 = performance.now(), span = Math.max(1, deadline - t0);
      let segs = [], cur = start.slice(), curF = fit(cur, segs), T = hot, k = 0, list = [], missing = [];
      const settle = () => {
        list = [];
        for (let i = 0; i < N * N; i++) if (cur[i]) { if (trace.isUsed(i)) list.push(i); else cur[i] = 0; }
        missing = plus.filter(i => !trace.isLit(i));
      };
      settle();
      const turn = (d, nd) => (SL[d] === nd ? 1 : 2);
      const propose = () => {
        const nw = cur.slice(), added = [], roll = Math.random();
        if (roll < 0.55 && missing.length) {
          let t = missing[ri(missing.length)];
          const t2 = missing[ri(missing.length)];
          if (B.val[t2] > B.val[t]) t = t2;
          const tr = (t / N) | 0, tc = t % N, two = roll > 0.4, start = ri(segs.length);
          for (let q = 0; q < segs.length; q++) {
            const g = segs[(q + start) % segs.length], d = g[2], hz = d % 2 === 0;
            if (!two) {
              const kk = hz ? (tc - g[1]) * DC[d] : (tr - g[0]) * DR[d];
              if (kk < 1 || kk > g[3]) continue;
              const r = g[0] + DR[d] * kk, c = g[1] + DC[d] * kk, idx = r * N + c;
              if (!free[idx] || (hz ? r === tr : c === tc)) continue;
              const nd = hz ? (tr > r ? 1 : 3) : (tc > c ? 0 : 2);
              nw[idx] = turn(d, nd) + (Math.random() < 0.3 ? 2 : 0);
              added.push(idx); break;
            }
            if (!g[3]) continue;
            const kk = 1 + ri(g[3]), r = g[0] + DR[d] * kk, c = g[1] + DC[d] * kk, idx = r * N + c;
            if (!free[idx] || r === tr || c === tc) continue;
            const corner = hz ? tr * N + c : r * N + tc;
            if (!free[corner]) continue;
            const nd = hz ? (tr > r ? 1 : 3) : (tc > c ? 0 : 2);
            const last = hz ? (tc > c ? 0 : 2) : (tr > r ? 1 : 3);
            nw[idx] = turn(d, nd) + (Math.random() < 0.3 ? 2 : 0);
            nw[corner] = turn(nd, last);
            added.push(idx, corner); break;
          }
          if (!added.length) return null;
        } else if (roll < 0.65 && list.length) {
          const i = list[ri(list.length)]; nw[i] = nw[i] & 1 ? nw[i] + 1 : nw[i] - 1;
        } else if (roll < 0.75 && list.length) {
          const i = list[ri(list.length)]; nw[i] = nw[i] <= 2 ? nw[i] + 2 : nw[i] - 2;
        } else if (roll < 0.9 && list.length) {
          const i = list[ri(list.length)], d = ri(4), s = 1 + ri(3);
          const r = ((i / N) | 0) + DR[d] * s, c = i % N + DC[d] * s;
          if (r < 0 || r >= N || c < 0 || c >= N) return null;
          const j = r * N + c;
          if (!free[j] || nw[j]) return null;
          nw[j] = nw[i]; nw[i] = 0; added.push(j);
        } else if (roll < 0.95 && list.length) {
          nw[list[ri(list.length)]] = 0;
        } else {
          if (!segs.length) return null;
          const g = segs[ri(segs.length)];
          if (!g[3]) return null;
          const kk = 1 + ri(g[3]), idx = (g[0] + DR[g[2]] * kk) * N + g[1] + DC[g[2]] * kk;
          if (!free[idx]) return null;
          nw[idx] = 1 + ri(2) + (Math.random() < 0.3 ? 2 : 0); added.push(idx);
        }
        for (const [lo, hi, cap] of [[1, 2, MIRRORS], [3, 4, SPLITS]]) {
          const have = [];
          for (let i = 0; i < N * N; i++) if (nw[i] >= lo && nw[i] <= hi) have.push(i);
          let over = have.length - cap;
          if (over <= 0) continue;
          const spare = have.filter(i => !added.includes(i));
          while (over-- > 0) {
            if (!spare.length) return null;
            nw[spare.splice(ri(spare.length), 1)[0]] = 0;
          }
        }
        return nw;
      };
      let tmp = [];
      for (;;) {
        if (!(++k & 127)) {
          const now = performance.now();
          if (now >= deadline) return;
          T = hot * Math.pow(cold / hot, (now - t0) / span);
        }
        const nw = propose();
        if (!nw) continue;
        const f = fit(nw, tmp);
        if (f >= curF || Math.random() < Math.exp((f - curF) / T)) {
          cur = nw; curF = f;
          const sw = segs; segs = tmp; tmp = sw;
          settle();
          offer(cur, f);
        }
      }
    }

    const t0 = performance.now(), total = B.ms, keep = [];
    let width = 30;
    while (performance.now() - t0 < total * 0.35) { beam(width, t0 + total * 0.35, keep); width *= 2; }
    keep.sort((a, b) => b.f - a.f);
    const seeds = keep.slice(0, 10), rounds = 8;
    for (let i = 0; i < rounds; i++) {
      const now = performance.now(), left = t0 + total - now;
      if (left <= 0) break;
      const start = (i % 2 || !seeds.length) ? best : seeds[(i / 2 | 0) % seeds.length].A;
      anneal(start, now + left / (rounds - i));
    }
    self.postMessage({ pieces: Array.from(best), done: true });
  };
};

