/* ---------- Live match ---------- */
let M = null;
const DURS = [120000, 180000, 300000, 600000];
function randomRoom() { const a = "abcdefghjkmnpqrstuvwxyz23456789"; let s = ""; for (let i = 0; i < 5; i++) s += a[Math.floor(Math.random() * a.length)]; return s; }
async function enterRoom(name) {
  if (!room) return;
  if (M) leaveRoom();
  let r;
  try { r = await room.join("m-" + name); } catch (e) { toast("That match can't be opened right now. Try again."); return; }
  const j = Date.now(), cfg = { code: randomCode(), dur: 180000 };
  M = { name, room: r, j, cfg, rid: null, off: Infinity, isHost: false, host: null, lastOpen: "" };
  r.presence({ tag: displayTag(), j, cl: j, st: "lobby", sc: 0, n: 0, r: null, rid: null, h: null, cfg }).catch(() => {});
  M.un = r.onPeers(onMatchPeers, () => { toast("The connection to this match was lost."); leaveRoom(); show("home"); });
  show("lobby");
}
function roster() { return M ? M.room.peers().filter(p => p.kind === "viewer" && p.presence && Number.isFinite(p.presence.j)).sort((a, b) => a.presence.j - b.presence.j || (a.peer < b.peer ? -1 : 1)) : []; }
function cleanH(h) { if (!h || typeof h.rid !== "string" || h.rid.length > 12) return null; const c = cleanCode(h.code); if (!c || !Number.isFinite(h.start)) return null; const dur = +h.dur; if (!(dur >= 30000 && dur <= 900000)) return null; return { rid: h.rid, code: c, dur, start: h.start }; }
function onMatchPeers() {
  if (!M) return;
  const ro = roster(); M.host = ro[0] || null; M.isHost = !!(ro[0] && ro[0].sameTab);
  const hp = M.host && M.host.presence, h = hp && cleanH(hp.h);
  if (h) {
    const off = M.host.sameTab ? 0 : M.host.updatedAt - (+hp.cl || 0);
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
  publishOpen(ro);
  if (screen === "lobby") renderLobby();
  if (screen === "game") { renderPlayers(); renderVerdict(); }
}
setInterval(() => { if (M && M.isHost && M.rid && mode === "live" && Date.now() < endAt) M.room.presence({ cl: Date.now() }).catch(() => {}); }, 4000);
function roundActive() { return M && M.rid && screen === "game" && mode === "live" && !finished; }
function publishOpen(ro) {
  if (!room || !M) return;
  const o = M.isHost && !roundActive() && screen === "lobby" ? { room: M.name, n: ro.length, dur: M.cfg.dur, tag: displayTag() } : null, js = JSON.stringify(o);
  if (js !== M.lastOpen) { M.lastOpen = js; room.presence({ open: o }).catch(() => {}); }
}
function hostCfg() { const c = M.host && M.host.presence && M.host.presence.cfg; if (M.isHost || !c) return M.cfg; return { code: cleanCode(c.code) || "?", dur: DURS.includes(+c.dur) ? +c.dur : 180000 }; }
function renderLobby() {
  const inRoom = !!M;
  $("lb-out").hidden = inRoom; $("lb-in").hidden = !inRoom;
  $("lb-off").hidden = !!room;
  if (!inRoom) return;
  $("lb-room").textContent = M.name.toUpperCase();
  const ro = roster(), cfg = hostCfg(), list = $("roster");
  list.textContent = "";
  $("lb-n").textContent = String(ro.length);
  ro.forEach((p, i) => {
    const q = p.presence, r = el("div", "li");
    r.append(el("span", "", (typeof q.tag === "string" && q.tag ? q.tag.slice(0, 16) : "Player") + (p.sameTab ? " (you)" : "")), el("span", "", i === 0 ? "Host" : q.st === "play" ? "Playing" : "Ready"));
    list.append(r);
  });
  const durBox = $("lb-dur"); durBox.textContent = "";
  for (const d of DURS) {
    const b = el("button", "", clock(d)); b.setAttribute("aria-pressed", String(d === cfg.dur)); b.disabled = !M.isHost;
    b.onclick = () => { M.cfg = Object.assign({}, M.cfg, { dur: d }); pushCfg(); };
    durBox.append(b);
  }
  const bi = $("lb-board");
  if (document.activeElement !== bi) bi.value = cfg.code;
  bi.disabled = !M.isHost; $("lb-shuffle").disabled = !M.isHost; $("lb-today").disabled = !M.isHost;
  $("lb-start").hidden = !M.isHost;
  $("lb-wait").textContent = M.isHost ? (ro.length < 2 ? "You can start alone, or share the code and wait for others." : "Everyone starts on the same board at the same moment. Each player's best layout counts.") : "Waiting for the host to start.";
}
function pushCfg() { M.room.presence({ cfg: M.cfg }).catch(() => {}); renderLobby(); publishOpen(roster()); }
function backToLobby() {
  if (!M) { show("home"); return; }
  if (M.isHost) { M.cfg = Object.assign({}, M.cfg, { code: randomCode() }); M.room.presence({ h: null, cfg: M.cfg }).catch(() => {}); }
  show("lobby");
  publishOpen(roster());
}
function leaveRoom() {
  if (!M) return;
  const m = M; M = null;
  try { m.un && m.un(); } catch (e) {}
  m.room.leave().catch(() => {});
  if (room) room.presence({ open: null }).catch(() => {});
}
$("lb-create").onclick = () => enterRoom(randomRoom());
function joinTyped() { const v = $("lb-code").value.trim().toLowerCase(); if (!/^[a-z0-9]{5}$/.test(v)) { toast("Match codes have 5 letters or numbers."); return; } enterRoom(v); }
$("lb-join").onclick = joinTyped;
$("lb-code").addEventListener("keydown", e => { if (e.key === "Enter") joinTyped(); });
$("lb-copy").onclick = () => copy(M.name.toUpperCase(), "Match code copied.");
$("lb-shuffle").onclick = () => { M.cfg = Object.assign({}, M.cfg, { code: randomCode() }); pushCfg(); };
$("lb-today").onclick = () => { M.cfg = Object.assign({}, M.cfg, { code: dailyCode() }); pushCfg(); };
$("lb-board").addEventListener("change", e => { const c = readCode(e.target.value); if (!c) { toast("Board codes use letters and numbers only."); renderLobby(); return; } M.cfg = Object.assign({}, M.cfg, { code: c }); pushCfg(); });
$("lb-start").onclick = () => {
  if (!M || !M.isHost) return;
  const now = Date.now(), h = { rid: Math.random().toString(36).slice(2, 10), code: M.cfg.code, dur: M.cfg.dur, start: now + 4500 };
  M.room.presence({ h, cl: now }).catch(() => {});
};
$("lb-leave").onclick = () => { leaveRoom(); renderLobby(); };
$("lb-back").onclick = () => { leaveRoom(); show("home"); };

