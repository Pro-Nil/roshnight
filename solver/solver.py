#!/usr/bin/env python3
"""LUCIFER solver: place mirrors and splitters to light circles and avoid diamonds.

Usage:   python solver.py board.txt --time 30
Needs:   Python 3 only, no packages.

Board file (row col numbering, top-left is 0,0 unless you pass --one-based):
    size 30
    source 12 0 R            # direction is R, D, L or U
    circle 12,4 7,9 3,15     # any number of cells per line, repeat lines freely
    diamond 9,17 20,8
    wall 5,12 10,13          # rectangle: two opposite corners
    wall 7,7                 # or a single cell
    mirrors 12               # optional, default 12
    splitters 2              # optional, default 2

Rules assumed, taken from the demo on the projector:
    A mirror turns the beam 90 degrees and works from both sides.
    A splitter lets the beam continue straight AND reflects one copy.
    Circles and diamonds do not stop the beam. Each scores once.
    Walls stop the beam. Pieces cannot sit on walls, targets or the source.
Flags at the bottom of this file change the rules that were not visible in the demo.
"""
import argparse
import math
import random
import sys
import time

DIRS = [(0, 1), (1, 0), (0, -1), (-1, 0)]  # R, D, L, U as (row, col) steps
NAMES = "RDLU"
REFLECT = {"/": [3, 2, 1, 0], "\\": [1, 0, 3, 2]}


class Board:
    def __init__(self, path, args):
        self.args = args
        self.n = 30
        self.mirrors = 12
        self.splitters = 2
        self.source = None
        self.circles, self.diamonds, self.walls = [], [], set()
        off = 1 if args.one_based else 0

        def cell(text):
            r, c = text.split(",")
            return int(r) - off, int(c) - off

        for raw in open(path, encoding="utf-8"):
            parts = raw.split("#")[0].split()
            if not parts:
                continue
            key, rest = parts[0].lower(), parts[1:]
            if key == "size":
                self.n = int(rest[0])
            elif key == "mirrors":
                self.mirrors = int(rest[0])
            elif key == "splitters":
                self.splitters = int(rest[0])
            elif key == "source":
                self.source = (int(rest[0]) - off, int(rest[1]) - off,
                               NAMES.index(rest[2].upper()))
            elif key == "circle":
                self.circles += [cell(t) for t in rest]
            elif key == "diamond":
                self.diamonds += [cell(t) for t in rest]
            elif key == "wall":
                a, b = cell(rest[0]), cell(rest[-1])
                for r in range(min(a[0], b[0]), max(a[0], b[0]) + 1):
                    for c in range(min(a[1], b[1]), max(a[1], b[1]) + 1):
                        self.walls.add((r, c))
            else:
                sys.exit(f"Unknown line in board file: {raw.strip()}")
        if self.source is None:
            sys.exit("The board file needs a source line.")

        self.circles = sorted(set(self.circles))
        self.diamonds = sorted(set(self.diamonds))
        self.target_set = set(self.circles) | set(self.diamonds)
        self.circle_vals = args.circle
        self.diamond_vals = args.diamond

        # Each target owns one bit, so a run of cells scores in one XOR.
        bit = {}
        for i, t in enumerate(self.circles + self.diamonds):
            bit[t] = 1 << i
        self.bit = bit
        self.plus = sum(bit[t] for t in self.circles)
        self.minus = sum(bit[t] for t in self.diamonds)
        n = self.n
        self.row_pref = [[0] * (n + 1) for _ in range(n)]
        self.col_pref = [[0] * (n + 1) for _ in range(n)]
        for r in range(n):
            for c in range(n):
                self.row_pref[r][c + 1] = self.row_pref[r][c] | bit.get((r, c), 0)
        for c in range(n):
            for r in range(n):
                self.col_pref[c][r + 1] = self.col_pref[c][r] | bit.get((r, c), 0)

        # reach[d][r][c] is the last axis coordinate a ray can get to.
        stop_at = set(self.diamonds) if args.diamond_stops else set()
        self.reach = [[[0] * n for _ in range(n)] for _ in range(4)]
        for d, (dr, dc) in enumerate(DIRS):
            for r in range(n):
                for c in range(n):
                    a, b = r, c
                    while True:
                        x, y = a + dr, b + dc
                        if not (0 <= x < n and 0 <= y < n) or (x, y) in self.walls:
                            break
                        a, b = x, y
                        if (a, b) in stop_at:
                            break
                    self.reach[d][r][c] = b if dr == 0 else a
        self.free = [[self.placeable(r, c) for c in range(n)] for r in range(n)]

    def placeable(self, r, c):
        if (r, c) in self.walls or (r, c) == self.source[:2]:
            return False
        return self.args.place_on_targets or (r, c) not in self.target_set

    def points(self, lit):
        good = bin(lit & self.plus).count("1")
        bad = bin(lit & self.minus).count("1")
        return good * self.circle_vals - bad * self.diamond_vals

    def trace(self, pieces):
        """Return (lit mask, segments, hit counts). Segment: (r, c, d, stop, ended)."""
        todo = [self.source]
        seen = set()
        lit = 0
        segs = []
        hits = {}
        items = list(pieces.items())
        while todo:
            state = todo.pop()
            if state in seen:
                continue
            seen.add(state)
            r, c, d = state
            stop = self.reach[d][r][c]
            found = None
            if d == 0:
                for key, val in items:
                    if key[0] == r and c < key[1] <= stop:
                        stop, found = key[1], (key, val)
                a, b = c, stop
            elif d == 2:
                for key, val in items:
                    if key[0] == r and stop <= key[1] < c:
                        stop, found = key[1], (key, val)
                a, b = stop, c
            elif d == 1:
                for key, val in items:
                    if key[1] == c and r < key[0] <= stop:
                        stop, found = key[0], (key, val)
                a, b = r, stop
            else:
                for key, val in items:
                    if key[1] == c and stop <= key[0] < r:
                        stop, found = key[0], (key, val)
                a, b = stop, r
            if d in (0, 2):
                lit |= self.row_pref[r][b + 1] ^ self.row_pref[r][a]
            else:
                lit |= self.col_pref[c][b + 1] ^ self.col_pref[c][a]
            segs.append((r, c, d, stop, found is None))
            if found:
                (pr, pc), (kind, orient) = found
                hits[(pr, pc)] = hits.get((pr, pc), 0) + 1
                todo.append((pr, pc, REFLECT[orient][d]))
                if kind == "S":
                    todo.append((pr, pc, d))
        return lit, segs, hits

    def fitness(self, lit, hits):
        if self.args.single_hit and any(v > 1 for v in hits.values()):
            return -1e6
        return self.points(lit) - 0.01 * len(hits)

    def counts(self, pieces):
        m = sum(1 for k, _ in pieces.values() if k == "M")
        return m, len(pieces) - m

    def perfect(self, lit):
        return self.points(lit) == len(self.circles) * self.circle_vals


