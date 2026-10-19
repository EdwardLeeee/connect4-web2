// Counts the positions a deterministic Super AI that moves first can face after 8 moves:
// its own moves come from exact scores (centre-first ties), the opponent's are all moves.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
const pkg = process.argv[2];
const wasm = await import(pathToFileURL(join(pkg, "connect_four_ai_wasm.js")).href);
wasm.initSync({ module: readFileSync(join(pkg, "connect_four_ai_wasm_bg.wasm")) });
const solver = new wasm.Solver();
const CENTRE_FIRST = [3, 2, 4, 1, 5, 0, 6];
function bestColumn(history) {
  const p = new wasm.Position(); for (const c of history) p.play(Number(c) - 1);
  const s = Array.from(solver.getAllMoveScores(p));
  p.free();
  let b = null;
  for (const c of CENTRE_FIRST) if (typeof s[c] === "number" && (b === null || s[c] > s[b])) b = c;
  return b;
}
function wonAfter(history) {
  const p = new wasm.Position(); let won = false;
  for (const c of history) { if (p.isWinningMove(Number(c) - 1)) won = true; p.play(Number(c) - 1); }
  p.free(); return won;
}
let aiTurn = [""];
const t0 = performance.now();
for (let moves = 0; moves < 8; moves += 2) {
  const next = new Map();
  for (const h of aiTurn) {
    const h1 = h + String(bestColumn(h) + 1);
    if (wonAfter(h1)) continue;
    for (let c = 1; c <= 7; c++) {
      const h2 = h1 + c;
      if ([...h2].filter((x) => x === String(c)).length > 6 || wonAfter(h2)) continue;
      // Same position, same key: the history order does not matter.
      const p = new wasm.Position(); for (const x of h2) p.play(Number(x) - 1);
      const key = `${p.position}:${p.mask}`; p.free();
      if (!next.has(key)) next.set(key, h2);
    }
  }
  aiTurn = [...next.values()];
  console.log(`AI to move after ${moves + 2} moves: ${aiTurn.length} positions (${Math.round(performance.now() - t0)} ms)`);
}
