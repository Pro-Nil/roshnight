/* ---------- Shared services ---------- */
let db = null, user = null, room = null, uid = null, readOnly = false, myName = "";
const docs = new Map(), names = new Map();
let dbState = "none", myTag = LS.get("roshnight-tag") || LS.get("lamplighter-tag") || "";
const displayTag = () => (myTag || myName || "Player").slice(0, 16);

async function initNet() {
  if (!window.claude || !window.claude.use) return;
  const [u, d, r] = await Promise.all([claude.use("user"), claude.use("db"), claude.use("room")]);
  user = u; db = d; room = r;
  if (user) { uid = await user.id(); const me = await user.me(); myName = me.name || ""; if (!$("tag").value && myName) $("tag").placeholder = myName; }
  if (db) {
    dbState = "loading";
    const guard = setTimeout(() => { if (dbState === "loading") { dbState = "slow"; renderShared(); } }, 10000);
    db.collection("scores").limit(1000).onSnapshot(snap => {
      if (!snap.metadata.fromCache) { dbState = "ready"; clearTimeout(guard); }
      else if (dbState !== "ready") dbState = "cached";
      docs.clear();
      for (const x of snap.docs) docs.set(x.id, x.data());
      resolveNames(); renderShared();
    }, () => { clearTimeout(guard); dbState = "error"; renderShared(); });
  }
  if (room) {
    room.onPeers(() => renderOpen(), () => { room = null; renderOpen(); renderLobby(); });
    room.presence({ tag: displayTag() }).catch(() => {});
  }
  renderOpen(); renderLobby(); renderShared();
}
function resolveNames() {
  if (!user) return;
  const ids = [...docs.keys()]; if (!ids.length) return;
  user.profiles(ids).then(ps => { let ch = false; for (const id of ids) { const n = (ps[id] && ps[id].name) || ""; if (names.get(id) !== n) { names.set(id, n); ch = true; } } if (ch) renderShared(); });
}
const nameOf = id => { const d = docs.get(id), t = d && typeof d.tag === "string" ? d.tag.slice(0, 16) : ""; return t || names.get(id) || "Player"; };

function entries(c, timedOnly) {
  const out = [];
  for (const [id, d] of docs) {
    const b = d && d.boards && d.boards[c]; if (!b) continue;
    let best = null;
    for (const kind of timedOnly ? ["t"] : ["t", "f"]) {
      const e = b[kind]; if (!e) continue;
      const v = verify(c, e.r); if (!v) continue;
      if (!best || v.score > best.score || (v.score === best.score && v.n < best.n)) best = { id, score: v.score, n: v.n, Q: v.Q, at: +e.at || 0, timed: kind === "t" };
    }
    if (best) out.push(best);
  }
  return out.sort((a, b) => b.score - a.score || a.n - b.n || a.at - b.at);
}
function bestOf(c, kind) { const d = uid && docs.get(uid), e = d && d.boards && d.boards[c] && d.boards[c][kind]; return e ? verify(c, e.r) : null; }

let pending = null, saveT = 0, chain = Promise.resolve();
function offerScore(kind, now) {
  if (!db || !uid || readOnly || !bestRun || bestRun.score <= 0 || !bestRun.r.length) return;
  const r = bestRun.r, cur = bestOf(code, kind);
  if (cur && (bestRun.score < cur.score || (bestRun.score === cur.score && r.length >= cur.n))) return;
  pending = { code, kind, r, at: Date.now() };
  clearTimeout(saveT); saveT = setTimeout(flushScore, now ? 0 : 1400);
}
function flushScore() {
  const p = pending; if (!p) return; pending = null;
  writeMine({ boards: { [p.code]: { [p.kind]: { r: p.r, at: p.at } } } });
}
function writeMine(patch) {
  chain = chain.then(async () => {
    const ref = db.doc("scores/" + uid);
    try { await ref.update(patch); }
    catch (e) {
      try { await ref.set(Object.assign({ tag: myTag.slice(0, 16), boards: {} }, patch)); }
      catch (x) { if (!readOnly) { readOnly = true; toast("Your scores can't be saved here. You need edit access to this page."); renderShared(); } }
    }
  });
}

