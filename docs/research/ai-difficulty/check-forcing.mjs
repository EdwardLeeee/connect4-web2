// Checks tactics.mjs against the exact solver on random positions: forcingMove(p, d) must
// find a move exactly when the scores say p can connect four within d of its own moves, and
// every mistake column must leave the opponent a win with exactly its second move.
// usage: node check-forcing.mjs <wasm package dir> <positions>
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { forcingMove, isMistake, legal, newGrid, winsAt } from "./tactics.mjs";

const [pkg, countArg] = process.argv.slice(2);
const wasm = await import(pathToFileURL(join(pkg, "connect_four_ai_wasm.js")).href);
wasm.initSync({ module: readFileSync(join(pkg, "connect_four_ai_wasm_bg.wasm")) });
const solver = new wasm.Solver();

let seed = 12345;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const agree = { 1: 0, 2: 0, 3: 0 }, disagree = { 1: 0, 2: 0, 3: 0 };
let mistakesChecked = 0, mistakesWrong = 0;
for (let i = 0; i < Number(countArg); i++) {
  const target = 12 + Math.floor(rand() * 20);
  const g = newGrid();
  const pos = new wasm.Position();
  let n = 0, ended = false;
  while (n < target) {
    const cols = legal(g);
    const c = cols[Math.floor(rand() * cols.length)];
    if (pos.isWinningMove(c)) { ended = true; break; }
    pos.play(c); g[c].push((n % 2) + 1); n++;
  }
  if (ended || legal(g).length === 0) { pos.free(); continue; }
  const p = (n % 2) + 1;
  const scores = Array.from(solver.getAllMoveScores(pos), (x) => (typeof x === "number" ? x : null));
  const max = Math.max(...scores.filter((x) => x !== null));
  // A win with the k-th own move from now scores floor((43 - n) / 2) - (k - 1).
  const k = max > 0 ? Math.floor((43 - n) / 2) - max + 1 : Infinity;
  for (const d of [1, 2, 3]) {
    if ((forcingMove(g, p, d) !== undefined) === k <= d) agree[d]++; else disagree[d]++;
  }
  if (!legal(g).some((c) => winsAt(g, c, p) || winsAt(g, c, 3 - p))) {
    for (const c of legal(g)) {
      if (!isMistake(g, c, p, 2)) continue;
      mistakesChecked++;
      // The opponent, with n + 1 stones on the board, wins with its k-th move.
      const kOpponent = Math.floor((43 - (n + 1)) / 2) + scores[c] + 1;
      if (!(scores[c] < 0 && kOpponent === 2)) mistakesWrong++;
    }
  }
  pos.free();
}
console.log(JSON.stringify({ agree, disagree, mistakesChecked, mistakesWrong }));
