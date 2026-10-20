// Plays AI difficulty candidates against simple human proxies with connect-four-ai-wasm 1.0.0.
// usage: node sim.mjs <wasm package dir> <ai spec> <opponent> <ai seat 1|2> <games> <seed>
//   wasm package dir: frontend/node_modules/connect-four-ai-wasm after `npm --prefix frontend ci`
//   ai seat 1 means the AI moves first.
//   TIMING=warm logs every solve and caches nothing (one solver for all games, like the
//   server); TIMING=fresh also starts each game with a new solver (like a freshly opened app).
//   Without TIMING, exact scores are cached across games and only solves over 50 ms are logged.
//   TABLE=<reply-table.bin> answers the positions it holds from the reply table first, as the
//   server and the app do; those lookups are not logged as solves.
// ai spec: best | soft:<T> (library softmax over normalised scores) | eps:<e> (random with
//          probability e, else best) | epsafe:<e> (like eps, but the random move never hands
//          the opponent an immediate win) | raw:<T> (softmax over raw scores)
//          tac:<e> (always wins in one and blocks a win in one, else like eps)
//          tacsafe:<e> (like tac, and the random move never hands over a win in one)
//          near<rule>:<e>:<k> (always wins in one and blocks a win in one; otherwise with
//          probability e a random move among the "near" ones, else best). Near moves:
//            nearlit: a draw or a small loss, -k <= score <= 0 (never a win)
//            nearabs: score >= -k (a win, a draw or a small loss)
//            nearrel: score >= best score - k
//          When no move is near, it plays the best move.
//          forced:<N>:<p>:<d> (the exact best move while fewer than N stones are on the board;
//          then always wins in one and blocks a win in one; otherwise with probability p a
//          deliberate mistake: a random column after which the opponent cannot win at once but
//          can force a win within d of its own moves, found by a short tactical search, not
//          the solver; when no column qualifies, or otherwise, the best move)
// opponent: random | novice | casual | sharp (casual, and also plays a move that forces a win
//          within 2 of its own moves when it has one) | <any ai spec>
// Prints one JSON line per game.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { forcingMove, H, handsOverWin, isMistake, legal, newGrid, W, winsAt } from "./tactics.mjs";

const [pkg, aiSpec, oppSpec, aiSeatArg, gamesArg, seedArg] = process.argv.slice(2);
const wasm = await import(pathToFileURL(join(pkg, "connect_four_ai_wasm.js")).href);
wasm.initSync({ module: readFileSync(join(pkg, "connect_four_ai_wasm_bg.wasm")) });
const { Solver, Position } = wasm;
let solver = new Solver();
const TIMING = process.env.TIMING;

const CENTRE_FIRST = [3, 2, 4, 1, 5, 0, 6];
const CENTRE_WEIGHT = [1, 2, 3, 4, 3, 2, 1];

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = (arr, u) => arr[Math.min(arr.length - 1, Math.floor(u * arr.length))];
function weighted(cols, weights, u) {
  const total = weights.reduce((a, b) => a + b, 0);
  let x = u * total;
  for (let i = 0; i < cols.length; i++) { x -= weights[i]; if (x < 0) return cols[i]; }
  return cols[cols.length - 1];
}

// The reply table (native_solver/src/reply_table.rs), keyed like frontend/src/local/replyTable.ts.
const TABLE = process.env.TABLE ? loadTable(process.env.TABLE) : null;
function loadTable(path) {
  const bytes = readFileSync(path);
  const count = bytes.readUInt32LE(8);
  const table = new Map();
  for (let i = 0; i < count; i++) {
    const offset = 16 + 15 * i;
    table.set(bytes.readBigUInt64LE(offset), Array.from(bytes.subarray(offset + 8, offset + 15), (b) => (b === 128 ? null : b > 127 ? b - 256 : b)));
  }
  return table;
}
function tableScores(history) {
  let position = 0n, mask = 0n;
  for (const move of history) {
    position ^= mask;
    mask |= mask + (1n << (BigInt(Number(move) - 1) * 7n));
  }
  let mp = 0n, mm = 0n;
  for (let c = 0; c < W; c++) {
    const column = ((1n << 6n) - 1n) << (BigInt(c) * 7n);
    const shift = BigInt(W - 1 - 2 * c) * 7n;
    const move = (bits) => (shift >= 0n ? bits << shift : bits >> -shift);
    mp |= move(position & column);
    mm |= move(mask & column);
  }
  const own = position + mask, mirrored = mp + mm;
  const key = own < mirrored ? own : mirrored;
  const stored = TABLE.get(key);
  if (!stored) return null;
  return own === key ? stored : [...stored].reverse();
}

