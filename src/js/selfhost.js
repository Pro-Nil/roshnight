/* ---------- Own server: offers the shared calls the game uses, when the Roshnight server is running ---------- */
(function () {
  if (window.claude || location.protocol === "file:") return;
  const hex = n => Array.from(crypto.getRandomValues(new Uint8Array(n)), b => b.toString(16).padStart(2, "0")).join("");
  const session = hex(16), subs = new Set(), scores = new Map(), fetched = new Map(), recent = [];
  let token = null, uid = null, myTag = "";
  try { token = localStorage.getItem("roshnight-token"); } catch (e) {}

  const failure = (status, body) => ({ code: (body && body.error === "already_in_room" && body.error) || { 400: "invalid_argument", 404: "not_found", 409: "room_taken", 403: "room_full", 429: "rate_limited" }[status] || "unavailable", message: "The server refused that." });
  async function post(path, body) {
    const headers = { "Content-Type": "application/json" };
    if (token) headers.Authorization = "Bearer " + token;
    let r = await fetch(path, { method: "POST", headers, body: JSON.stringify(body) });
    if (r.status === 401) { await hello(true); headers.Authorization = "Bearer " + token; r = await fetch(path, { method: "POST", headers, body: JSON.stringify(body) }); }
    if (!r.ok) throw failure(r.status, await r.json().catch(() => null));
    return r.json();
  }
  async function hello(fresh) {
    if (fresh) token = null;
    const headers = { "Content-Type": "application/json" };
    if (token) headers.Authorization = "Bearer " + token;
    const r = await fetch("/api/hello", { method: "POST", headers, body: "{}" });
    if (!r.ok) throw failure(r.status);
    const me = await r.json();
    uid = me.id;
    if (me.token) { token = me.token; try { localStorage.setItem("roshnight-token", token); } catch (e) {} }
  }

  function snapshot() {
    const docs = [...scores].map(([id, d]) => ({ id, exists: true, data: () => d, metadata: { fromCache: false, hasPendingWrites: false } }));
    return { docs, size: docs.length, empty: !docs.length, metadata: { fromCache: false, hasPendingWrites: false } };
  }
  const publish = () => { const s = snapshot(); subs.forEach(f => f(s)); };
  function store(id, tag, code, e) {
    const d = scores.get(id) || { tag: "", boards: {} };
    if (tag) d.tag = tag;
    d.boards[code] = { t: { r: e.r, at: e.at, d: e.d, s: e.s, n: e.n } };
    scores.set(id, d);
  }
  async function loadBoard(code) {
    fetched.set(code, Date.now());
    try {
      const r = await fetch("/api/board/" + code);
      if (!r.ok) return;
      for (const e of (await r.json()).entries) store(e.id, e.tag, code, e);
      publish();
    } catch (e) {}
  }
  // The game asks for a board whenever it draws one, so only boards on screen are fetched.
  window.roshnightNeed = code => {
    const i = recent.indexOf(code); if (i >= 0) recent.splice(i, 1);
    recent.unshift(code); recent.length = Math.min(recent.length, 4);
    if (Date.now() - (fetched.get(code) || 0) > 10000) loadBoard(code);
  };
  setInterval(() => { if (!document.hidden) recent.slice(0, 2).forEach(c => { if (Date.now() - (fetched.get(c) || 0) > 15000) loadBoard(c); }); }, 5000);

  // Keeps one clock for everyone, using the fastest of a few round trips to the server.
  let clockOffset = 0;
  async function syncClock() {
    let best = Infinity;
    for (let i = 0; i < 5; i++) {
      try {
        const began = performance.now();
        const { now } = await (await fetch("/api/time", { cache: "no-store" })).json();
        const trip = performance.now() - began;
        if (trip < best) { best = trip; clockOffset = now + trip / 2 - Date.now(); }
      } catch (e) { return; }
    }
  }
  const ready = (async () => {
    try {
      const h = await fetch("/api/health", { cache: "no-store" });
      if (!h.ok || !(await h.json()).roshnight) return false;
      await hello();
      syncClock();
      fetch("/api/hot").then(r => r.json()).then(j => j.codes.forEach(c => window.roshnightNeed(c))).catch(() => {});
      return true;
    } catch (e) { return false; }
  })();

  window.roshnightDaily = {
    start: async code => ((await ready) ? post("/api/daily/start", { code }) : null),
    finish: async code => { if (await ready) post("/api/daily/finish", { code }).catch(() => {}); }
  };

  async function write(data) {
    if (typeof data.tag === "string" && data.tag !== myTag) { myTag = data.tag; await post("/api/tag", { tag: data.tag }); const d = scores.get(uid); if (d) d.tag = data.tag; }
    for (const [code, kinds] of Object.entries(data.boards || {})) {
      if (!kinds.t) continue;
      const res = await post("/api/score", { code, r: kinds.t.r, d: kinds.t.d });
      if (res.accepted) { store(uid, myTag, code, res.entry); publish(); }
    }
  }
  const db = {
    collection() {
      const q = { limit: () => q, onSnapshot(next) { subs.add(next); setTimeout(() => next(snapshot()), 0); return () => subs.delete(next); } };
      return q;
    },
    doc() { return { set: write, update: write }; }
  };

  function makeRoom(name, first, peer) {
    const fns = new Set(), errors = new Set(), others = new Map();
    let conn = new AbortController(), heard = Date.now(), eventAt = Date.now();
    const self = { peer, by: uid, isMe: true, sameTab: true, kind: "viewer", guest: false, presence: {}, updatedAt: Date.now() };
    let sending = false, waiting = false, left = false;
    const list = () => [self, ...others.values()];
    const fire = () => { const peers = list(); fns.forEach(f => f({ peers, joined: [], left: [], updated: [] })); };
    async function flush() {
      if (sending) return;
      sending = true;
      while (waiting && !left) {
        waiting = false;
        try { await post("/api/room/presence", { room: name, session, presence: self.presence }); }
        catch (e) {
          if (e.code === "rate_limited") { waiting = true; await new Promise(r => setTimeout(r, 1000)); }
          else if (e.code === "not_found") await rejoin();
        }
      }
      sending = false;
    }
    function update(all) {
      const seen = new Set();
      for (const p of all) {
        if (p.peer === peer) {
          if (!!p.presence.own !== !!self.presence.own) { const q = Object.assign({}, self.presence); if (p.presence.own) q.own = true; else delete q.own; self.presence = q; }
          continue;
        }
        seen.add(p.peer);
        const old = others.get(p.peer);
        if (!old || JSON.stringify(old.presence) !== JSON.stringify(p.presence)) others.set(p.peer, { peer: p.peer, by: p.by, isMe: false, sameTab: false, kind: "viewer", guest: false, presence: p.presence, updatedAt: Date.now() });
      }
      for (const k of others.keys()) if (!seen.has(k)) others.delete(k);
      fire();
    }
    async function rejoin() {
      try { await post("/api/room/join", { room: name, session }); waiting = true; flush(); }
      catch (e) {
        if ((e.code !== "not_found" && e.code !== "already_in_room") || left) return;
        left = true; conn.abort(); clearInterval(timer);
        errors.forEach(f => f(e));
      }
    }
    async function listen() {
      let wait = 500;
      while (!left) {
        try {
          conn = new AbortController(); heard = Date.now();
          const res = await fetch(`/api/room/stream?room=${name}&session=${session}`, { headers: { Authorization: "Bearer " + token }, signal: conn.signal });
          if (res.status === 404) { await rejoin(); if (left) return; await new Promise(r => setTimeout(r, wait)); continue; }
          if (!res.ok) throw failure(res.status);
          wait = 500;
          const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
          let buf = "";
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            buf += value; heard = Date.now();
            let at;
            while ((at = buf.indexOf("\n\n")) >= 0) {
              const line = buf.slice(0, at); buf = buf.slice(at + 2);
              if (line.startsWith("data: ")) { eventAt = Date.now(); update(JSON.parse(line.slice(6)).peers); }
            }
          }
        } catch (e) {
          if (left) return;
        }
        if (left) return;
        await new Promise(r => setTimeout(r, wait));
        wait = Math.min(wait * 2, 8000);
      }
    }
    // A live connection can stall silently on some networks, so check in whenever it goes quiet.
    const timer = setInterval(async () => {
      if (left) return;
      const now = Date.now();
      if (now - heard > 40000) { heard = now; conn.abort(); }
      if (now - eventAt < (self.presence.st === "play" ? 15000 : 2000)) return;
      eventAt = now;
      try {
        const res = await fetch(`/api/room/peers?room=${name}&session=${session}`, { headers: { Authorization: "Bearer " + token } });
        if (res.status === 404) await rejoin();
        else if (res.ok && !left) update((await res.json()).peers);
      } catch (e) {}
    }, 1000);
    const r = {
      name, peers: list, connected: () => true, serverNow: () => Date.now() + clockOffset,
      async presence(patch) {
        const q = Object.assign({}, self.presence);
        for (const k in patch) { if (patch[k] === null) delete q[k]; else q[k] = patch[k]; }
        self.presence = q; self.updatedAt = Date.now(); waiting = true; flush(); fire();
      },
      onPeers(f, onError) { fns.add(f); if (onError) errors.add(onError); setTimeout(() => f({ peers: list(), joined: [], left: [], updated: [] }), 0); return () => fns.delete(f); },
      async leave() { left = true; clearInterval(timer); conn.abort(); post("/api/room/leave", { room: name, session }).catch(() => {}); }
    };
    update(first);
    listen();
    return r;
  }
  const room = {
    async join(name, opts) {
      syncClock();
      const res = await post(opts && opts.create ? "/api/room/create" : "/api/room/join", { room: name, session });
      return makeRoom(name, res.peers, res.peer);
    }
  };
  const user = {
    id: async () => uid,
    me: async () => ({ id: uid, name: "" }),
    profiles: async ids => Object.fromEntries([].concat(ids).map(i => [i, { name: "" }]))
  };
  window.claude = { use: async name => ((await ready) ? ({ db, room, user })[name] || null : null) };
})();
