/* ---------- Drawing ---------- */
function drawStatic() {
  for (const c of [stat, statW]) { c.width = size * dpr; c.height = size * dpr; }
  const g = stat.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = COLOR.night; g.fillRect(0, 0, size, size);
  for (let k = 0; k <= N; k++) {
    g.strokeStyle = k % 5 === 0 ? COLOR.grid5 : COLOR.grid; g.lineWidth = 1;
    g.beginPath(); g.moveTo(ox, oy + k * cs + .5); g.lineTo(ox + N * cs, oy + k * cs + .5);
    g.moveTo(ox + k * cs + .5, oy); g.lineTo(ox + k * cs + .5, oy + N * cs); g.stroke();
  }
  if (ox >= 16) {
    g.fillStyle = COLOR.tick; g.font = `600 12px ${LABEL}`; g.textAlign = "center"; g.textBaseline = "middle";
    for (let k = 5; k <= N; k += 5) { g.fillText(k, ox + (k - .5) * cs, oy - 9); g.fillText(k, ox - 11, oy + (k - .5) * cs); }
  }
  const w = statW.getContext("2d"); w.setTransform(dpr, 0, 0, dpr, 0, 0);
  for (let i = 0; i < N * N; i++) if (B.wall[i]) {
    const [r, c] = rc(i), x = ox + c * cs, y = oy + r * cs;
    w.fillStyle = COLOR.block; w.fillRect(x, y, cs + 1, cs + 1);
    if (B.windows[i]) {
      w.fillStyle = "rgba(255,217,138,.3)";
      const s = Math.max(1.5, cs * .1), n = B.windows[i];
      for (let q = 0; q < n; q++) w.fillRect(x + cs * (.25 + .25 * q), y + cs * (.3 + .2 * (q % 2)), s, s * 1.4);
    }
  }
  w.strokeStyle = COLOR.edge; w.lineWidth = 1; w.beginPath();
  for (let i = 0; i < N * N; i++) if (B.wall[i]) {
    const [r, c] = rc(i), x = ox + c * cs + .5, y = oy + r * cs + .5;
    if (r === 0 || !B.wall[i - N]) { w.moveTo(x, y); w.lineTo(x + cs, y); }
    if (r === N - 1 || !B.wall[i + N]) { w.moveTo(x, y + cs); w.lineTo(x + cs, y + cs); }
    if (c === 0 || !B.wall[i - 1]) { w.moveTo(x, y); w.lineTo(x, y + cs); }
    if (c === N - 1 || !B.wall[i + 1]) { w.moveTo(x + cs, y); w.lineTo(x + cs, y + cs); }
  }
  w.stroke();
}
function resize() {
  if (!B || screen !== "game") return;
  const s = Math.floor(Math.min(wrap.clientWidth, wrap.clientHeight));
  if (s <= 0) return;
  size = s; dpr = Math.min(window.devicePixelRatio || 1, 2);
  cv.width = s * dpr; cv.height = s * dpr; cv.style.width = s + "px"; cv.style.height = s + "px";
  const wide = s >= 520;
  cs = Math.floor((s - (wide ? 44 : 2)) / N);
  ox = wide ? 24 : Math.floor((s - cs * N) / 2);
  oy = wide ? 22 : Math.floor((s - cs * N) / 2);
  drawStatic();
}
const center = (r, c) => [ox + (c + .5) * cs, oy + (r + .5) * cs];
function ends(g) { const [r, c, d, len, end] = g, [x0, y0] = center(r, c), reach = len + (end ? .5 : 0); return [x0, y0, x0 + DC[d] * reach * cs, y0 + DR[d] * reach * cs]; }
function strokeSegs(list) { ctx.beginPath(); for (const g of list) { const [a, b, x, y] = ends(g); ctx.moveTo(a, b); ctx.lineTo(x, y); } ctx.stroke(); }
function drawPiece(i, p, alpha, color) {
  const [r, c] = rc(i), [x, y] = center(r, c), s = cs * .4, sgn = (p & 1) ? -1 : 1;
  ctx.save(); ctx.globalAlpha = alpha; ctx.lineCap = "round";
  if (p <= 2) { ctx.strokeStyle = color || COLOR.mirror; ctx.lineWidth = Math.max(2.2, cs * .15); ctx.beginPath(); ctx.moveTo(x - s, y - sgn * s); ctx.lineTo(x + s, y + sgn * s); ctx.stroke(); }
  else {
    ctx.strokeStyle = color || COLOR.glass; ctx.fillStyle = color || COLOR.glass; ctx.lineWidth = Math.max(1.6, cs * .09);
    ctx.beginPath(); ctx.moveTo(x - s, y - sgn * s); ctx.lineTo(x - s * .35, y - sgn * s * .35); ctx.moveTo(x + s * .35, y + sgn * s * .35); ctx.lineTo(x + s, y + sgn * s); ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, Math.max(1.8, cs * .12), 0, 7); ctx.fill();
  }
  ctx.restore();
}
function drawTarget(i, t) {
  const v = B.val[i], [r, c] = rc(i), [x, y] = center(r, c), on = lit[i], mag = Math.min(Math.abs(v), 25) / 25;
  const col = v > 0 ? COLOR.lamp : COLOR.hazard;
  let R = cs * (.3 + .17 * mag);
  if (on && litAt[i] && !still) { const k = (t - litAt[i]) / 260; if (k < 1) R *= 1 + .5 * (1 - k); }
  let a = 1;
  if (revealAt && !still) a = Math.max(0, Math.min(1, (t - revealAt - ((i * 2654435761) >>> 0) % 650) / 180));
  if (a <= 0) return;
  ctx.save(); ctx.globalAlpha = a;
  if (on) { ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.fillStyle = v > 0 ? "rgba(255,190,90,.22)" : "rgba(255,90,134,.25)"; ctx.beginPath(); ctx.arc(x, y, R * 1.9, 0, 7); ctx.fill(); ctx.restore(); }
  ctx.beginPath();
  if (v > 0) ctx.arc(x, y, R, 0, 7);
  else { const q = R * 1.18; ctx.moveTo(x, y - q); ctx.lineTo(x + q, y); ctx.lineTo(x, y + q); ctx.lineTo(x - q, y); ctx.closePath(); }
  if (on) { ctx.fillStyle = col; ctx.fill(); } else { ctx.fillStyle = COLOR.night; ctx.fill(); ctx.strokeStyle = col; ctx.lineWidth = 1.3; ctx.stroke(); }
  if (cs >= 10) { ctx.fillStyle = on ? COLOR.night : col; ctx.font = `700 ${Math.round(cs * .58)}px ${LABEL}`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(Math.abs(v), x, y + .5); }
  ctx.restore();
}
function draw(t) {
  if (!size || !B || screen !== "game") return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.globalAlpha = 1; ctx.setLineDash([]);
  ctx.drawImage(stat, 0, 0, size, size);
  if (blackout) return;
  if (revealAt && !still) ctx.globalAlpha = Math.min(1, (t - revealAt) / 500);
  ctx.drawImage(statW, 0, 0, size, size); ctx.globalAlpha = 1;
  if (hover >= 0 && !locked) { const [r, c] = rc(hover); ctx.fillStyle = "rgba(160,168,201,.1)"; ctx.fillRect(ox, oy + r * cs, N * cs, cs); ctx.fillRect(ox + c * cs, oy, cs, N * cs); }
  ctx.lineCap = "round"; ctx.globalCompositeOperation = "lighter";
  for (const [w, a] of [[cs * 3.4, .05], [cs * 1.5, .1], [cs * .45, .32]]) { ctx.strokeStyle = `rgba(${COLOR.sodium},${a})`; ctx.lineWidth = w; strokeSegs(segs); }
  ctx.strokeStyle = "rgb(255,240,212)"; ctx.lineWidth = Math.max(1.6, cs * .09); strokeSegs(segs);
  if (!still) { ctx.setLineDash([.1, cs * 1.3]); ctx.lineDashOffset = -(t / 28) % (cs * 1.3); ctx.strokeStyle = "#fff"; ctx.lineWidth = Math.max(2.6, cs * .17); for (const g of segs) strokeSegs([g]); ctx.setLineDash([]); }
  ctx.globalCompositeOperation = "source-over";
  if (overlay) { ctx.strokeStyle = `rgba(${COLOR.bot},.8)`; ctx.lineWidth = 1.8; ctx.setLineDash([cs * .4, cs * .25]); strokeSegs(overlay.segs); ctx.setLineDash([]); }
  if (ghost) { ctx.strokeStyle = `rgba(${COLOR.sodium},.8)`; ctx.lineWidth = 1.5; ctx.setLineDash([cs * .25, cs * .25]); strokeSegs(ghost.segs); ctx.setLineDash([]); }
  for (let i = 0; i < N * N; i++) if (B.val[i]) drawTarget(i, t);
  const [sr, sc] = rc(B.src), [sx, sy] = center(sr, sc), q = cs * .42;
  ctx.save(); ctx.translate(sx, sy); ctx.rotate(B.dir * Math.PI / 2); ctx.fillStyle = "#ff6b3d"; ctx.beginPath(); ctx.moveTo(q, 0); ctx.lineTo(-q * .8, -q * .85); ctx.lineTo(-q * .8, q * .85); ctx.closePath(); ctx.fill(); ctx.restore();
  if (overlay) for (let i = 0; i < N * N; i++) if (overlay.Q[i]) drawPiece(i, overlay.Q[i], .9, `rgb(${COLOR.bot})`);
  for (let i = 0; i < N * N; i++) if (P[i] && !(dragFrom === i && moved)) drawPiece(i, P[i], used[i] ? 1 : .42);
  if (ghost) drawPiece(ghost.at, ghost.p, .78);
  if (hover >= 0 && !locked) { const [r, c] = rc(hover); ctx.strokeStyle = COLOR.lamp; ctx.lineWidth = 1.2; ctx.strokeRect(ox + c * cs + .5, oy + r * cs + .5, cs, cs); }
  if (floats.length) {
    ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.font = `800 ${Math.max(15, cs * .9)}px ${LABEL}`;
    floats = floats.filter(f => t - f.t0 < 800);
    for (const f of floats) { const k = (t - f.t0) / 800; ctx.globalAlpha = 1 - k; ctx.fillStyle = f.c; ctx.fillText(f.s, f.x, f.y - k * cs * 2); }
    ctx.globalAlpha = 1;
  }
  if (touching && hover >= 0) {
    const [r, c] = rc(hover), [x, y] = center(r, c), rad = 62, z = 3, ly = y - 100 < rad ? y + 100 : y - 100, lx = Math.max(rad, Math.min(size - rad, x));
    ctx.save(); ctx.beginPath(); ctx.arc(lx, ly, rad, 0, 7); ctx.fillStyle = COLOR.night; ctx.fill(); ctx.clip();
    ctx.drawImage(cv, (x - rad / z) * dpr, (y - rad / z) * dpr, 2 * rad / z * dpr, 2 * rad / z * dpr, lx - rad, ly - rad, 2 * rad, 2 * rad);
    ctx.restore();
    ctx.strokeStyle = COLOR.lamp; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(lx, ly, rad, 0, 7); ctx.stroke();
  }
}
function loop(t) { if (!document.hidden) { draw(t); if (screen !== "game") drawBg(t); } requestAnimationFrame(loop); }

