/* ---------- Modes ---------- */
const PRESETS = [120000, 180000, 300000, 600000];
let soloRandom = true, soloDur = 180000;
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
  const s = Date.now() + 3600, d = c === dailyCode() ? DAILY_DUR : dur;
  startGame(c, { mode: "solo", startAt: s, endAt: s + d });
}
function openSolo(c) { if (c) { soloRandom = false; $("so-code").value = c; } show("solo"); }
function renderSolo() {
  $("so-random").setAttribute("aria-pressed", String(soloRandom)); $("so-pick").setAttribute("aria-pressed", String(!soloRandom));
  $("so-code").hidden = soloRandom;
  const daily = !soloRandom && readCode($("so-code").value) === dailyCode();
  renderTime("so-dur", "so-mins", daily ? DAILY_DUR : soloDur, !daily, d => { soloDur = d; renderSolo(); });
  $("so-note").textContent = daily ? "That is today's board, so the clock is fixed for a fair leaderboard." : "Your best layout counts when the clock runs out.";
}
function beginSolo() {
  if (soloRandom) { startSolo(randomCode(), soloDur); return; }
  const c = readCode($("so-code").value);
  if (!c) { toast("Enter a board code using letters and numbers."); return; }
  startSolo(c, soloDur);
}

