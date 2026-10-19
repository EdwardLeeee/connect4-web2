// Plays AI difficulty candidates against simple human proxies with connect-four-ai-wasm 1.0.0.
// usage: node sim.mjs <wasm package dir> <ai spec> <opponent> <ai seat 1|2> <games> <seed>
//   wasm package dir: frontend/node_modules/connect-four-ai-wasm after `npm --prefix frontend ci`
//   ai seat 1 means the AI moves first.
//   TIMING=warm logs every solve and caches nothing (one solver for all games, like the
//   server); TIMING=fresh also starts each game with a new solver (like a freshly opened app).
//   Without TIMING, exact scores are cached across games and only solves over 50 ms are logged.
// ai spec: best | soft:<T> (library softmax over normalised scores) | eps:<e> (random with
//          probability e, else best) | epsafe:<e> (like eps, but the random move never hands
//          the opponent an immediate win) | raw:<T> (softmax over raw scores)
//          tac:<e> (always wins in one and blocks a win in one, else like eps)
//          tacsafe:<e> (like tac, and the random move never hands over a win in one)
// opponent: random | novice | casual | <any ai spec>
// Prints one JSON line per game.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const [pkg, aiSpec, oppSpec, aiSeatArg, gamesArg, seedArg] = process.argv.slice(2);
const wasm = await import(pathToFileURL(join(pkg, "connect_four_ai_wasm.js")).href);
wasm.initSync({ module: readFileSync(join(pkg, "connect_four_ai_wasm_bg.wasm")) });
const { Solver, Position } = wasm;
let solver = new Solver();
const TIMING = process.env.TIMING;

const W = 7, H = 6;
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

// Plain grid for the proxies' one-move tactics: grid[c] lists the stones bottom-up.
const newGrid = () => Array.from({ length: W }, () => []);
const legal = (g) => [...Array(W).keys()].filter((c) => g[c].length < H);
function winsAt(g, c, p) {
  const r = g[c].length;
  if (r >= H) return false;
  const at = (cc, rr) => (cc === c && rr === r ? p : g[cc]?.[rr]);
  for (const [dc, dr] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
    let n = 1;
    for (const s of [1, -1]) {
      let cc = c + dc * s, rr = r + dr * s;
      while (cc >= 0 && cc < W && rr >= 0 && rr < H && at(cc, rr) === p) { n++; cc += dc * s; rr += dr * s; }
    }
    if (n >= 4) return true;
  }
  return false;
}
function handsOverWin(g, c, p) {
  g[c].push(p);
  const o = 3 - p;
  const bad = legal(g).some((cc) => winsAt(g, cc, o));
  g[c].pop();
  return bad;
}
const pick = (arr, u) => arr[Math.min(arr.length - 1, Math.floor(u * arr.length))];
function weighted(cols, weights, u) {
  const total = weights.reduce((a, b) => a + b, 0);
  let x = u * total;
  for (let i = 0; i < cols.length; i++) { x -= weights[i]; if (x < 0) return cols[i]; }
  return cols[cols.length - 1];
}

const cache = new Map();
let solveMs = [];
function scoresFor(pos, history) {
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
  const [kind, arg] = spec.split(":");
  const x = Number(arg);
  if (kind === "random") return (ctx) => pick(legal(ctx.g), ctx.rand());
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
  if (TIMING === "fresh") { solver.free(); solver = new Solver(); }
  const t0 = performance.now();
  for (let ply = 0; ply < W * H; ply++) {
    const me = (ply % 2) + 1;
    const player = me === aiSeat ? ai : opp;
    const c = player({ pos, g, history, me, rand });
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
  console.log(JSON.stringify({ ai: aiSpec, opp: oppSpec, aiSeat, result, plies: history.length, history, ms: Math.round(performance.now() - t0), slow }));
}
