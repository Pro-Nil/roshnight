/* ---------- Modes ---------- */
const PRESETS = [120000, 180000, 300000, 600000];
let soloRandom = true, soloDur = 180000, soloLevel = LEVELS[LS.get("roshnight-level")] ? LS.get("roshnight-level") : "N";
function renderTime(boxId, minsId, cur, enabled, set) {
  const box = $(boxId); box.textContent = "";
  for (const d of PRESETS) {
    const b = el("button", "", clock(d)); b.setAttribute("aria-pressed", String(d === cur)); b.disabled = !enabled;
    b.onclick = () => set(d);
    box.append(b);
  }
  const m = $(minsId);
  if (document.activeElement !== m) m.value = Math.round(cur / 6000) / 10;
  m.disabled = !enabled;
  m.onchange = () => set(Math.max(1, Math.min(60, Math.round(+m.value) || 3)) * 60000);
}
function startSolo(c, dur) {
  if (c === dailyCode()) { startDaily(); return; }
  const s = Date.now() + 3600;
  startGame(c, { mode: "solo", startAt: s, endAt: s + dur });
}
let dailyBusy = false;
async function startDaily() {
  if (dailyBusy) return;
  dailyBusy = true;
  const c = dailyCode(), doneKey = "roshnight-daily-" + c;
  try {
    let run = null;
    try { run = window.roshnightDaily ? await window.roshnightDaily.start(c) : null; }
    catch (e) { toast("Today's board can't be opened right now. Try again."); return; }
    if (!run) run = LS.get(doneKey) ? { status: "done" } : { status: "go", toStart: 3600, left: 3600 + DAILY_DUR };
    if (run.status === "done") { toast("You've played today's board. A new one arrives at midnight India time."); openRanks(c); return; }
    let pieces = null;
    if (run.status === "resume") { try { pieces = JSON.parse(LS.get("roshnight-daily-layout-" + c)); } catch (e) {} }
    const now = Date.now();
    startGame(c, { mode: "solo", startAt: now + run.toStart, endAt: now + run.left, daily: true, pieces: Array.isArray(pieces) && pieces.length === N * N ? pieces : null });
  } finally { dailyBusy = false; }
}
function finishDaily() {
  LS.set("roshnight-daily-" + code, "done");
  if (window.roshnightDaily) { const f = window.roshnightDaily.finish(code); if (botLater) f.then(() => dailyBot()); }
}
function openSolo(c) { if (c) { soloRandom = false; $("so-code").value = c; } show("solo"); }
function renderSolo() {
  $("so-random").setAttribute("aria-pressed", String(soloRandom)); $("so-pick").setAttribute("aria-pressed", String(!soloRandom));
  $("so-code").hidden = soloRandom;
  $("so-levelbox").hidden = !soloRandom;
  const levels = $("so-level"); levels.textContent = "";
  for (const k of Object.keys(LEVELS)) {
    const b = el("button", "", LEVELS[k].name); b.setAttribute("aria-pressed", String(k === soloLevel));
    b.onclick = () => { soloLevel = k; LS.set("roshnight-level", k); renderSolo(); };
    levels.append(b);
  }
  const daily = !soloRandom && readCode($("so-code").value) === dailyCode();
  renderTime("so-dur", "so-mins", daily ? DAILY_DUR : soloDur, !daily, d => { soloDur = d; renderSolo(); });
  const typed = soloRandom ? null : readCode($("so-code").value), lead = soloRandom ? LEVELS[soloLevel].note + " " : typed && levelOf(typed) !== "N" ? `That code is ${LEVELS[levelOf(typed)].name === "Easy" || LEVELS[levelOf(typed)].name === "Expert" ? "an" : "a"} ${LEVELS[levelOf(typed)].name} board. ` : "";
  $("so-note").textContent = daily ? "That is today's board. You get one attempt on a fixed clock." : lead + "Your best layout counts when the clock runs out.";
}
function beginSolo() {
  if (soloRandom) { startSolo(randomCode(soloLevel), soloDur); return; }
  const c = readCode($("so-code").value);
  if (!c) { toast("Enter a board code using letters and numbers."); return; }
  startSolo(c, soloDur);
}

