// The plain-grid tactics sim.mjs and check-forcing.mjs share. A grid lists each column's
// stones bottom-up; players are 1 and 2. The server's backend/connect4_app/difficulty.py and
// the app's frontend/src/local/difficulty.ts implement the same search for Normal's mistakes.
export const W = 7, H = 6;

// Plain grid for the proxies' one-move tactics: grid[c] lists the stones bottom-up.
export const newGrid = () => Array.from({ length: W }, () => []);
export const legal = (g) => [...Array(W).keys()].filter((c) => g[c].length < H);
export function winsAt(g, c, p) {
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
export function handsOverWin(g, c, p) {
  g[c].push(p);
  const o = 3 - p;
  const bad = legal(g).some((cc) => winsAt(g, cc, o));
  g[c].pop();
  return bad;
}
// Whether `p`, to move, can force a connect four within `d` of its own moves whatever the
// other side replies; the other side's own connect four refutes a line. Returns the first
// such move, or undefined.
export function forcingMove(g, p, d) {
  const cols = legal(g);
  for (const c of cols) if (winsAt(g, c, p)) return c;
  if (d <= 1) return undefined;
  const q = 3 - p;
  for (const c of cols) {
    g[c].push(p);
    const replies = legal(g);
    let forced = replies.length > 0 && !replies.some((r) => winsAt(g, r, q));
    for (let i = 0; forced && i < replies.length; i++) {
      g[replies[i]].push(q);
      forced = forcingMove(g, p, d - 1) !== undefined;
      g[replies[i]].pop();
    }
    g[c].pop();
    if (forced) return c;
  }
  return undefined;
}
// A deliberate mistake for `me`: the opponent cannot win at once, but can force a win within d.
export function isMistake(g, c, me, d) {
  g[c].push(me);
  const o = 3 - me;
  const ok = !legal(g).some((cc) => winsAt(g, cc, o)) && forcingMove(g, o, d) !== undefined;
  g[c].pop();
  return ok;
}

