/* ---------- Leaderboard screen ---------- */
let rkCode = null, rkTimed = false;
function openRanks(c) { rkCode = c || rkCode || dailyCode(); $("rk-code").value = rkCode; show("ranks"); renderRanks(); }
function renderRanks() {
  if (!rkCode) return;
  $("rk-all").setAttribute("aria-pressed", String(!rkTimed)); $("rk-timed").setAttribute("aria-pressed", String(rkTimed));
  const t = $("rk-table"), rows = entries(rkCode, rkTimed);
  t.textContent = "";
  const head = el("div", "tr head");
  head.append(el("span", "", "#"), el("span", "", "Player"), el("span", "wide", "Pieces"), el("span", "dim", "Score"), el("span", "dim", "When"));
  t.append(head);
  rows.slice(0, 100).forEach((e, i) => {
    const r = el("div", "tr" + (e.id === uid ? " me" : ""));
    r.append(el("span", "", i + 1), el("span", "", nameOf(e.id) + (e.id === uid ? " (you)" : "")), el("span", "wide", `${e.n}${e.timed ? ", timed" : ""}`), el("span", "sc", fmtS(e.score)), el("span", "dim", ago(e.at)));
    t.append(r);
  });
  const note = $("rk-note");
  if (!db) note.textContent = "Leaderboards appear for signed-in people with access to this page.";
  else if (dbState === "loading") note.textContent = "Loading scores.";
  else if (dbState === "slow" || dbState === "error") note.textContent = "Scores can't be reached right now.";
  else if (!rows.length) note.textContent = `No ${rkTimed ? "timed " : ""}scores on ${rkCode} yet. Play it and take first place.`;
  else note.textContent = `${rows.length} player${rows.length === 1 ? "" : "s"} on ${rkCode}. Every score is recalculated from the route that earned it.`;
}
function renderShared() {
  if (screen === "home") renderHome();
  if (screen === "ranks") renderRanks();
  if (screen === "game") { renderPlayers(); renderVerdict(); }
}