def seg_cells(seg):
    """Cells of a segment, excluding its start."""
    r, c, d, stop, _ = seg
    dr, dc = DIRS[d]
    count = abs(stop - (c if dr == 0 else r))
    return [(r + dr * i, c + dc * i) for i in range(1, count + 1)]


def beam_search(b, width, deadline):
    """Grow the path from its open ends, keeping the best `width` boards per piece."""
    lit, segs, hits = b.trace({})
    best = ({}, b.fitness(lit, hits))
    front = [{}]
    keep = []
    for _ in range(b.mirrors + b.splitters):
        pool = {}
        for pieces in front:
            if time.time() > deadline:
                return best, keep
            used_m, used_s = b.counts(pieces)
            kinds = ("M" if used_m < b.mirrors else "") + ("S" if used_s < b.splitters else "")
            _, segs, _ = b.trace(pieces)
            for seg in segs:
                if not seg[4]:
                    continue
                for cell in seg_cells(seg):
                    if not b.free[cell[0]][cell[1]]:
                        continue
                    for kind in kinds:
                        for orient in "/\\":
                            new = dict(pieces)
                            new[cell] = (kind, orient)
                            key = frozenset(new.items())
                            if key in pool:
                                continue
                            lit, new_segs, hits = b.trace(new)
                            fit = b.fitness(lit, hits)
                            ends = tuple(sorted(s[:3] for s in new_segs if s[4]))
                            pool[key] = (fit, new, ends)
        if not pool:
            break
        ranked = sorted(pool.values(), key=lambda x: -x[0])
        if ranked[0][0] > best[1]:
            best = (ranked[0][1], ranked[0][0])
        # At most 3 boards per set of open ends, so setup moves with no gain survive.
        per_end = {}
        front = []
        for fit, new, ends in ranked:
            if per_end.get(ends, 0) < 3:
                per_end[ends] = per_end.get(ends, 0) + 1
                front.append(new)
                if len(front) >= width:
                    break
        keep += [(fit, new) for fit, new, _ in ranked[:5]]
    return best, keep


def turn_to(d, new_d):
    for orient in "/\\":
        if REFLECT[orient][d] == new_d:
            return orient
    return None


