/* ---------- Scoring and panels ---------- */
function refresh(announce) {
  if (!trace) return;
  const before = score;
  score = trace(P, segs);
  let gs = 0, bs = 0, gn = 0, bn = 0, tn = 0, gain = 0, loss = false;
  const now = performance.now();
  for (let i = 0; i < N * N; i++) {
    const was = lit[i], is = B.val[i] && trace.isLit(i) ? 1 : 0;
    lit[i] = is; used[i] = P[i] && trace.isUsed(i) ? 1 : 0;
    if (announce && is && !was) {
      litAt[i] = now; const [r, c] = rc(i), [x, y] = center(r, c);
      if (floats.length < 24) floats.push({ x, y, s: fmtD(B.val[i]), c: B.val[i] > 0 ? COLOR.lamp : COLOR.hazard, t0: now });
      if (B.val[i] > 0) gain = Math.max(gain, B.val[i]); else loss = true;
    }
    if (B.val[i] > 0) { tn++; if (is) { gs += B.val[i]; gn++; } } else if (is) { bs -= B.val[i]; bn++; }
  }
  if (announce) { if (gain) sfx.good(gain); if (loss) sfx.bad(); }
  $("score").textContent = fmtS(score);
  if (announce && before !== score && !still) $("score").animate([{ transform: "scale(1.12)" }, { transform: "scale(1)" }], { duration: 160 });
  $("tally").textContent = `${gn} of ${tn} circles, +${gs}. ${bn} diamond${bn === 1 ? "" : "s"}, ${MINUS}${bs}.`;
  const { m, s } = count();
  ticks("tm", CM, CM - m); ticks("ts", CS, CS - s);
  $("gm").textContent = $("gs").textContent = glyph(orient);
  $("undo").disabled = !hist.length || locked;
  $("clear").disabled = locked;
  $("flip").disabled = locked;
  if (!blackout && !finished) {
    const r = encode();
    if (!bestRun || score > bestRun.score || (score === bestRun.score && r.length < bestRun.n)) {
      bestRun = { score, n: r.length, r, P: P.slice() };
      if (dailyRun) LS.set("roshnight-daily-layout-" + code, JSON.stringify(Array.from(P)));
      if (score > 0 && (localBest === null || score > localBest)) { localBest = score; LS.set("roshnight-best-" + code, String(score)); }
      offerScore(false);
      if (mode === "live" && M) M.room.presence({ sc: score, n: r.length }).catch(() => {});
    }
  }
  $("bestv").textContent = bestRun ? fmtS(bestRun.score) : "0";
  renderChips();
  rankUI(); renderPlayers(); makeGhost();
}
function ticks(id, total, left) { const t = $(id); if (t.children.length !== total) { t.textContent = ""; for (let i = 0; i < total; i++) t.append(el("i")); } [...t.children].forEach((x, i) => { x.className = i < left ? "" : "off"; }); }
function rankUI() {
  const showBot = botScore !== null && (finished || botDone);
  $("par").textContent = botScore === null ? "Bot searching" : (botDone ? `Bot ${fmtS(botScore)}` : `Bot ${fmtS(botScore)}, searching`);
  const mine = bestRun ? bestRun.score : score, ratio = botScore > 0 ? mine / botScore : 0;
  $("fill").style.width = Math.max(0, Math.min(1, ratio)) * 100 + "%";
  $("rank").textContent = !showBot ? "" : mine > botScore ? "Daybreak, you beat the bot" : ratio >= 1 ? "Daybreak" : ratio >= .95 ? "Lighthouse" : ratio >= .8 ? "Floodlight" : ratio >= .6 ? "Streetlight" : ratio >= .3 ? "Candle" : "Blackout";
}
function matchRows() {
  if (!M) return [];
  const rows = [];
  for (const p of roster()) {
    const q = p.presence; if (q.rid !== M.rid) continue;
    let sc = Math.max(-999, Math.min(9999, +q.sc || 0)), Q = null, n = Math.max(0, Math.min(14, q.n | 0));
    const done = q.st === "done" && Array.isArray(q.r);
    if (done) { const v = verify(code, q.r, true); if (v) { sc = v.score; n = v.n; Q = v.Q; } else sc = 0; }
    rows.push({ id: p.peer, name: typeof q.tag === "string" && q.tag ? q.tag.slice(0, 16) : "Player", sc, n, Q, done, me: p.sameTab });
  }
  return rows.sort((a, b) => b.sc - a.sc || a.n - b.n);
}
function setOverlay(id, Q) {
  if (overlayId === id || !Q) { overlay = null; overlayId = null; }
  else { const g = []; overTrace(Q, g); overlay = { segs: g, Q }; overlayId = id; }
  renderPlayers();
}
function renderPlayers() {
  if (screen !== "game" || !B) return;
  const box = $("players"); box.textContent = "";
  const rows = [];
  if (mode === "live") matchRows().forEach(r => rows.push({ id: r.id, name: r.name, sc: r.sc, me: r.me, sub: r.done ? `${r.n} pieces, finished` : `${r.n} pieces`, Q: r.Q }));
  else for (const e of entries(code).slice(0, 7)) rows.push({ id: e.id, name: nameOf(e.id), sc: e.score, me: e.id === uid, sub: `${e.n} pieces`, Q: e.Q });
  if (finished && botDone && botP) rows.push({ id: "bot", name: "Bot", sc: botScore, sub: "route open", Q: botP });
  rows.sort((a, b) => b.sc - a.sc);
  rows.forEach((r, i) => {
    const peek = r.Q && finished, b = el(peek ? "button" : "div", "pl" + (r.me ? " me" : "") + (overlayId === r.id ? " on" : ""));
    const nm = el("span", "", r.name + (r.me ? " (you)" : "")); nm.append(el("small", "", r.sub));
    b.append(el("span", "", i + 1), nm, el("span", "sc", fmtS(r.sc)));
    if (peek) { b.title = "Show this route on the map"; b.onclick = () => setOverlay(r.id, r.Q); }
    box.append(b);
  });
  const empty = $("pl-empty");
  empty.hidden = rows.length > 0;
  empty.textContent = db ? "No scores on this board yet." : "Leaders need the game server.";
}
function renderVerdict() {
  if (!finished || screen !== "game") return;
  const btns = $("vbtns"); btns.textContent = "";
  const add = (t, f, go) => { const b = el("button", go ? "go" : "", t); b.onclick = f; btns.append(b); };
  const botLine = botDone ? ` The bot found ${fmtS(botScore)}. Select it to see its route.` : " The bot's route opens here when its search finishes.";
  if (mode === "solo") {
    const pos = entries(code).findIndex(e => e.id === uid);
    $("vtitle").textContent = "Board over";
    $("vline").textContent = `Your best was ${fmtS(score)}${pos >= 0 ? `, ${ord(pos + 1)} on this board` : ""}.${botLine}`;
    if (dailyRun) {
      $("vline").textContent += " A new board arrives at midnight India time.";
      add("See leaderboard", () => { const c = code; exitGame(); openRanks(c); }, true);
      add("Menu", exitGame);
      return;
    }
    add("Play again", () => startSolo(code, roundDur), true);
    add("New game", () => { exitGame(); openSolo(); });
    add("Menu", exitGame);
  } else {
    const rows = matchRows(), meRow = rows.find(r => r.me), pos = meRow ? rows.indexOf(meRow) + 1 : 0, wait = rows.filter(r => !r.done).length;
    const won = pos === 1 && rows.length > 1;
    if (won && !M.cheered && wait === 0) { M.cheered = true; sfx.win(); }
    $("vtitle").textContent = wait ? "Finished" : (rows.length < 2 ? "Board over" : won ? "You win" : ord(pos) + " place");
    $("vline").textContent = wait ? `Waiting for ${wait} player${wait === 1 ? "" : "s"}. Your best is ${fmtS(score)}.` : `Your best was ${fmtS(score)}.${botLine}`;
    add("Back to room", exitGame, true);
    add("Leave room", () => { leaveRoom(); show("home"); });
  }
}
function makeGhost() {
  ghost = null;
  if (locked || !B) { if (finished) $("read").textContent = "The board has ended. Select a player or the bot to see that route."; else if (blackout) $("read").textContent = "Get ready."; return; }
  if (hover < 0) { hint(); return; }
  if (dragFrom >= 0 && moved) {
    if (free(hover) && !P[hover]) {
      const p = P[dragFrom]; P[dragFrom] = 0; P[hover] = p;
      const g = [], s = ghostTrace(P, g); P[hover] = 0; P[dragFrom] = p;
      ghost = { segs: g, at: hover, p };
      $("read").innerHTML = `${where(hover)} Move here: ${fmtD0(s - score)}, score becomes ${fmtS(s)}.`;
    } else $("read").innerHTML = `${where(hover)} A piece can't go here.`;
    return;
  }
  const v = B.val[hover];
  if (B.wall[hover]) { $("read").innerHTML = `${where(hover)} Blockade. It stops the beam.`; return; }
  if (v) { $("read").innerHTML = `${where(hover)} ${v > 0 ? "Circle" : "Diamond"} worth ${fmtD(v)}${lit[hover] ? ", already lit." : "."}`; return; }
  if (hover === B.src) { $("read").innerHTML = `${where(hover)} The beam starts here.`; return; }
  if (P[hover]) { const p = P[hover]; $("read").innerHTML = `${where(hover)} ${p <= 2 ? "Mirror" : "Splitter"} ${glyph(p & 1 ? 1 : 2)}${used[hover] ? "" : ", not on the beam yet"}. ${tool === "e" ? "Click to remove it." : "Click to flip it, drag to move it."}`; return; }
  if (tool === "e") { $("read").innerHTML = where(hover); return; }
  const { m, s } = count();
  if (tool === "m" ? m >= CM : s >= CS) { $("read").innerHTML = `${where(hover)} No ${tool === "m" ? "mirrors" : "splitters"} left. Erase or move one.`; return; }
  const p = orient + (tool === "s" ? 2 : 0); P[hover] = p;
  const g = [], sc = ghostTrace(P, g), reached = ghostTrace.isUsed(hover); P[hover] = 0;
  if (reached) { ghost = { segs: g, at: hover, p }; $("read").innerHTML = `${where(hover)} Place here: ${fmtD0(sc - score)}, score becomes ${fmtS(sc)}.`; }
  else { ghost = { segs: [], at: hover, p }; $("read").innerHTML = `${where(hover)} The beam doesn't reach this cell yet.`; }
}
const fmtD0 = d => (d >= 0 ? "+" + d : MINUS + Math.abs(d));
function hint() { $("read").textContent = "Click a cell on the beam to place a piece. Press R to flip its direction first."; }

