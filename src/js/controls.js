/* ---------- Home and controls ---------- */
const tagInput = $("tag"); tagInput.value = myTag;
tagInput.addEventListener("change", () => {
  myTag = tagInput.value.trim().slice(0, 16); LS.set("roshnight-tag", myTag);
  if (room) room.presence({ tag: displayTag() }).catch(() => {});
  if (db && uid && !readOnly) writeMine({ tag: myTag });
});
$("m-daily").onclick = () => startGame(dailyCode(), { mode: "free" });
$("m-free").onclick = () => startGame(randomCode(), { mode: "free" });
$("m-trial").onclick = () => startTrial(randomCode());
$("m-live").onclick = () => show("lobby");
$("m-ranks").onclick = () => openRanks(dailyCode());
$("m-how").onclick = () => { $("how").hidden = false; $("how-close").focus(); };
$("how-close").onclick = () => { $("how").hidden = true; };
$("g-menu").onclick = exitGame;
$("chip").onclick = () => copy(code, "Board code copied.");
function paintMute() { $("mute").textContent = muted ? "Sound off" : "Sound on"; $("mute").setAttribute("aria-pressed", String(muted)); }
$("mute").onclick = () => { muted = !muted; LS.set("roshnight-mute", muted ? "1" : "0"); paintMute(); };
$("t-m").onclick = () => setTool("m");
$("t-s").onclick = () => setTool("s");
$("t-e").onclick = () => setTool("e");
$("flip").onclick = () => { if (!locked) flipOrient(); };
$("undo").onclick = undo;
$("clear").onclick = () => { if (!locked && P.some(Boolean)) { push(); P.fill(0); sfx.remove(); refresh(true); } };
$("keep").onclick = () => saveLayout(false);
$("keepnew").onclick = () => saveLayout(true);
$("fresh").onclick = () => startGame(randomCode(), { mode: "free" });
$("lockin").onclick = () => { if (!locked) finish(); };
$("bot").onclick = () => { if (botP) setOverlay("bot", botP); };
function goRanks() { const c = readCode($("rk-code").value); if (!c) { toast("Board codes use letters and numbers only."); return; } rkCode = c; $("rk-code").value = c; renderRanks(); }
$("rk-go").onclick = goRanks;
$("rk-code").addEventListener("keydown", e => { if (e.key === "Enter") goRanks(); });
$("rk-today").onclick = () => { rkCode = dailyCode(); $("rk-code").value = rkCode; renderRanks(); };
$("rk-all").onclick = () => { rkTimed = false; renderRanks(); };
$("rk-timed").onclick = () => { rkTimed = true; renderRanks(); };
$("rk-play").onclick = () => { const c = readCode($("rk-code").value) || rkCode; if (c) startGame(c, { mode: "free" }); };
$("rk-back").onclick = () => show("home");

