/* ---------- Modes ---------- */
function startTrial(c) { const s = Date.now() + 3600; startGame(c, { mode: "trial", startAt: s, endAt: s + 180000 }); }

