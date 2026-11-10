'use strict';
// Checks the MySQL store against a real, empty database: TEST_MYSQL_URL=mysql://user:pass@host:port/db node test/mysql.js
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { MysqlStore } = require('../store-mysql');
const { MemoryRooms } = require('../store-memory');

const URI = process.env.TEST_MYSQL_URL;
if (!URI) { console.error('Set TEST_MYSQL_URL to an empty test database.'); process.exit(1); }
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'roshnight-mysql-'));
const FILE = path.join(DIR, 'scores.json');
let passed = 0, failed = 0;
const check = (name, ok, extra) => { if (ok) { passed++; console.log(`PASS  ${name}`); } else { failed++; console.log(`FAIL  ${name}`, extra === undefined ? '' : JSON.stringify(extra)); } };
const open = () => MysqlStore.open({ uri: URI }, new MemoryRooms(), DIR);
const entry = (s, n, at = 1000) => ({ s, n, r: [9, 18, 27].slice(0, n), at, d: 180000 });

(async () => {
  fs.writeFileSync(FILE, JSON.stringify({
    tags: { u_a: 'Neon Tiger', u_b: 'neon tiger', u_c: 'दीया ✨' },
    boards: { OLD1: { u_a: entry(50, 2, 5), u_b: entry(70, 3, 6) }, OLD2: { u_a: entry(9, 1, 7) } },
    attempts: { DTODAY: { u_a: { start: Date.now(), end: Date.now() + 1000, done: true }, u_b: { start: Date.now(), end: Date.now() + 1000, done: false } } },
  }));
  let store = await open();
  const old = await store.top('OLD1', 10);
  check('old scores are imported in rank order', old.length === 2 && old[0].id === 'u_b' && old[0].s === 70 && old[1].id === 'u_a', old);
  check('old routes survive the import', JSON.stringify(old[0].r) === '[9,18,27]', old[0]);
  check('old players keep their names', old[1].tag === 'Neon Tiger', old[1]);
  check('a duplicate old name is made unique', old[0].tag === 'neon tiger 2', old[0]);
  check('names in any script survive', (await store.getTag('u_c')) === 'दीया ✨');
  check('used attempts stay used after the import', (await store.getAttempt('DTODAY', 'u_a')).done === true && (await store.getAttempt('DTODAY', 'u_b')).done === false);
  check('the old file is kept as a backup', !fs.existsSync(FILE) && fs.existsSync(`${FILE}.imported`));

  check('a higher score replaces a lower one', (await store.submit('B1', 'x', entry(10, 2))) === true && (await store.submit('B1', 'x', entry(20, 2))) === true);
  check('a lower score is ignored', (await store.submit('B1', 'x', entry(5, 1))) === false && (await store.top('B1', 1))[0].s === 20);
  check('the same score with fewer pieces counts', (await store.submit('B1', 'x', entry(20, 1))) === true && (await store.top('B1', 1))[0].n === 1);
  check('the same score with more pieces is ignored', (await store.submit('B1', 'x', entry(20, 3))) === false);
  await Promise.all(Array.from({ length: 40 }, (_, i) => store.submit('B2', 'race', entry(i + 1, 2))));
  check('the best of many simultaneous scores wins', (await store.top('B2', 5))[0].s === 40, await store.top('B2', 5));
  await store.submit('B1', 'y', entry(20, 1, 500)); await store.submit('B1', 'z', entry(21, 3, 900));
  const ranked = (await store.top('B1', 10)).map(e => e.id);
  check('ties rank by fewer pieces, then earlier time', JSON.stringify(ranked) === '["z","y","x"]', ranked);
  check('limit is respected', (await store.top('B1', 2)).length === 2);
  await store.submit('B9', 'a', entry(1, 1)); await store.submit('B9', 'b', entry(1, 1)); await store.submit('B9', 'c', entry(1, 1)); await store.submit('B9', 'd', entry(1, 1));
  check('the busiest board comes first', (await store.hot(1))[0] === 'B9', await store.hot(3));

  const starts = await Promise.all(Array.from({ length: 30 }, (_, i) => store.beginAttempt('DAY1', 'once', { start: i, end: i + 1, done: false })));
  check('only one simultaneous daily start gets the attempt', starts.filter(s => s === null).length === 1, starts);
  await store.endAttempt('DAY1', 'once');
  check('a finished attempt is remembered', (await store.getAttempt('DAY1', 'once')).done === true);

  const claims = await Promise.all(Array.from({ length: 30 }, (_, i) => store.setTag(`racer${i}`, 'Sole Owner')));
  check('only one simultaneous claim gets a name', claims.filter(Boolean).length === 1, claims.filter(Boolean).length);
  check('a name is free after its owner renames', (await store.setTag('n1', 'First')) && (await store.setTag('n1', 'Second')) && (await store.setTag('n2', 'First')));
  check('a player can keep and restyle their own name', (await store.setTag('n2', 'First')) && (await store.setTag('n2', 'FIRST')) && (await store.getTag('n2')) === 'FIRST');
  check('a renamed-to held name is refused', (await store.setTag('n2', 'second')) === false && (await store.getTag('n2')) === 'FIRST');
  const nasty = "'); DROP TABLE x";
  check('database syntax is stored as plain text', (await store.setTag('n3', nasty)) && (await store.getTag('n3')) === nasty);

  await store.close();
  store = await open();
  check('everything is still there after a restart', (await store.top('B1', 1))[0].id === 'z' && (await store.getTag('n2')) === 'FIRST' && (await store.getAttempt('DAY1', 'once')).done === true);
  check('the import does not run twice', (await store.top('OLD1', 10)).length === 2);

  const many = 20000, values = [];
  for (let i = 0; i < many; i++) values.push(['BIG', `p${i}`, i % 500, 5, '[9,18,27]', i, 0]);
  for (let i = 0; i < many; i += 2000) await store.pool.query('INSERT INTO scores (code, uid, s, n, r, at_ms, d) VALUES ?', [values.slice(i, i + 2000)]);
  let began = performance.now();
  for (let i = 0; i < 50; i++) await store.top('BIG', 200);
  const readMs = (performance.now() - began) / 50;
  began = performance.now();
  await Promise.all(Array.from({ length: 2000 }, (_, i) => store.submit(`S${i % 50}`, `w${i}`, entry(i, 2))));
  const writeSec = (performance.now() - began) / 1000;
  console.log(`INFO  top 200 of ${many} scores: ${readMs.toFixed(1)} ms. 2000 scores saved in ${writeSec.toFixed(2)} s (${Math.round(2000 / writeSec)} per second).`);
  await store.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch(error => { console.error(error); process.exit(1); });
