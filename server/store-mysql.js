'use strict';
// Permanent data lives in MySQL or MariaDB. Live rooms stay in memory, or in Redis across many machines.
const fs = require('node:fs');
const path = require('node:path');
const { nameKey, distinctName } = require('./names');

const TAG_CACHE = 50000;
const TAG_CACHE_MS = 30000;
const ATTEMPT_KEEP_MS = 3 * 86400000;
const BATCH = 500;
const CHARSET = 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin';

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS players (
    uid VARCHAR(40) NOT NULL PRIMARY KEY,
    tag VARCHAR(32) NOT NULL,
    tag_key VARCHAR(64) NOT NULL,
    UNIQUE KEY unique_name (tag_key)
  ) ${CHARSET}`,
  `CREATE TABLE IF NOT EXISTS scores (
    code VARCHAR(10) NOT NULL,
    uid VARCHAR(40) NOT NULL,
    s INT NOT NULL,
    n SMALLINT NOT NULL,
    r VARCHAR(255) NOT NULL,
    at_ms BIGINT NOT NULL,
    d INT NOT NULL DEFAULT 0,
    PRIMARY KEY (code, uid),
    KEY board_rank (code, s DESC, n, at_ms)
  ) ${CHARSET}`,
  `CREATE TABLE IF NOT EXISTS boards (
    code VARCHAR(10) NOT NULL PRIMARY KEY,
    players INT UNSIGNED NOT NULL DEFAULT 0,
    KEY busiest (players)
  ) ${CHARSET}`,
  `CREATE TABLE IF NOT EXISTS attempts (
    code VARCHAR(10) NOT NULL,
    uid VARCHAR(40) NOT NULL,
    record VARCHAR(255) NOT NULL,
    done TINYINT NOT NULL DEFAULT 0,
    created_ms BIGINT NOT NULL,
    PRIMARY KEY (code, uid),
    KEY by_age (created_ms)
  ) ${CHARSET}`,
];

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

class MysqlStore {
  constructor(pool, rooms) {
    this.pool = pool;
    this.rooms = rooms;
    this.tagCache = new Map();
    this.sweep = setInterval(() => this.dropOldAttempts().catch(e => console.error('cleanup failed:', e.message)), 3600000);
    this.sweep.unref();
  }

  static async open(settings, rooms, dataDir) {
    let mysql;
    try { mysql = require('mysql2/promise'); }
    catch (error) { throw new Error('MySQL is configured but its driver is missing. Run "npm install --omit=optional" in the server folder.'); }
    const pool = mysql.createPool({
      ...settings, charset: 'utf8mb4', connectionLimit: Number(process.env.MYSQL_POOL) || 16,
      waitForConnections: true, queueLimit: 4000, enableKeepAlive: true, connectTimeout: 10000,
    });
    for (let attempt = 1; ; attempt++) {
      try { await pool.query('SELECT 1'); break; }
      catch (error) {
        if (attempt >= 6) { await pool.end().catch(() => {}); throw new Error(`Could not connect to the database: ${error.code || error.message}`); }
        await wait(3000);
      }
    }
    for (const statement of SCHEMA) await pool.query(statement);
    const store = new MysqlStore(pool, rooms);
    await store.importSavedFile(path.join(dataDir, 'scores.json'));
    return store;
  }

  // Brings over the old scores.json once, then renames it so it is kept as a backup and never read again.
  async importSavedFile(file) {
    let saved;
    try { saved = JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') return; throw new Error(`Could not read ${file}: ${error.message}`); }
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();
      const [held] = await conn.query('SELECT uid, tag_key FROM players');
      const known = new Set(held.map(p => p.uid)), taken = new Set(held.map(p => p.tag_key)), players = [];
      for (const [uid, savedTag] of Object.entries(saved.tags || {})) {
        if (!savedTag || known.has(uid)) continue;
        const tag = taken.has(nameKey(savedTag)) ? distinctName(savedTag, key => taken.has(key)) : savedTag;
        taken.add(nameKey(tag));
        players.push([uid, tag, nameKey(tag)]);
      }
      const scores = [], attempts = [];
      for (const [code, entries] of Object.entries(saved.boards || {})) {
        for (const [uid, e] of Object.entries(entries)) scores.push([code, uid, e.s, e.n, JSON.stringify(e.r), e.at, e.d || 0]);
      }
      for (const [code, runs] of Object.entries(saved.attempts || {})) {
        for (const [uid, run] of Object.entries(runs)) attempts.push([code, uid, JSON.stringify({ start: run.start, end: run.end }), run.done ? 1 : 0, run.start]);
      }
      const insert = async (sql, rows) => { for (let i = 0; i < rows.length; i += BATCH) await conn.query(sql, [rows.slice(i, i + BATCH)]); };
      await insert('INSERT IGNORE INTO players (uid, tag, tag_key) VALUES ?', players);
      await insert('INSERT IGNORE INTO scores (code, uid, s, n, r, at_ms, d) VALUES ?', scores);
      await insert('INSERT IGNORE INTO attempts (code, uid, record, done, created_ms) VALUES ?', attempts);
      await conn.query('DELETE FROM boards');
      await conn.query('INSERT INTO boards (code, players) SELECT code, COUNT(*) FROM scores GROUP BY code');
      await conn.commit();
      fs.renameSync(file, `${file}.imported`);
      console.log(`  Imported ${players.length} players and ${scores.length} scores from the old file.`);
    } catch (error) { await conn.rollback().catch(() => {}); throw error; } finally { conn.release(); }
  }

  async ping() { await this.pool.query('SELECT 1'); return true; }

  async close() {
    clearInterval(this.sweep);
    if (this.rooms.close) await this.rooms.close();
    await this.pool.end();
  }

  rememberTag(uid, tag) {
    this.tagCache.delete(uid);
    this.tagCache.set(uid, { tag, at: Date.now() });
    if (this.tagCache.size > TAG_CACHE) this.tagCache.delete(this.tagCache.keys().next().value);
  }

  // Returns false when someone else already holds the name. The database's unique key settles any race.
  async setTag(uid, tag) {
    const key = nameKey(tag), rename = () => this.pool.execute('UPDATE players SET tag = ?, tag_key = ? WHERE uid = ?', [tag, key, uid]);
    try {
      const [updated] = await rename();
      if (!updated.affectedRows) await this.pool.execute('INSERT INTO players (uid, tag, tag_key) VALUES (?, ?, ?)', [uid, tag, key]);
    } catch (error) {
      if (error.code !== 'ER_DUP_ENTRY') throw error;
      const [rows] = await this.pool.execute('SELECT uid FROM players WHERE tag_key = ?', [key]);
      if (rows[0] && rows[0].uid !== uid) return false;
      await rename();
    }
    this.rememberTag(uid, tag);
    return true;
  }

  async getTag(uid) {
    const cached = this.tagCache.get(uid);
    if (cached && Date.now() - cached.at < TAG_CACHE_MS) return cached.tag;
    // Live rooms call this constantly, so a database outage must not interrupt a game in progress.
    let rows;
    try { [rows] = await this.pool.execute('SELECT tag FROM players WHERE uid = ?', [uid]); }
    catch { return cached ? cached.tag : ''; }
    const tag = rows[0] ? rows[0].tag : '';
    this.rememberTag(uid, tag);
    return tag;
  }

  // Keeps a player's single best run on each board: a higher score, or the same score with fewer pieces.
  async submit(code, uid, entry) {
    const route = JSON.stringify(entry.r);
    const [added] = await this.pool.execute(
      'INSERT IGNORE INTO scores (code, uid, s, n, r, at_ms, d) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [code, uid, entry.s, entry.n, route, entry.at, entry.d],
    );
    if (added.affectedRows) {
      await this.pool.execute('INSERT INTO boards (code, players) VALUES (?, 1) ON DUPLICATE KEY UPDATE players = players + 1', [code]);
      return true;
    }
    const [improved] = await this.pool.execute(
      'UPDATE scores SET s = ?, n = ?, r = ?, at_ms = ?, d = ? WHERE code = ? AND uid = ? AND (s < ? OR (s = ? AND n > ?))',
      [entry.s, entry.n, route, entry.at, entry.d, code, uid, entry.s, entry.s, entry.n],
    );
    return improved.affectedRows > 0;
  }

  async top(code, limit) {
    const count = Math.max(1, Math.min(1000, Math.floor(limit)));
    const [rows] = await this.pool.execute(
      `SELECT s.uid, s.s, s.n, s.r, s.at_ms, s.d, p.tag FROM scores s LEFT JOIN players p ON p.uid = s.uid
       WHERE s.code = ? ORDER BY s.s DESC, s.n ASC, s.at_ms ASC LIMIT ${count}`,
      [code],
    );
    return rows.map(row => ({ id: row.uid, tag: row.tag || '', s: row.s, n: row.n, r: JSON.parse(row.r), at: Number(row.at_ms), d: row.d }));
  }

  async hot(limit) {
    const count = Math.max(1, Math.min(100, Math.floor(limit)));
    const [rows] = await this.pool.query(`SELECT code FROM boards ORDER BY players DESC LIMIT ${count}`);
    return rows.map(row => row.code);
  }

  // Stores the attempt and returns null, or returns the one already there.
  async beginAttempt(code, uid, record) {
    const [added] = await this.pool.execute(
      'INSERT IGNORE INTO attempts (code, uid, record, done, created_ms) VALUES (?, ?, ?, ?, ?)',
      [code, uid, JSON.stringify({ start: record.start, end: record.end }), record.done ? 1 : 0, Date.now()],
    );
    return added.affectedRows ? null : this.getAttempt(code, uid);
  }

  async getAttempt(code, uid) {
    const [rows] = await this.pool.execute('SELECT record, done FROM attempts WHERE code = ? AND uid = ?', [code, uid]);
    return rows[0] ? { ...JSON.parse(rows[0].record), done: !!rows[0].done } : null;
  }

  async endAttempt(code, uid) { await this.pool.execute('UPDATE attempts SET done = 1 WHERE code = ? AND uid = ?', [code, uid]); }
  async dropOldAttempts() { await this.pool.execute('DELETE FROM attempts WHERE created_ms < ?', [Date.now() - ATTEMPT_KEEP_MS]); }
}

for (const method of ['createRoom', 'roomExists', 'members', 'putMember', 'delMember', 'roomCount', 'publish', 'onPublish', 'watch', 'unwatch']) {
  MysqlStore.prototype[method] = function (...args) { return this.rooms[method](...args); };
}

module.exports = { MysqlStore };
