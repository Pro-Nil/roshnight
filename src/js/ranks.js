/* ---------- Leaderboard screen ---------- */
let rkCode = null, rkDay = null;
function dayOffset(c) { for (let i = 0; i <= 60; i++) if (dailyCode(i) === c) return i; return null; }
function openRanks(c) { setRanks(c || rkCode || dailyCode()); show("ranks"); renderRanks(); }
function setRanks(c) { rkCode = c; rkDay = dayOffset(c); $("rk-code").value = c; }
function statBox(label, value) { const s = el("div", "stat"); s.append(el("span", "lab", label), el("b", "", value)); return s; }
function renderRanks() {
  if (!rkCode) return;
  const rows = entries(rkCode), daily = rkDay !== null;
  $("rk-days").hidden = !daily;
  if (daily) {
    const d = new Date(dayKey(rkDay) + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
    $("rk-daylabel").textContent = `${rkDay === 0 ? "Today" : d}, board ${rkCode}`;
    $("rk-next").disabled = rkDay === 0; $("rk-prev").disabled = rkDay >= 60;
  }
  const st = $("rk-stats"), mine = uid ? rows.findIndex(e => e.id === uid) : -1; st.textContent = "";
  const avg = rows.length ? Math.round(rows.reduce((a, e) => a + e.score, 0) / rows.length) : null;
  st.append(statBox("Players", String(rows.length)), statBox("Top score", rows.length ? fmtS(rows[0].score) : "-"), statBox("Average", avg === null ? "-" : fmtS(avg)), statBox("Your rank", mine >= 0 ? ord(mine + 1) : "-"));
  const t = $("rk-table");
  t.textContent = "";
  const head = el("div", "tr head");
  head.append(el("span", "", "#"), el("span", "", "Player"), el("span", "wide", "Pieces"), el("span", "dim", "Score"), el("span", "dim", "Clock"));
  t.append(head);
  rows.slice(0, 100).forEach((e, i) => {
    const r = el("div", "tr" + (e.id === uid ? " me" : ""));
    r.append(el("span", "", i + 1), el("span", "", nameOf(e.id) + (e.id === uid ? " (you)" : "")), el("span", "wide", e.n), el("span", "sc", fmtS(e.score)), el("span", "dim", e.d ? clock(e.d) : "-"));
    t.append(r);
  });
  const note = $("rk-note");
  if (!db) note.textContent = "Leaderboards need the game server.";
  else if (dbState === "loading") note.textContent = "Loading scores.";
  else if (dbState === "slow" || dbState === "error") note.textContent = "Scores can't be reached right now.";
  else if (!rows.length) note.textContent = daily && rkDay === 0 ? "Nobody has played today's board yet. Take first place." : `No scores on ${rkCode} yet.`;
  else note.textContent = "Every score is recalculated from the route that earned it.";
  $("rk-play").hidden = daily && rkDay !== 0;
}
function renderShared() {
  if (screen === "home") renderHome();
  if (screen === "ranks") renderRanks();
  if (screen === "game") { renderPlayers(); renderVerdict(); }
}

