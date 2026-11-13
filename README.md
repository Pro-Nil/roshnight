# Roshnight

*Roshni* is Hindi for light. Roshnight is a browser puzzle about bending one beam through a blacked-out 30 by 30 city.

## Rules

- One beam leaves a random point on the edge of the map.
- You have 12 mirrors and 2 splitters. A splitter lets the beam continue straight and also reflects a copy.
- Circles add their value and diamonds subtract theirs. Each scores once. Blockades stop the beam.
- Your best layout is saved automatically and is the one that counts when the clock stops.
- You can save a layout and start over as many times as you like.

The same board code always generates the same city.

## Modes

- **Today's board:** a new code every day (midnight India time), one attempt on a fixed 5-minute clock, and its own leaderboard with that day's stats. Routes stay hidden until the day ends.
- **Multiplayer:** anyone can create a room and share its code. The host sets the time, and starting gives everyone the same random board.
- **Solo:** pick the time, then play a random board or any board code.

Every board has a clock, and the bot's route opens only after the board ends. Each board code has its own leaderboard, and every score on it is recalculated from the route that earned it. The bot finds the same route on every device. For the daily board the server works it out once, in a background thread, and gives it to each player when their attempt ends.

## Run it

You need Node.js 20 or newer:

```bash
node server/index.js
```

It prints a link for your PC and one for your network. Leaderboards are saved in `data/`, so keep that folder private and backed up. Opening `index.html` without the server still gives you solo play.

After changing anything in `src/`, rebuild with `python build.py`.

## Hosting it publicly

Always put it behind a proxy or host that provides HTTPS, and set these:

| Setting | Purpose |
| --- | --- |
| `PORT` | Port to listen on |
| `TRUST_PROXY=1` | Number of proxies in front, so rate limits see real players. Leave unset if there is no proxy |
| `HSTS=1` | Tell browsers to always use HTTPS |
| `DATA_DIR` | Folder for the session secret, and for scores when no database is set up |
| `MYSQL_URL` | MySQL or MariaDB address, as `mysql://user:password@host:3306/database`. Symbols in the password must be URL-encoded, so `mysql.json` below is easier |
| `MYSQL_POOL` | Database connections to keep open. Default 16 |
| `REDIS_URL` | Share rooms and scores across many server instances |
| `SESSION_SECRET` | 32 or more random characters, the same on every instance. Required with `REDIS_URL` |

Multi-instance mode has not been tested against a real Redis yet, so test it before relying on it. To run more than one instance, run `npm install` in `server/`, set `REDIS_URL` and `SESSION_SECRET`, and spread traffic across instances with a load balancer that does not buffer streams.

## Database

Without a database, scores are kept in `data/scores.json`, which is fine for trying the game on a PC. For real use, connect MySQL 8 or MariaDB 10.6 or newer:

1. Create an empty database and a user with full rights on it.
2. Run `npm ci --omit=dev --omit=optional` in `server/`.
3. Create `data/mysql.json`. It is never uploaded to GitHub:

```json
{ "host": "127.0.0.1", "port": 3306, "user": "roshnight", "password": "your password", "database": "roshnight" }
```

4. Start the server. It creates its tables and prints `Storage: MySQL`. If `data/scores.json` exists, its players, scores and daily attempts are imported once, and the file is renamed to `scores.json.imported` as a backup.

If the database cannot be reached at startup the server stops with a message instead of silently using the file. If it fails later, live rooms carry on and scores work again as soon as it returns.

Run `TEST_MYSQL_URL=mysql://user:password@host:3306/empty_database npm run test:mysql` in `server/` to check a database. It writes test data, so use an empty one.

## Solver

`solver/solver.py` searches for a good placement on a board you type in, using Python only. It was written for the original contest format and treats every circle and diamond as worth the same number of points, so it does not yet handle per-target values.
