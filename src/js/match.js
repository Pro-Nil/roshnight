/* ---------- Multiplayer rooms ---------- */
let M = null, entering = false;
const pause = ms => new Promise(r => setTimeout(r, ms));
const ROOM_RE = /^[a-z0-9]{3,10}$/;
function randomRoom() { const a = "abcdefghjkmnpqrstuvwxyz23456789"; let s = ""; for (let i = 0; i < 6; i++) s += a[Math.floor(Math.random() * a.length)]; return s; }
let roomError = "";
function setBusy(on, create) {
  entering = on;
  for (const id of ["lb-create", "lb-join"]) $(id).disabled = on || !room;
  $("lb-create").textContent = on && create ? "Creating room" : "Create room";
  $("lb-join").textContent = on && !create ? "Looking for room" : "Join room";
}
async function enterRoom(name, create) {
  if (!room || entering) return;
  roomError = "";
  setBusy(true, create);
  try {
    if (M) leaveRoom();
    let r;
    try { r = await room.join("m-" + name, { create }); }
    catch (e) {
      if (e && e.code === "not_found") { toast(`No room found with code ${name.toUpperCase()}. Check it with your friend.`); return; }
      if (e && e.code === "already_in_room") { roomError = "You're already in this room in another tab."; return; }
      if (e && e.code === "room_full") { roomError = "That room is full."; return; }
      if (e && e.code === "rate_limited") { roomError = "Too many attempts. Wait a minute and try again."; return; }
      roomError = e && e.code === "not_permitted" ? "This account isn't allowed to use rooms on this page." : `The room couldn't be opened${e && e.code ? ` (${e.code})` : ""}. Try again.`;
      return;
    }
    const j = Date.now(), m = { name, room: r, j, cfg: { dur: 180000 }, rid: null, off: Infinity, isHost: false, host: null };
    M = m;
    m.un = r.onPeers(onMatchPeers, e => { toast(e && e.code === "already_in_room" ? "This room is now open in another tab." : "The connection to this room was lost."); leaveRoom(); show("home"); });
    const hasOwner = () => r.peers().some(p => p.presence && p.presence.own === true);
    if (!create) {
      for (const t0 = Date.now(); Date.now() - t0 < 3000 && !hasOwner();) await pause(150);
      if (M !== m) return;
      if (!hasOwner()) { leaveRoom(); toast(`No room found with code ${name.toUpperCase()}. Check it with your friend.`); return; }
    }
    r.presence({ tag: displayTag(), j, cl: j, st: "lobby", sc: 0, n: 0, r: null, rid: null, h: null, own: create ? true : null, cfg: m.cfg }).catch(() => {});
    show("lobby");
  } finally {
    setBusy(false);
    if (screen === "lobby") renderLobby();
  }
}
function roster() {
  if (!M) return [];
  const rank = p => (p.presence.own === true ? 0 : 1);
  return M.room.peers().filter(p => p.kind === "viewer" && p.presence && Number.isFinite(p.presence.j)).sort((a, b) => rank(a) - rank(b) || a.presence.j - b.presence.j || (a.peer < b.peer ? -1 : 1));
}
function cleanH(h) {
  if (!h || typeof h.rid !== "string" || h.rid.length > 12) return null;
  const c = cleanCode(h.code); if (!c || !Number.isFinite(h.start)) return null;
  const dur = +h.dur; if (!(dur >= 60000 && dur <= 3600000)) return null;
  return { rid: h.rid, code: c, dur, start: h.start };
}
function onMatchPeers() {
  if (!M) return;
  const ro = roster(); M.host = ro[0] || null; M.isHost = !!(ro[0] && ro[0].sameTab);
  const hp = M.host && M.host.presence, h = hp && cleanH(hp.h);
  if (h) {
    const off = M.room.serverNow ? Date.now() - M.room.serverNow() : (M.host.sameTab ? 0 : M.host.updatedAt - (+hp.cl || 0));
    if (h.rid !== M.rid) {
      const s = h.start + off;
      if (s + h.dur > Date.now() + 3000) {
        M.rid = h.rid; M.off = off; M.cheered = false;
        M.room.presence({ st: "play", sc: 0, n: 0, r: null, rid: h.rid }).catch(() => {});
        startGame(h.code, { mode: "live", startAt: s, endAt: s + h.dur });
      }
    } else if (off < M.off && mode === "live" && !finished) {
      startAt += off - M.off; endAt += off - M.off; M.off = off;
    }
  }
  if (screen === "lobby") renderLobby();
  if (screen === "game") { renderPlayers(); renderVerdict(); }
}
setInterval(() => { if (M && M.isHost && M.rid && mode === "live" && Date.now() < endAt) M.room.presence({ cl: Date.now() }).catch(() => {}); }, 4000);
function hostDur() { const c = M.host && M.host.presence && M.host.presence.cfg, d = c && +c.dur; return M.isHost || !(d >= 60000 && d <= 3600000) ? M.cfg.dur : d; }
function renderLobby() {
  const inRoom = !!M && !entering;
  $("lb-out").hidden = inRoom; $("lb-in").hidden = !inRoom;
  $("lb-off").hidden = !!room && !roomError;
  $("lb-off").textContent = roomError || "Multiplayer needs the game server. You can still play solo.";
  if (!entering) { $("lb-create").disabled = !room; $("lb-join").disabled = !room; }
  if (!inRoom) return;
  $("lb-room").textContent = M.name.toUpperCase();
  const ro = roster(), list = $("roster");
  list.textContent = "";
  $("lb-n").textContent = String(ro.length);
  ro.forEach((p, i) => {
    const q = p.presence, r = el("div", "li");
    r.append(el("span", "", (typeof q.tag === "string" && q.tag ? q.tag.slice(0, 16) : "Player") + (p.sameTab ? " (you)" : "")), el("span", "", i === 0 ? "Host" : q.st === "play" ? "Playing" : "Ready"));
    list.append(r);
  });
  renderTime("lb-dur", "lb-mins", hostDur(), M.isHost, d => { M.cfg = { dur: d }; M.room.presence({ cfg: M.cfg }).catch(() => {}); renderLobby(); });
  $("lb-start").hidden = !M.isHost;
  $("lb-wait").textContent = M.isHost ? (ro.length < 2 ? "Share the code with your friends. You can also start alone." : "When you start, everyone gets the same random board at the same moment.") : "Waiting for the host to start. The board stays hidden until then.";
}
function backToLobby() {
  if (!M) { show("home"); return; }
  if (M.isHost) M.room.presence({ h: null }).catch(() => {});
  show("lobby");
}
function leaveRoom() {
  if (!M) return;
  const m = M; M = null;
  try { m.un && m.un(); } catch (e) {}
  m.room.leave().catch(() => {});
}
function joinTyped() {
  const v = $("lb-code").value.trim().toLowerCase();
  if (!ROOM_RE.test(v)) { toast("Room codes use 3 to 10 letters or numbers."); return; }
  enterRoom(v, false);
}
$("lb-create").onclick = () => enterRoom(randomRoom(), true);
$("lb-join").onclick = joinTyped;
$("lb-code").addEventListener("keydown", e => { if (e.key === "Enter") joinTyped(); });
$("lb-copy").onclick = () => copy(M.name.toUpperCase(), "Room code copied.");
$("lb-start").onclick = () => {
  if (!M || !M.isHost) return;
  const now = Date.now();
  M.room.presence({ h: { rid: Math.random().toString(36).slice(2, 10), code: randomCode(), dur: M.cfg.dur, start: (M.room.serverNow ? M.room.serverNow() : now) + 4500 }, cl: now }).catch(() => {});
};
$("lb-leave").onclick = () => { leaveRoom(); renderLobby(); };
$("lb-back").onclick = () => { leaveRoom(); show("home"); };