def propose(b, cur, segs, lit, rng):
    """Return a changed copy of `cur`, or None if the chosen move does not apply."""
    new = dict(cur)
    added = []
    roll = rng.random()
    missing = [t for t in b.circles if not lit & b.bit[t]]
    if roll < 0.55 and missing:
        # Aim at an unlit circle from a lit run, with one turn or with two.
        tr, tc = rng.choice(missing)
        order = segs[:]
        rng.shuffle(order)
        two_turns = roll > 0.40
        for seg in order:
            d = seg[2]
            cells = [c for c in seg_cells(seg) if b.free[c[0]][c[1]]]
            if not cells:
                continue
            if not two_turns:
                if d in (0, 2):
                    cells = [c for c in cells if c[1] == tc and c[0] != tr]
                else:
                    cells = [c for c in cells if c[0] == tr and c[1] != tc]
                if not cells:
                    continue
                r, c = cells[0]
                if d in (0, 2):
                    nd = 1 if tr > r else 3
                else:
                    nd = 0 if tc > c else 2
                kind = "S" if rng.random() < 0.3 else "M"
                new[(r, c)] = (kind, turn_to(d, nd))
                added.append((r, c))
                break
            r, c = rng.choice(cells)
            if d in (0, 2):
                corner = (tr, c)
                if tr == r or tc == c or not b.free[tr][c]:
                    continue
                nd = 1 if tr > r else 3
                last = 0 if tc > c else 2
            else:
                corner = (r, tc)
                if tc == c or tr == r or not b.free[r][tc]:
                    continue
                nd = 0 if tc > c else 2
                last = 1 if tr > r else 3
            new[(r, c)] = ("S" if rng.random() < 0.3 else "M", turn_to(d, nd))
            new[corner] = ("M", turn_to(nd, last))
            added += [(r, c), corner]
            break
        if not added:
            return None
    elif roll < 0.65 and cur:
        key = rng.choice(list(cur))
        kind, orient = cur[key]
        new[key] = (kind, "/" if orient == "\\" else "\\")
    elif roll < 0.75 and cur:
        key = rng.choice(list(cur))
        kind, orient = cur[key]
        new[key] = ("S" if kind == "M" else "M", orient)
    elif roll < 0.90 and cur:
        key = rng.choice(list(cur))
        dr, dc = rng.choice(DIRS)
        step = rng.randint(1, 3)
        moved = (key[0] + dr * step, key[1] + dc * step)
        if not (0 <= moved[0] < b.n and 0 <= moved[1] < b.n):
            return None
        if not b.free[moved[0]][moved[1]] or moved in new:
            return None
        new[moved] = new.pop(key)
        added.append(moved)
    elif roll < 0.95 and cur:
        del new[rng.choice(list(cur))]
    else:
        seg = rng.choice(segs)
        cells = [c for c in seg_cells(seg) if b.free[c[0]][c[1]]]
        if not cells:
            return None
        cell = rng.choice(cells)
        new[cell] = ("S" if rng.random() < 0.3 else "M", rng.choice("/\\"))
        added.append(cell)

    # Over budget: drop random pieces, never the ones just placed.
    for kind, limit in (("M", b.mirrors), ("S", b.splitters)):
        have = [k for k, v in new.items() if v[0] == kind]
        spare = [k for k in have if k not in added]
        rng.shuffle(spare)
        while len(have) > limit:
            if not spare:
                return None
            gone = spare.pop()
            del new[gone]
            have.remove(gone)
    return new


def anneal(b, start, deadline, rng, hot=1.2, cold=0.08):
    """Simulated annealing from `start` until `deadline`."""
    begin = time.time()
    span = max(deadline - begin, 1e-3)
    cur = dict(start)
    lit, segs, hits = b.trace(cur)
    cur = {k: v for k, v in cur.items() if k in hits}
    cur_fit = b.fitness(lit, hits)
    best, best_fit = dict(cur), cur_fit
    temp = hot
    steps = 0
    while True:
        steps += 1
        if steps % 128 == 0:
            now = time.time()
            if now >= deadline:
                break
            temp = hot * (cold / hot) ** ((now - begin) / span)
        new = propose(b, cur, segs, lit, rng)
        if new is None:
            continue
        new_lit, new_segs, new_hits = b.trace(new)
        fit = b.fitness(new_lit, new_hits)
        if fit >= cur_fit or rng.random() < math.exp((fit - cur_fit) / temp):
            cur = {k: v for k, v in new.items() if k in new_hits}
            lit, segs, cur_fit = new_lit, new_segs, fit
            if fit > best_fit:
                best, best_fit = dict(cur), fit
    return best, best_fit


