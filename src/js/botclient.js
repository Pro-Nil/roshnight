/* ---------- Bot ---------- */
// The daily board's bot comes from the server when the attempt ends. Other boards search on this device.
function runBot() {
  if (worker) worker.terminate();
  worker = null; botP = null; botScore = null; botDone = false;
  botLater = dailyRun && !!(window.roshnightDaily && window.roshnightDaily.bot);
  rankUI();
  if (!botLater) searchBot();
}
async function dailyBot() {
  const myCode = code, got = await window.roshnightDaily.bot(myCode).catch(() => null);
  if (code !== myCode) return;
  botLater = false;
  if (!got) { searchBot(); return; }
  botP = new Int8Array(N * N);
  for (const v of got.r) botP[v >> 3] = v & 7;
  botScore = trace(botP); botDone = true;
  trace(P, segs);
  rankUI(); renderPlayers(); renderVerdict();
}
function searchBot() {
  const myCode = code;
  try { worker = new Worker(URL.createObjectURL(new Blob([`(${WORKER})((${CORE})())`], { type: "text/javascript" }))); }
  catch (e) { worker = null; $("par").textContent = "Bot unavailable"; return; }
  worker.onerror = () => { worker = null; if (botScore === null) $("par").textContent = "Bot unavailable"; };
  worker.onmessage = e => {
    if (code !== myCode) return;
    botP = Int8Array.from(e.data.pieces); botScore = trace(botP); botDone = e.data.done;
    trace(P, segs);
    rankUI(); renderPlayers(); renderVerdict();
  };
  worker.postMessage({ wall: B.wall, val: B.val, src: B.src, dir: B.dir, work: B.work, seed: hashCode("bot:" + code) });
}

