/* ---------- Screens ---------- */
const SCREENS = ["home", "lobby", "ranks", "game"];
let screen = "home";
function show(s) {
  screen = s;
  for (const k of SCREENS) $(k).hidden = k !== s;
  $("bg").hidden = s === "game";
  if (s === "game") resize();
  if (s === "home" || s === "lobby") renderOpen();
  if (s === "home") renderHome();
  if (s === "lobby") renderLobby();
  window.scrollTo(0, 0);
}

function renderHome() {
  const c = dailyCode(), top = entries(c, false), mine = uid && top.findIndex(e => e.id === uid);
  $("m-daily-s").textContent = top.length ? (mine >= 0 ? `You are ${ord(mine + 1)} of ${top.length}` : `Top score ${fmtS(top[0].score)}`) : "New every day";
  const list = $("hot"); list.textContent = "";
  const boards = new Map();
  for (const [, d] of docs) if (d && d.boards) for (const c2 of Object.keys(d.boards)) if (cleanCode(c2)) boards.set(c2, (boards.get(c2) || 0) + 1);
  const rows = [...boards.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  if (!rows.length) { list.append(el("p", "empty", db ? (dbState === "slow" ? "Scores can't be reached yet." : "No scores yet. Play a board to start the table.") : "Shared scores appear for people with access to this page.")); return; }
  for (const [c2, n] of rows) {
    const b = el("button", "li"), tops = entries(c2, false);
    b.append(el("span", "", c2), el("span", "", `${n} player${n === 1 ? "" : "s"}${tops[0] ? ", top " + fmtS(tops[0].score) : ""}`));
    b.onclick = () => openRanks(c2);
    list.append(b);
  }
}
function openMatches() {
  if (!room) return [];
  const seen = new Set(), out = [];
  for (const p of room.peers()) {
    const o = p.presence && p.presence.open;
    if (!o || typeof o.room !== "string" || !/^[a-z0-9]{5}$/.test(o.room) || seen.has(o.room)) continue;
    seen.add(o.room);
    out.push({ room: o.room, n: Math.max(1, Math.min(64, o.n | 0)), dur: Math.max(30000, Math.min(900000, +o.dur || 180000)), tag: typeof o.tag === "string" ? o.tag.slice(0, 16) : "Player" });
  }
  return out;
}
function renderOpen() {
  const peers = room ? room.peers().filter(p => p.kind === "viewer") : [];
  $("online").textContent = room ? `${peers.length} online` : "";
  $("m-live").disabled = false;
  const ms = openMatches();
  for (const id of ["openlist", "openlist2"]) {
    const l = $(id); l.textContent = "";
    if (!ms.length) { l.append(el("p", "empty", room ? "Nobody is waiting right now. Create a match and share its code." : "Live matches work for people who have edit access to this page.")); continue; }
    for (const m of ms) {
      const b = el("button", "li");
      b.append(el("span", "", `${m.tag}'s match`), el("span", "", `${m.n} waiting, ${clock(m.dur)}`));
      b.onclick = () => enterRoom(m.room);
      l.append(b);
    }
  }
  $("lb-off").hidden = !!room;
  $("lb-create").disabled = !room; $("lb-join").disabled = !room;
}

