// Shared by Node and the browser page: time getAllMoveScores for "game moves" lines.
const CENTRE_FIRST = [3, 2, 4, 1, 5, 0, 6];

export function pickCentreFirst(scores) {
  let best = null;
  for (const c of CENTRE_FIRST) {
    const s = scores[c];
    if (s === null || s === undefined) continue;
    if (best === null || s > best[1]) best = [c, s];
  }
  return best ? best[0] : -1;
}

export function runBench(lib, lines, mode, now) {
  const solver = new lib.Solver();
  const out = [];
  let lastGame = null;
  for (const line of lines) {
    const space = line.indexOf(" ");
    const game = line.slice(0, space);
    const moves = line.slice(space + 1);
    if (mode === "cold" || game !== lastGame) {
      solver.reset();
      lastGame = game;
    }
    const pos = lib.Position.fromMoves(moves);
    const t = now();
    const scores = solver.getAllMoveScores(pos);
    const ms = now() - t;
    pos.free();
    out.push({ game, moves, ms, best: pickCentreFirst(scores), scores });
  }
  solver.free();
  return out;
}
