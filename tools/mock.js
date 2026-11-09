// Test double for the platform services: shared db in localStorage, rooms over BroadcastChannel.
(function () {
  const ch = new BroadcastChannel("mock"), peer = Math.random().toString(36).slice(2, 10);
  const uid = "u_" + (sessionStorage.mockid || (sessionStorage.mockid = peer));
  const read = () => JSON.parse(localStorage.mockdb || "{}");
  const write = o => { localStorage.mockdb = JSON.stringify(o); dbFire(); ch.postMessage({ t: "db" }); };
  const subs = new Set();
  function snap() { const d = read(), docs = Object.keys(d).map(id => ({ id, exists: true, data: () => d[id], metadata: {} })); return { docs, size: docs.length, empty: !docs.length, metadata: { fromCache: false, hasPendingWrites: false } }; }
  function dbFire() { const s = snap(); subs.forEach(f => f(s)); }
  const merge = (a, b) => { for (const k in b) { if (b[k] && typeof b[k] === "object" && !Array.isArray(b[k]) && a[k] && typeof a[k] === "object") merge(a[k], b[k]); else a[k] = b[k]; } return a; };
  const db = {
    collection() { const q = { limit() { return q; }, onSnapshot(n) { subs.add(n); setTimeout(() => n(snap()), 30); return () => subs.delete(n); } }; return q; },
    doc(p) { const id = p.split("/")[1]; return {
      async set(v) { if (id !== uid) throw { code: "invalid_argument" }; const d = read(); d[id] = v; write(d); },
      async update(v) { const d = read(); if (!d[id]) throw { code: "invalid_argument" }; merge(d[id], v); write(d); } }; }
  };
  const rooms = new Map();
  function makeRoom(name) {
    const peers = new Map(), fns = new Set();
    const self = { peer, by: uid, isMe: true, sameTab: true, kind: "viewer", guest: false, presence: {}, updatedAt: Date.now() };
    peers.set(peer, self);
    const list = () => [...peers.values()];
    const fire = () => { const p = list(); fns.forEach(f => f({ peers: p, joined: [], left: [], updated: [] })); };
    const r = {
      name, peers: list, connected: () => true,
      async presence(patch) { const q = Object.assign({}, self.presence); for (const k in patch) { if (patch[k] === null) delete q[k]; else q[k] = patch[k]; } self.presence = q; self.updatedAt = Date.now(); ch.postMessage({ t: "p", room: name, peer, by: uid, presence: q }); fire(); },
      onPeers(f) { fns.add(f); setTimeout(() => f({ peers: list(), joined: [], left: [], updated: [] }), 0); return () => fns.delete(f); },
      async leave() { ch.postMessage({ t: "left", room: name, peer }); rooms.delete(name); },
      _msg(m) {
        if (m.t === "hello") { ch.postMessage({ t: "p", room: name, peer, by: uid, presence: self.presence }); return; }
        if (m.t === "left") { peers.delete(m.peer); fire(); return; }
        peers.set(m.peer, { peer: m.peer, by: m.by, isMe: false, sameTab: false, kind: "viewer", guest: false, presence: m.presence, updatedAt: Date.now() }); fire();
      }
    };
    rooms.set(name, r);
    ch.postMessage({ t: "hello", room: name, peer });
    return r;
  }
  ch.onmessage = e => { const m = e.data; if (m.t === "db") { dbFire(); return; } const r = rooms.get(m.room); if (r && m.peer !== peer) r._msg(m); };
  const lobby = makeRoom("");
  lobby.join = async n => makeRoom(n);
  const user = { id: async () => uid, me: async () => ({ id: uid, name: "Tester " + uid.slice(2, 5) }), profiles: async ids => Object.fromEntries([].concat(ids).map(i => [i, { name: "Tester " + i.slice(2, 5) }])) };
  window.addEventListener("beforeunload", () => ch.postMessage({ t: "left", room: "", peer }));
  window.claude = { use: async n => ({ db, room: lobby, user })[n] || null };
  window.__mock = { uid };
})();
