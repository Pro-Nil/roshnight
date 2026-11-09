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

Today's board, free play, a 3-minute time trial and timed live matches. Each board code has its own leaderboard, and every score on it is recalculated from the route that earned it.

## Run it

Open `index.html` to play alone. Live matches and leaderboards use shared storage that exists only when the page runs as a Claude artifact.

After changing anything in `src/`, rebuild with:

```bash
python build.py
```

To try live play locally, serve the repo and open `tools/test.html` in two tabs. It replaces the shared services with a local stand-in.

```bash
python -m http.server 8000
```

## Solver

`solver/solver.py` searches for a good placement on a board you type in, using Python only. It was written for the original contest format and treats every circle and diamond as worth the same number of points, so it does not yet handle per-target values.
