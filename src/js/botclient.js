/* ---------- Bot ---------- */
function runBot() {
  if (worker) worker.terminate();
  botP = null; botScore = null; botDone = false; rankUI();
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

