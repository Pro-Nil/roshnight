'use strict';
// One-machine storage: rooms in memory, leaderboards in a file.
const fs = require('node:fs');
const path = require('node:path');

const MAX_BOARDS = 20000;
const BOARD_SIZE = 1000;
const MAX_TAGS = 200000;

class MemoryStore {
  constructor(dataDir) {
    this.file = path.join(dataDir, 'scores.json');
    this.dataDir = dataDir;
    this.boards = new Map();
    this.tags = new Map();
    this.rooms = new Map();
    this.attempts = new Map();
    this.listener = null;
    this.dirty = false;
    this.saving = false;
    try {
      const saved = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      for (const [code, entries] of Object.entries(saved.boards || {})) this.boards.set(code, new Map(Object.entries(entries)));
      for (const [uid, tag] of Object.entries(saved.tags || {})) this.tags.set(uid, tag);
      for (const [code, players] of Object.entries(saved.attempts || {})) this.attempts.set(code, new Map(Object.entries(players)));
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    this.timer = setInterval(() => this.save().catch(e => console.error('save failed:', e.message)), 5000);
    this.timer.unref();
  }

  async ping() { return true; }

  async save() {
    if (!this.dirty || this.saving) return;
    this.saving = true; this.dirty = false;
    try {
      const boards = {};
      for (const [code, entries] of this.boards) boards[code] = Object.fromEntries(entries);
      const attempts = {};
      for (const [code, players] of this.attempts) attempts[code] = Object.fromEntries(players);
      const text = JSON.stringify({ boards, tags: Object.fromEntries(this.tags), attempts });
      await fs.promises.mkdir(this.dataDir, { recursive: true, mode: 0o700 });
      const temp = `${this.file}.tmp`;
      await fs.promises.writeFile(temp, text, { mode: 0o600 });
      await fs.promises.rename(temp, this.file);
    } catch (error) { this.dirty = true; throw error; } finally { this.saving = false; }
  }

  async close() { clearInterval(this.timer); this.dirty = this.dirty || false; await this.save(); }

  async setTag(uid, tag) {
    if (!this.tags.has(uid) && this.tags.size >= MAX_TAGS) return;
    this.tags.set(uid, tag); this.dirty = true;
  }

  async submit(code, uid, entry) {
    let board = this.boards.get(code);
    if (!board) {
      board = new Map(); this.boards.set(code, board);
      if (this.boards.size > MAX_BOARDS) this.boards.delete(this.boards.keys().next().value);
    } else { this.boards.delete(code); this.boards.set(code, board); }
    const old = board.get(uid);
    if (old && (entry.s < old.s || (entry.s === old.s && entry.n >= old.n))) return false;
    board.set(uid, entry);
    if (board.size > BOARD_SIZE) {
      const worst = [...board].sort((a, b) => a[1].s - b[1].s || b[1].n - a[1].n)[0][0];
      board.delete(worst);
    }
    this.dirty = true;
    return true;
  }

  async top(code, limit) {
    const board = this.boards.get(code);
    if (!board) return [];
    return [...board].sort((a, b) => b[1].s - a[1].s || a[1].n - b[1].n || a[1].at - b[1].at).slice(0, limit)
      .map(([id, e]) => ({ id, tag: this.tags.get(id) || '', ...e }));
  }

  async hot(limit) {
    return [...this.boards].sort((a, b) => b[1].size - a[1].size).slice(0, limit).map(([code]) => code);
  }

  // Stores the attempt and returns null, or returns the one already there.
  async beginAttempt(code, uid, record) {
    let players = this.attempts.get(code);
    if (!players) {
      players = new Map(); this.attempts.set(code, players);
      if (this.attempts.size > 5) this.attempts.delete(this.attempts.keys().next().value);
    }
    if (players.has(uid)) return players.get(uid);
    players.set(uid, record); this.dirty = true;
    return null;
  }
  async getAttempt(code, uid) { const players = this.attempts.get(code); return (players && players.get(uid)) || null; }
  async endAttempt(code, uid) {
    const players = this.attempts.get(code), record = players && players.get(uid);
    if (record && !record.done) { players.set(uid, { ...record, done: true }); this.dirty = true; }
  }

  async createRoom(name, member) {
    if (this.rooms.has(name)) return false;
    this.rooms.set(name, new Map([[member.peer, member]]));
    return true;
  }
  async roomExists(name) { return this.rooms.has(name); }
  async members(name) { return [...(this.rooms.get(name) || new Map()).values()]; }
  async putMember(name, member) { const room = this.rooms.get(name); if (room) room.set(member.peer, member); }
  async delMember(name, peer) {
    const room = this.rooms.get(name); if (!room) return;
    room.delete(peer);
    if (!room.size) this.rooms.delete(name);
  }
  async roomCount() { return this.rooms.size; }
  async publish(name) { if (this.listener) this.listener(name); }
  onPublish(fn) { this.listener = fn; }
  async watch() {}
  async unwatch() {}
}

module.exports = { MemoryStore };
