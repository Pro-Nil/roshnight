/* ---------- Home and controls ---------- */
const tagInput = $("tag"); tagInput.value = myTag;
tagInput.addEventListener("change", async () => {
  const typed = tagInput.value.trim().slice(0, 16);
  if (!typed) { tagInput.value = myTag; return; }
  if (window.roshnightName) {
    if (typed === myTag) { tagInput.value = typed; return; }
    let free;
    try { free = await window.roshnightName.claim(typed); }
    catch (e) { tagInput.value = myTag; toast("Your name couldn't be saved. Try again."); return; }
    if (!free) { tagInput.value = myTag; toast(`${typed} is taken. Try another name.`); return; }
    setMyTag(typed); tagInput.value = typed;
    return;
  }
  myTag = typed; LS.set("roshnight-tag", myTag);
  if (M) M.room.presence({ tag: displayTag() }).catch(() => {});
  if (db && uid && !readOnly) writeMine({ tag: myTag });
});
$("m-daily").onclick = () => startSolo(dailyCode(), DAILY_DUR);
$("m-multi").onclick = () => show("lobby");
$("m-solo").onclick = () => openSolo();
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
$("redo").onclick = redo;
$("clear").onclick = () => { if (!locked && P.some(Boolean)) { push(); P.fill(0); sfx.remove(); refresh(true); } };
$("keep").onclick = () => saveLayout(false);
$("keepnew").onclick = () => saveLayout(true);
$("lockin").onclick = () => { if (!locked) finish(); };
function goRanks() { const c = readCode($("rk-code").value); if (!c) { toast("Board codes use letters and numbers only."); return; } setRanks(c); renderRanks(); }
$("rk-go").onclick = goRanks;
$("rk-code").addEventListener("keydown", e => { if (e.key === "Enter") goRanks(); });
$("rk-today").onclick = () => { setRanks(dailyCode()); renderRanks(); };
$("rk-prev").onclick = () => { setRanks(dailyCode(rkDay + 1)); renderRanks(); };
$("rk-next").onclick = () => { setRanks(dailyCode(rkDay - 1)); renderRanks(); };
$("rk-play").onclick = () => { if (rkDay === 0) startSolo(rkCode, DAILY_DUR); else openSolo(rkCode); };
$("rk-back").onclick = () => show("home");
$("so-back").onclick = () => show("home");
$("so-random").onclick = () => { soloRandom = true; renderSolo(); };
$("so-pick").onclick = () => { soloRandom = false; renderSolo(); $("so-code").focus(); };
$("so-code").addEventListener("input", renderSolo);
$("so-start").onclick = beginSolo;

