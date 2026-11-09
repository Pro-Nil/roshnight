/* ---------- Screens ---------- */
const SCREENS = ["home", "lobby", "solo", "ranks", "game"];
let screen = "home";
function show(s) {
  screen = s;
  for (const k of SCREENS) $(k).hidden = k !== s;
  $("bg").hidden = s === "game";
  if (s === "game") resize();
  if (s === "home") renderHome();
  if (s === "lobby") renderLobby();
  if (s === "solo") renderSolo();
  window.scrollTo(0, 0);
}

function renderHome() {
  const c = dailyCode(), top = entries(c), mine = uid ? top.findIndex(e => e.id === uid) : -1;
  $("m-daily-s").textContent = `${c}, ${clock(DAILY_DUR)}${mine >= 0 ? `. You are ${ord(mine + 1)}` : ""}`;
  $("daycode").textContent = c;
  const day = $("dayboard"); day.textContent = "";
  if (!top.length) day.append(el("p", "empty", db ? (dbState === "slow" ? "Scores can't be reached yet." : "Nobody has played today's board yet.") : "Shared scores need the game server."));
  top.slice(0, 5).forEach((e, i) => {
    const b = el("button", "li");
    b.append(el("span", "", `${i + 1}. ${nameOf(e.id)}`), el("span", "", fmtS(e.score)));
    b.onclick = () => openRanks(c);
    day.append(b);
  });
  const list = $("hot"); list.textContent = "";
  const boards = new Map();
  for (const [, d] of docs) if (d && d.boards) for (const c2 of Object.keys(d.boards)) if (cleanCode(c2)) boards.set(c2, (boards.get(c2) || 0) + 1);
  const rows = [...boards.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  if (!rows.length) { list.append(el("p", "empty", db ? "No scores yet. Play a board to start the table." : "Shared scores need the game server.")); return; }
  for (const [c2, n] of rows) {
    const b = el("button", "li"), tops = entries(c2);
    b.append(el("span", "", c2), el("span", "", `${n} player${n === 1 ? "" : "s"}${tops[0] ? ", top " + fmtS(tops[0].score) : ""}`));
    b.onclick = () => openRanks(c2);
    list.append(b);
  }
}

