'use strict';
// Many-machine storage: every server instance shares rooms and leaderboards through Redis.
const Redis = require('ioredis');

const BOARD_SIZE = 1000;
const ROOM_TTL = 4 * 3600;
const BOARD_TTL = 400 * 86400;
const rank = e => e.s * 100 - e.n;

class RedisStore {
  constructor(url) {
    const options = { maxRetriesPerRequest: 2, enableReadyCheck: true };
    this.db = new Redis(url, options);
    this.sub = new Redis(url, options);
    for (const client of [this.db, this.sub]) client.on('error', e => console.error('redis:', e.message));
    this.listener = null;
    this.sub.on('message', (channel) => { if (this.listener) this.listener(channel.slice(3)); });
  }

  async ping() { return (await this.db.ping()) === 'PONG'; }
  async close() { this.db.disconnect(); this.sub.disconnect(); }
  async setTag(uid, tag) { await this.db.hset('tags', uid, tag); }

  async submit(code, uid, entry) {
    const ranks = `b:${code}`, data = `be:${code}`;
    const old = await this.db.hget(data, uid);
    if (old) { const prev = JSON.parse(old); if (rank(entry) <= rank(prev)) return false; }
    const multi = this.db.multi()
      .zadd(ranks, 'GT', 'CH', rank(entry), uid)
      .hset(data, uid, JSON.stringify(entry))
      .expire(ranks, BOARD_TTL).expire(data, BOARD_TTL);
    if (!old) multi.zincrby('hot', 1, code);
    await multi.exec();
    const size = await this.db.zcard(ranks);
    if (size > BOARD_SIZE) {
      const drop = await this.db.zrange(ranks, 0, size - BOARD_SIZE - 1);
      await this.db.multi().zrem(ranks, ...drop).hdel(data, ...drop).exec();
    }
    return true;
  }

  async top(code, limit) {
    const ids = await this.db.zrevrange(`b:${code}`, 0, limit - 1);
    if (!ids.length) return [];
    const [entries, tags] = await Promise.all([this.db.hmget(`be:${code}`, ...ids), this.db.hmget('tags', ...ids)]);
    return ids.flatMap((id, i) => (entries[i] ? [{ id, tag: tags[i] || '', ...JSON.parse(entries[i]) }] : []));
  }

  async hot(limit) { return this.db.zrevrange('hot', 0, limit - 1); }

  async beginAttempt(code, uid, record) {
    const key = `da:${code}`;
    if (await this.db.hsetnx(key, uid, JSON.stringify(record))) { await this.db.expire(key, 3 * 86400); return null; }
    return JSON.parse(await this.db.hget(key, uid));
  }
  async getAttempt(code, uid) { const value = await this.db.hget(`da:${code}`, uid); return value ? JSON.parse(value) : null; }
  async endAttempt(code, uid) {
    const record = await this.getAttempt(code, uid);
    if (record && !record.done) await this.db.hset(`da:${code}`, uid, JSON.stringify({ ...record, done: true }));
  }

  async createRoom(name, member) {
    const key = `r:${name}`;
    const made = await this.db.hsetnx(key, member.peer, JSON.stringify(member));
    if (!made || (await this.db.hlen(key)) !== 1) { if (made) await this.db.hdel(key, member.peer); return false; }
    await this.db.expire(key, ROOM_TTL);
    return true;
  }
  async roomExists(name) { return (await this.db.exists(`r:${name}`)) === 1; }
  async members(name) { return Object.values(await this.db.hgetall(`r:${name}`)).map(v => JSON.parse(v)); }
  async putMember(name, member) {
    const key = `r:${name}`;
    await this.db.multi().hset(key, member.peer, JSON.stringify(member)).expire(key, ROOM_TTL).exec();
  }
  async delMember(name, peer) { await this.db.hdel(`r:${name}`, peer); }
  async roomCount() { return 0; }
  async publish(name) { await this.db.publish(`ch:${name}`, '1'); }
  onPublish(fn) { this.listener = fn; }
  async watch(name) { await this.sub.subscribe(`ch:${name}`); }
  async unwatch(name) { await this.sub.unsubscribe(`ch:${name}`); }
}

module.exports = { RedisStore };
