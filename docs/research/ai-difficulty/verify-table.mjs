// Independent check of a regenerated reply table with connect-four-ai-wasm 1.0.0.
// usage: node verify-table.mjs <wasm pkg> <new table> <old table> <worker> <workers> <keys out>
// Worker 0 also checks that every entry of the old table is in the new one unchanged.
// Each worker replays the Super AI moving first (exact scores, centre-first ties) against
// every human reply, for its share of the positions after 8 moves, and requires every
// position the AI faces after 8, 10 and 12 moves to be in the table with the live scores.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const [pkg, newPath, oldPath, workerArg, workersArg, keysOut] = process.argv.slice(2);
const worker = Number(workerArg);
const workers = Number(workersArg);
const wasm = await import(pathToFileURL(join(pkg, "connect_four_ai_wasm.js")).href);
wasm.initSync({ module: readFileSync(join(pkg, "connect_four_ai_wasm_bg.wasm")) });
const solver = new wasm.Solver();
const ROWS = 6, COLUMNS = 7, BITS = 7n;
const CENTRE_FIRST = [3, 2, 4, 1, 5, 0, 6];
const TABLE_MOVES = new Set([8, 10, 12]);

function entries(path) {
  const bytes = readFileSync(path);
  if (bytes.subarray(0, 4).toString() !== "C4RT") throw new Error(`${path}: bad magic`);
  const count = bytes.readUInt32LE(8);
  if (bytes.length !== 16 + 15 * count) throw new Error(`${path}: bad length`);
  const map = new Map();
  let previous = -1n;
  for (let i = 0; i < count; i++) {
    const offset = 16 + 15 * i;
    const key = bytes.readBigUInt64LE(offset);
    if (key <= previous) throw new Error(`${path}: keys not increasing at ${i}`);
    previous = key;
    map.set(key, Array.from(bytes.subarray(offset + 8, offset + 15), (b) => {
      const s = b > 127 ? b - 256 : b;
      return s === -128 ? null : s;
    }));
  }
  return map;
}

function keys(history) {
  let position = 0n, mask = 0n;
  for (const move of history) {
    position ^= mask;
    mask |= mask + (1n << (BigInt(Number(move) - 1) * BITS));
  }
  const colMask = (c) => ((1n << BigInt(ROWS)) - 1n) << (BigInt(c) * BITS);
  let mp = 0n, mm = 0n;
  for (let c = 0; c < COLUMNS; c++) {
    const shift = BigInt(COLUMNS - 1 - 2 * c) * BITS;
    const move = (bits) => (shift >= 0n ? bits << shift : bits >> -shift);
    mp |= move(position & colMask(c));
    mm |= move(mask & colMask(c));
  }
  const own = position + mask, mirrored = mp + mm;
  return { key: own < mirrored ? own : mirrored, own };
}

function live(history) {
  const p = new wasm.Position();
  for (const c of history) p.play(Number(c) - 1);
  const s = Array.from(solver.getAllMoveScores(p), (x) => (typeof x === "number" ? x : null));
  p.free();
  return s;
}

function best(scores) {
  let b = null;
  for (const c of CENTRE_FIRST) if (scores[c] !== null && (b === null || scores[c] > scores[b])) b = c;
  return b;
}

function wins(history, column) {
  const p = new wasm.Position();
  for (const c of history) p.play(Number(c) - 1);
  const won = p.isWinningMove(column);
  p.free();
  return won;
}

const table = entries(newPath);
if (worker === 0) {
  const old = entries(oldPath);
  let changed = 0;
  for (const [key, scores] of old) {
    const now = table.get(key);
    if (!now || now.join() !== scores.join()) changed++;
  }
  console.log(`old entries ${old.size}, new entries ${table.size}, added ${table.size - old.size}, old entries changed or missing ${changed}`);
}

const seen = new Set();
const looked = new Set();
let aiTurn = [""];
let checked = 0, missing = 0, wrong = 0;
for (let moves = 0; moves <= 12; moves += 2) {
  const humanTurn = [];
  for (const history of aiTurn) {
    const scores = live(history);
    if (TABLE_MOVES.has(moves)) {
      const { key, own } = keys(history);
      looked.add(key.toString());
      const stored = table.get(key);
      checked++;
      if (!stored) missing++;
      else {
        const oriented = own === key ? stored : [...stored].reverse();
        if (oriented.join() !== scores.join()) wrong++;
      }
    }
    if (moves === 12) continue;
    const column = best(scores);
    if (wins(history, column)) continue;
    humanTurn.push(history + String(column + 1));
  }
  const next = [];
  for (const history of humanTurn) {
    for (let c = 0; c < COLUMNS; c++) {
      if ([...history].filter((x) => x === String(c + 1)).length >= ROWS) continue;
      if (wins(history, c)) continue;
      const child = history + String(c + 1);
      const own = keys(child).own.toString();
      if (seen.has(own)) continue;
      seen.add(own);
      next.push(child);
    }
  }
  // Split the work once, at the positions after 8 moves.
  aiTurn = moves + 2 === 8 ? next.filter((_, index) => index % workers === worker) : next;
}
writeFileSync(keysOut, [...looked].join("\n") + "\n");
console.log(`worker ${worker}: checked ${checked} positions, missing ${missing}, wrong scores ${wrong}`);