const cache = new Map();
let solveMs = [];
let tableHits = 0;
function scoresFor(pos, history) {
  if (TABLE) {
    const stored = tableScores(history);
    if (stored) { tableHits++; return stored; }
  }
  const key = `${pos.position}:${pos.mask}`;
  let s = TIMING ? undefined : cache.get(key);
  if (!s) {
    const t = performance.now();
    s = solver.getAllMoveScores(pos).map((x) => (typeof x === "number" ? x : null));
    solveMs.push({ ply: history.length, ms: performance.now() - t });
    if (!TIMING) cache.set(key, s);
  }
  return s;
}
function best(scores) {
  let b = null;
  for (const c of CENTRE_FIRST) if (scores[c] !== null && (b === null || scores[c] > scores[b])) b = c;
  return b;
}

function makePlayer(spec) {
  const [kind, arg, arg2, arg3] = spec.split(":");
  const x = Number(arg);
  if (kind === "random") return (ctx) => pick(legal(ctx.g), ctx.rand());
  if (kind === "sharp") {
    return (ctx) => {
      const cols = legal(ctx.g);
      const win = cols.find((c) => winsAt(ctx.g, c, ctx.me));
      if (win !== undefined) return win;
      const block = cols.find((c) => winsAt(ctx.g, c, 3 - ctx.me));
      if (block !== undefined) return block;
      // A forcing move never hands over a win: the reply would refute it.
      const forcing = forcingMove(ctx.g, ctx.me, 2);
      if (forcing !== undefined) return forcing;
      const safe = cols.filter((c) => !handsOverWin(ctx.g, c, ctx.me));
      const pool = safe.length ? safe : cols;
      return weighted(pool, pool.map((c) => CENTRE_WEIGHT[c]), ctx.rand());
    };
  }
  if (kind === "forced") {
    const opening = x, p = Number(arg2), d = Number(arg3);
    return (ctx) => {
      if (ctx.history.length < opening) return best(scoresFor(ctx.pos, ctx.history));
      const cols = legal(ctx.g);
      const win = cols.find((c) => winsAt(ctx.g, c, ctx.me));
      if (win !== undefined) return win;
      const block = cols.find((c) => winsAt(ctx.g, c, 3 - ctx.me));
      if (block !== undefined) return block;
      if (ctx.rand() < p) {
        const t = performance.now();
        const mistakes = cols.filter((c) => isMistake(ctx.g, c, ctx.me, d));
        ctx.stats.tacticsMs = Math.max(ctx.stats.tacticsMs, performance.now() - t);
        if (mistakes.length) {
          const c = pick(mistakes, ctx.rand());
          ctx.stats.mistakes++;
          if (!TIMING) {
            // Only for the record: did the mistake turn a game it was not losing into a loss?
            const scores = scoresFor(ctx.pos, ctx.history);
            if (scores[best(scores)] >= 0 && scores[c] < 0) ctx.stats.thrown++;
          }
          return c;
        }
        ctx.stats.noMistake++;
      }
      return best(scoresFor(ctx.pos, ctx.history));
    };
  }
  if (kind === "novice" || kind === "casual") {
    return (ctx) => {
      const cols = legal(ctx.g);
      const win = cols.find((c) => winsAt(ctx.g, c, ctx.me));
      if (win !== undefined) return win;
      const block = cols.find((c) => winsAt(ctx.g, c, 3 - ctx.me));
      if (block !== undefined) return block;
      if (kind === "novice") return pick(cols, ctx.rand());
      const safe = cols.filter((c) => !handsOverWin(ctx.g, c, ctx.me));
      const pool = safe.length ? safe : cols;
      return weighted(pool, pool.map((c) => CENTRE_WEIGHT[c]), ctx.rand());
    };
  }
  if (kind === "best") return (ctx) => best(scoresFor(ctx.pos, ctx.history));
  if (kind === "tac" || kind === "tacsafe") {
    // Always takes a win in one and blocks the opponent's win in one; otherwise random with
    // probability x, else the exact best move.
    return (ctx) => {
      const cols = legal(ctx.g);
      const win = cols.find((c) => winsAt(ctx.g, c, ctx.me));
      if (win !== undefined) return win;
      const block = cols.find((c) => winsAt(ctx.g, c, 3 - ctx.me));
      if (block !== undefined) return block;
      if (ctx.rand() < x) {
        if (kind === "tac") return pick(cols, ctx.rand());
        const safe = cols.filter((c) => !handsOverWin(ctx.g, c, ctx.me));
        return pick(safe.length ? safe : cols, ctx.rand());
      }
      return best(scoresFor(ctx.pos, ctx.history));
    };
  }
  if (kind === "nearlit" || kind === "nearabs" || kind === "nearrel") {
    const k = Number(arg2);
    return (ctx) => {
      const cols = legal(ctx.g);
      const win = cols.find((c) => winsAt(ctx.g, c, ctx.me));
      if (win !== undefined) return win;
      const block = cols.find((c) => winsAt(ctx.g, c, 3 - ctx.me));
      if (block !== undefined) return block;
      const scores = scoresFor(ctx.pos, ctx.history);
      if (ctx.rand() < x) {
        const open = [...Array(W).keys()].filter((c) => scores[c] !== null);
        const top = Math.max(...open.map((c) => scores[c]));
        const near = open.filter((c) =>
          kind === "nearlit" ? scores[c] >= -k && scores[c] <= 0
          : kind === "nearabs" ? scores[c] >= -k
          : scores[c] >= top - k);
        if (near.length) return pick(near, ctx.rand());
      }
      return best(scores);
    };
  }
  if (kind === "eps" || kind === "epsafe") {
    return (ctx) => {
      if (ctx.rand() < x) {
        const cols = legal(ctx.g);
        if (kind === "eps") return pick(cols, ctx.rand());
        const safe = cols.filter((c) => !handsOverWin(ctx.g, c, ctx.me));
        return pick(safe.length ? safe : cols, ctx.rand());
      }
      return best(scoresFor(ctx.pos, ctx.history));
    };
  }
  if (kind === "soft" || kind === "raw") {
    return (ctx) => {
      const scores = scoresFor(ctx.pos, ctx.history);
      const moves = ctx.history.length;
      const maxPossible = Math.trunc((W * H + 1 - moves) / 2);
      const cols = [...Array(W).keys()].filter((c) => scores[c] !== null);
      const values = cols.map((c) => (kind === "soft" ? scores[c] / maxPossible : scores[c]) / x);
      // Subtracting the largest exponent keeps exp() finite without changing the distribution.
      const top = Math.max(...values);
      return weighted(cols, values.map((v) => Math.exp(v - top)), ctx.rand());
    };
  }
  throw new Error(`unknown player ${spec}`);
}

