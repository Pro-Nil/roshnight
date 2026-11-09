/* ---------- Input ---------- */
function push() { hist.push(P.slice()); if (hist.length > 200) hist.shift(); }
function setTool(t) { if (t !== "e" && tool === t) { flipOrient(); return; } tool = t; for (const k of ["m", "s", "e"]) $("t-" + k).setAttribute("aria-pressed", String(k === t)); makeGhost(); }
function flipOrient() { orient = orient === 1 ? 2 : 1; refresh(false); }
function act(i) {
  if (i < 0 || locked) return;
  if (tool === "e") { if (P[i]) { push(); P[i] = 0; sfx.remove(); refresh(true); } return; }
  if (!free(i)) { makeGhost(); return; }
  const { m, s } = count();
  if (P[i]) {
    const cur = P[i], same = (cur > 2) === (tool === "s");
    if (same) { push(); P[i] = cur & 1 ? cur + 1 : cur - 1; sfx.place(); refresh(true); return; }
    if (tool === "m" ? m >= CM : s >= CS) { $("read").textContent = `No ${tool === "m" ? "mirrors" : "splitters"} left to swap in.`; return; }
    push(); P[i] = cur <= 2 ? cur + 2 : cur - 2; sfx.place(); refresh(true); return;
  }
  if (tool === "m" ? m >= CM : s >= CS) { makeGhost(); return; }
  push(); P[i] = (tool === "s" ? 3 : 1) + orient - 1; sfx.place(); refresh(true);
}
function renderChips() {
  const box = $("chips"); box.textContent = "";
  if (bestRun && bestRun.r.length) { const b = el("button", "b", `Best ${fmtS(bestRun.score)}`); b.title = "Load your best layout"; b.onclick = () => loadLayout(bestRun.P); box.append(b); }
  saved.forEach((l, i) => { const b = el("button", "", `${i + 1}: ${fmtS(l.score)}`); b.title = `Load saved layout ${i + 1}, ${l.n} pieces`; b.onclick = () => loadLayout(l.P); box.append(b); });
}
function loadLayout(Q) { if (locked) return; push(); P = Q.slice(); sfx.place(); refresh(true); }
function saveLayout(restart) {
  if (locked) return;
  const { m, s } = count();
  if (!m && !s) { toast("Place a piece first."); return; }
  const key = P.join();
  let at = saved.findIndex(l => l.key === key);
  if (at < 0) { saved.push({ key, P: P.slice(), score, n: m + s }); at = saved.length - 1; }
  if (restart) { push(); P.fill(0); sfx.remove(); refresh(true); toast(`Layout ${at + 1} saved. The board is clear.`); }
  else { sfx.place(); renderChips(); toast(`Layout ${at + 1} saved.`); }
}
function removeAt(i) { if (!locked && i >= 0 && P[i]) { push(); P[i] = 0; sfx.remove(); refresh(true); } }
function undo() { if (hist.length && !locked) { P = hist.pop(); sfx.remove(); refresh(true); } }
function cellAt(e) { const b = cv.getBoundingClientRect(), c = Math.floor((e.clientX - b.left - ox) / cs), r = Math.floor((e.clientY - b.top - oy) / cs); return r < 0 || r >= N || c < 0 || c >= N ? -1 : r * N + c; }
cv.addEventListener("contextmenu", e => e.preventDefault());
cv.addEventListener("pointerdown", e => {
  if (locked) return;
  const i = cellAt(e); hover = i;
  if (e.button === 2) { removeAt(i); return; }
  try { cv.setPointerCapture(e.pointerId); } catch (x) {}
  pressed = true; moved = false; touching = e.pointerType !== "mouse";
  dragFrom = i >= 0 && P[i] && tool !== "e" ? i : -1;
  makeGhost();
});
cv.addEventListener("pointermove", e => { const i = cellAt(e); if (i === hover) return; hover = i; if (pressed && dragFrom >= 0 && i !== dragFrom) moved = true; makeGhost(); });
cv.addEventListener("pointerup", e => {
  if (e.button === 2 || !pressed) return;
  pressed = false; const wasTouch = touching; touching = false;
  const i = cellAt(e);
  if (dragFrom >= 0 && moved) { if (!locked && i >= 0 && free(i) && !P[i]) { push(); P[i] = P[dragFrom]; P[dragFrom] = 0; sfx.place(); dragFrom = -1; moved = false; refresh(true); } else { dragFrom = -1; moved = false; refresh(false); } }
  else { dragFrom = -1; act(i); }
  if (wasTouch) { hover = -1; ghost = null; }
});
cv.addEventListener("pointercancel", () => { pressed = false; touching = false; dragFrom = -1; moved = false; makeGhost(); });
cv.addEventListener("pointerleave", () => { if (!pressed) { hover = -1; makeGhost(); } });
document.addEventListener("keydown", e => {
  if (e.key === "Escape") { $("how").hidden = true; return; }
  if (e.target.tagName === "INPUT" || screen !== "game") return;
  const k = e.key.toLowerCase();
  if ((e.ctrlKey || e.metaKey) && k === "z") { e.preventDefault(); undo(); return; }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (k === "m" || k === "1") setTool("m");
  else if (k === "s" || k === "2") setTool("s");
  else if (k === "e" || k === "3") setTool("e");
  else if (k === "r" && !locked) flipOrient();
  else if (k === "z") undo();
  else if (k === "n") saveLayout(true);
  else if (document.activeElement === cv && k.startsWith("arrow")) {
    e.preventDefault(); if (hover < 0) hover = B.src;
    let [r, c] = rc(hover);
    if (k === "arrowup") r = Math.max(0, r - 1); if (k === "arrowdown") r = Math.min(N - 1, r + 1);
    if (k === "arrowleft") c = Math.max(0, c - 1); if (k === "arrowright") c = Math.min(N - 1, c + 1);
    hover = r * N + c; makeGhost();
  } else if (document.activeElement === cv && (k === "enter" || k === " ")) { e.preventDefault(); act(hover); }
  else if (document.activeElement === cv && (k === "delete" || k === "backspace")) { e.preventDefault(); removeAt(hover); }
});

