import json, random, sys, time
from connect4_app import _solver

ROWS, COLS = 6, 7
random.seed(20260926)

def board_of(moves):
    b = [[0] * COLS for _ in range(ROWS)]
    heights = [0] * COLS
    for i, ch in enumerate(moves):
        c = int(ch) - 1
        b[heights[c]][c] = 1 if i % 2 == 0 else 2
        heights[c] += 1
    return b, heights

def wins(b, player):
    for r in range(ROWS):
        for c in range(COLS):
            for dr, dc in ((0, 1), (1, 0), (1, 1), (1, -1)):
                ok = True
                for k in range(4):
                    rr, cc = r + dr * k, c + dc * k
                    if not (0 <= rr < ROWS and 0 <= cc < COLS) or b[rr][cc] != player:
                        ok = False; break
                if ok:
                    return True
    return False

def legal(moves):
    _, h = board_of(moves)
    return [c for c in range(COLS) if h[c] < ROWS]

def makes_win(moves, c):
    nxt = moves + str(c + 1)
    b, _ = board_of(nxt)
    return wins(b, 1 if len(moves) % 2 == 0 else 2)

def hands_win(moves, c):
    nxt = moves + str(c + 1)
    return any(makes_win(nxt, d) for d in legal(nxt))

random_positions = []
for length in range(8, 17):
    got = 0
    while got < 150:
        moves = ""
        ok = True
        while len(moves) < length:
            options = [c for c in legal(moves) if not makes_win(moves, c)]
            if not options:
                ok = False; break
            moves += str(random.choice(options) + 1)
        if ok and not any(makes_win(moves, c) for c in legal(moves)) is None:
            pass
        if ok:
            random_positions.append(("r", moves)); got += 1

games = []
t0 = time.time()
while len(games) < 200:
    moves = ""
    seq = []
    while len(moves) < 17:
        options = legal(moves)
        if not options:
            break
        if len(moves) % 2 == 0:  # human (green)
            winning = [c for c in options if makes_win(moves, c)]
            if winning and random.random() < 0.8:
                c = winning[0]
            elif random.random() < 0.4:
                c = int(_solver.best_move(moves))
            else:
                safe = [c for c in options if not hands_win(moves, c)] or options
                c = random.choice(safe)
        else:  # Super AI (pink) solves this position
            seq.append(moves)
            c = int(_solver.best_move(moves))
        if makes_win(moves, c):
            break
        moves += str(c + 1)
    games.append(seq)
print(f"generated {len(games)} app-like games in {time.time() - t0:.1f}s", file=sys.stderr)

with open(sys.argv[1], "w") as cold:
    for tag, m in random_positions:
        cold.write(f"{tag} {m}\n")
    for gi, seq in enumerate(games):
        for m in seq:
            if 8 <= len(m) <= 16:
                cold.write(f"g{gi} {m}\n")
with open(sys.argv[2], "w") as warm:
    for gi, seq in enumerate(games):
        for m in seq:
            warm.write(f"g{gi} {m}\n")
