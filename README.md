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

Every board has a clock, and the bot's route opens only after the board ends. Each board code has its own leaderboard, and every score on it is recalculated from the route that earned it.

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
| `DATA_DIR` | Where scores are kept on a single machine |
| `REDIS_URL` | Share rooms and scores across many server instances |
| `SESSION_SECRET` | 32 or more random characters, the same on every instance. Required with `REDIS_URL` |

Multi-instance mode has not been tested against a real Redis yet, so test it before relying on it. To run more than one instance, run `npm install` in `server/`, set `REDIS_URL` and `SESSION_SECRET`, and spread traffic across instances with a load balancer that does not buffer streams.

## Solver

`solver/solver.py` searches for a good placement on a board you type in, using Python only. It was written for the original contest format and treats every circle and diamond as worth the same number of points, so it does not yet handle per-target values.