const ai = makePlayer(aiSpec);
const opp = makePlayer(oppSpec);
const aiSeat = Number(aiSeatArg);
const games = Number(gamesArg);
const rand = mulberry32(Number(seedArg));

for (let n = 0; n < games; n++) {
  const pos = new Position();
  const g = newGrid();
  let history = "";
  let winner = 0;
  solveMs = [];
  tableHits = 0;
  const stats = { mistakes: 0, thrown: 0, noMistake: 0, tacticsMs: 0 };
  if (TIMING === "fresh") { solver.free(); solver = new Solver(); }
  const t0 = performance.now();
  for (let ply = 0; ply < W * H; ply++) {
    const me = (ply % 2) + 1;
    const player = me === aiSeat ? ai : opp;
    const c = player({ pos, g, history, me, rand, stats: me === aiSeat ? stats : { mistakes: 0, thrown: 0, noMistake: 0, tacticsMs: 0 } });
    if (!pos.isPlayable(c)) throw new Error(`illegal ${c} after ${history}`);
    const won = pos.isWinningMove(c);
    pos.play(c); g[c].push(me); history += String(c + 1);
    if (won) { winner = me; break; }
  }
  pos.free();
  const result = winner === 0 ? "draw" : winner === aiSeat ? "ai" : "opp";
  const slow = TIMING
    ? solveMs.map((s) => [s.ply, Math.round(s.ms * 10) / 10])
    : solveMs.filter((s) => s.ms > 50).map((s) => [s.ply, Math.round(s.ms)]);
  stats.tacticsMs = Math.round(stats.tacticsMs * 10) / 10;
  console.log(JSON.stringify({ ai: aiSpec, opp: oppSpec, aiSeat, result, plies: history.length, history, ms: Math.round(performance.now() - t0), slow, tableHits, ...stats }));
}
