// @vitest-environment node
import { describe, expect, it } from "vitest";
import { draw, mix, plannedMove } from "../../src/local/difficulty";
import type { Difficulty } from "../../src/types";
import { fixture } from "./wasm";

const recorded = fixture<{
  draws: Array<{ seed: string; history: string; salt: number; value: string }>;
  moves: Array<{
    difficulty: Difficulty;
    seed: string;
    history: string;
    column: number | null;
  }>;
}>("difficulty-parity.json");

describe("Easy and Normal pick like difficulty.py", () => {
  it("is SplitMix64", () => {
    // The first output of the reference SplitMix64 generator seeded with 0.
    expect(mix(0n)).toBe(0xe220a8397b1dcdafn);
  });

  it("draws the server's values", () => {
    expect(recorded.draws.length).toBeGreaterThan(0);
    for (const { seed, history, salt, value } of recorded.draws) {
      expect(String(draw(BigInt(seed), history, BigInt(salt)))).toBe(value);
    }
  });

  it("picks the server's column, or the best move, on every recorded position", () => {
    expect(recorded.moves.length).toBeGreaterThan(0);
    for (const { difficulty, seed, history, column } of recorded.moves) {
      expect(
        plannedMove(difficulty, BigInt(seed), history),
        `${difficulty} ${seed} ${history}`,
      ).toBe(column);
    }
  });
});
