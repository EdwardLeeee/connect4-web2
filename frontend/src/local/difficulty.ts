// A line-by-line port of backend/connect4_app/difficulty.py: when the Easy and Normal AIs
// pick a column themselves instead of the exact best move. Draws use BigInt so they equal
// the server's 64-bit integers; tests/local/difficulty.spec.ts replays the server's picks.
import type { Difficulty } from "../types";
import {
  COLUMNS,
  EASY_RANDOM_PERCENT,
  NORMAL_RANDOM_IS_SAFE,
  NORMAL_RANDOM_PERCENT,
  ROWS,
} from "./constants";

export const DIFFICULTIES: readonly Difficulty[] = ["easy", "normal", "super"];

/** The salts of the two draws a move can make. */
const RANDOM_OR_BEST = 1n;
const WHICH_COLUMN = 2n;
const MASK = (1n << 64n) - 1n;

/** One SplitMix64 step. */
export function mix(value: bigint): bigint {
  value = (value + 0x9e3779b97f4a7c15n) & MASK;
  value = ((value ^ (value >> 30n)) * 0xbf58476d1ce4e5b9n) & MASK;
  value = ((value ^ (value >> 27n)) * 0x94d049bb133111ebn) & MASK;
  return value ^ (value >> 31n);
}

/** A 64-bit value fixed by the game's seed, the moves so far and the salt. */
export function draw(seed: bigint, history: string, salt: bigint): bigint {
  let value = seed & MASK;
  for (const move of history) value = mix(value ^ BigInt(move.charCodeAt(0)));
  return mix(value ^ salt);
}

/** The column this level plays without the engine, or null for the exact best move. */
export function plannedMove(
  difficulty: Difficulty,
  seed: bigint,
  history: string,
): number | null {
  if (difficulty === "super") return null;
  const stacks = stones(history);
  const player = history.length % 2;
  const legal = [...Array(COLUMNS).keys()].filter(
    (column) => stacks[column].length < ROWS,
  );
  let percent = EASY_RANDOM_PERCENT;
  if (difficulty === "normal") {
    // Its own win first, then the opponent's.
    for (const target of [player, 1 - player]) {
      for (const column of legal) {
        if (connectsFour(stacks, column, target)) return column;
      }
    }
    percent = NORMAL_RANDOM_PERCENT;
  }
  if (draw(seed, history, RANDOM_OR_BEST) % 100n >= BigInt(percent))
    return null;
  let candidates = legal;
  if (difficulty === "normal" && NORMAL_RANDOM_IS_SAFE) {
    const safe = legal.filter(
      (column) => !handsOverWin(stacks, column, player),
    );
    if (safe.length) candidates = safe;
  }
  const index = draw(seed, history, WHICH_COLUMN) % BigInt(candidates.length);
  return candidates[Number(index)];
}

/** Each column's stones from the bottom up: 0 for the first mover, 1 for the other. */
function stones(history: string): number[][] {
  const stacks: number[][] = Array.from({ length: COLUMNS }, () => []);
  for (let index = 0; index < history.length; index++) {
    stacks[Number(history[index]) - 1].push(index % 2);
  }
  return stacks;
}

/** Whether `player` connects four by dropping into the open `column`. */
function connectsFour(
  stacks: number[][],
  column: number,
  player: number,
): boolean {
  const row = stacks[column].length;
  const owner = (targetColumn: number, targetRow: number) =>
    targetColumn >= 0 && targetColumn < COLUMNS
      ? stacks[targetColumn][targetRow]
      : undefined;
  for (const [deltaColumn, deltaRow] of [
    [1, 0],
    [0, 1],
    [1, 1],
    [1, -1],
  ]) {
    let count = 1;
    for (const sign of [1, -1]) {
      let targetColumn = column + deltaColumn * sign;
      let targetRow = row + deltaRow * sign;
      while (owner(targetColumn, targetRow) === player) {
        count += 1;
        targetColumn += deltaColumn * sign;
        targetRow += deltaRow * sign;
      }
    }
    if (count >= 4) return true;
  }
  return false;
}

/** Whether dropping into `column` lets the opponent connect four with their next move. */
function handsOverWin(
  stacks: number[][],
  column: number,
  player: number,
): boolean {
  stacks[column].push(player);
  try {
    return stacks.some(
      (stack, target) =>
        stack.length < ROWS && connectsFour(stacks, target, 1 - player),
    );
  } finally {
    stacks[column].pop();
  }
}