def solve(b, limit, seed):
    rng = random.Random(seed)
    began = time.time()
    beam_end = began + limit * 0.4
    final_end = began + limit
    best, best_fit = {}, -1e9
    seeds = []
    width = 30
    while time.time() < beam_end:
        (pieces, fit), keep = beam_search(b, width, beam_end)
        seeds += keep
        if fit > best_fit:
            best, best_fit = pieces, fit
        if b.perfect(b.trace(best)[0]):
            return best, best_fit
        width *= 2
    seeds.sort(key=lambda x: -x[0])
    seeds = [s[1] for s in seeds[:12]] or [{}]
    rounds = 8
    for i in range(rounds):
        now = time.time()
        if now >= final_end:
            break
        chunk_end = now + (final_end - now) / (rounds - i)
        pieces, fit = anneal(b, best if i % 2 else seeds[i % len(seeds)], chunk_end, rng)
        if fit > best_fit:
            best, best_fit = pieces, fit
    return best, best_fit


def walk(b, pieces):
    """Cell-by-cell replay, independent of the bitmask scorer. Returns lit, marks, order."""
    n = b.n
    marks = {}
    lit = set()
    order = []
    stop_at = set(b.diamonds) if b.args.diamond_stops else set()
    todo = [b.source]
    seen = set()
    while todo:
        r, c, d = todo.pop(0)
        if (r, c, d) in seen:
            continue
        seen.add((r, c, d))
        dr, dc = DIRS[d]
        while True:
            x, y = r + dr, c + dc
            if not (0 <= x < n and 0 <= y < n) or (x, y) in b.walls:
                break
            r, c = x, y
            if (r, c) in b.target_set:
                lit.add((r, c))
            if (r, c) in pieces:
                if (r, c) not in order:
                    order.append((r, c))
                kind, orient = pieces[(r, c)]
                todo.append((r, c, REFLECT[orient][d]))
                if kind == "S":
                    todo.append((r, c, d))
                break
            sym = "-" if dr == 0 else "|"
            marks[(r, c)] = "+" if marks.get((r, c), sym) != sym else sym
            if (r, c) in stop_at:
                break
    return lit, marks, order


def report(b, pieces):
    lit, marks, order = walk(b, pieces)
    off = 1 if b.args.one_based else 0
    good = [t for t in b.circles if t in lit]
    bad = [t for t in b.diamonds if t in lit]
    score = len(good) * b.circle_vals - len(bad) * b.diamond_vals
    mask, _, _ = b.trace(pieces)
    if score != b.points(mask):
        sys.exit(f"Scorers disagree: replay {score}, bitmask {b.points(mask)}. Do not trust this result.")

    print(f"\nSCORE {score}   circles {len(good)}/{len(b.circles)}   "
          f"diamonds hit {len(bad)}/{len(b.diamonds)}")
    used_m, used_s = b.counts(pieces)
    print(f"Pieces used: {used_m}/{b.mirrors} mirrors, {used_s}/{b.splitters} splitters\n")
    print("Place these, in the order the beam reaches them (row, col):")
    for i, (r, c) in enumerate(order, 1):
        kind, orient = pieces[(r, c)]
        name = "MIRROR  " if kind == "M" else "SPLITTER"
        print(f"  {i:2d}. {r + off:2d}, {c + off:2d}   {name} {orient}")
    print("\nO lit circle, o missed, X hit diamond, x avoided, # wall, S splitter\n")
    n = b.n
    print("    " + "".join(str((c + off) // 10) for c in range(n)))
    print("    " + "".join(str((c + off) % 10) for c in range(n)))
    for r in range(n):
        row = ""
        for c in range(n):
            p = (r, c)
            if p == b.source[:2]:
                ch = ">v<^"[b.source[2]]
            elif p in pieces:
                ch = "S" if pieces[p][0] == "S" else pieces[p][1]
            elif p in b.walls:
                ch = "#"
            elif p in b.circles:
                ch = "O" if p in lit else "o"
            elif p in b.diamonds:
                ch = "X" if p in lit else "x"
            else:
                ch = marks.get(p, ".")
            row += ch
        print(f"{r + off:3d} {row}")


def main():
    ap = argparse.ArgumentParser(description="LUCIFER mirror and splitter solver")
    ap.add_argument("board", help="board description file")
    ap.add_argument("--time", type=float, default=30, help="seconds to search (default 30)")
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--one-based", action="store_true", help="board numbering starts at 1")
    ap.add_argument("--circle", type=int, default=1, help="points per circle")
    ap.add_argument("--diamond", type=int, default=1, help="penalty per diamond, as a positive number")
    ap.add_argument("--diamond-stops", action="store_true", help="a diamond also stops the beam")
    ap.add_argument("--place-on-targets", action="store_true", help="pieces may sit on circles and diamonds")
    ap.add_argument("--single-hit", action="store_true", help="forbid two beams using one piece")
    args = ap.parse_args()
    board = Board(args.board, args)
    pieces, _ = solve(board, args.time, args.seed)
    report(board, pieces)


if __name__ == "__main__":
    main()
