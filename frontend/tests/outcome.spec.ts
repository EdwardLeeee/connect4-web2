import { describe, expect, it } from "vitest";
import type { GameState } from "../src/types";
import { gameOutcome } from "../src/utils/outcome";

function finished(overrides: Partial<GameState>): GameState {
  return {
    revision: 12,
    status: "finished",
    board: Array.from({ length: 6 }, () => Array(7).fill(null)),
    history: "4455667",
    first: "green",
    turn: "green",
    you: "green",
    winner: "green",
    winning_cells: [],
    result_reason: "connect_four",
    players: {},
    rematch: { green: false, pink: false },
    rematch_requested: false,
    rematch_available: true,
    series: { you: 1, opponent: 0, draws: 0 },
    grace_deadline: null,
    ...overrides,
  };
}

describe("game outcome", () => {
  it("is empty until the game finishes", () => {
    expect(gameOutcome(finished({ status: "playing" }))).toBeNull();
    expect(gameOutcome(finished({ status: "paused" }))).toBeNull();
    expect(gameOutcome(finished({ status: "error" }))).toBeNull();
  });

  it("separates the six finished outcomes", () => {
    expect(gameOutcome(finished({}))).toBe("win");
    expect(gameOutcome(finished({ winner: "pink" }))).toBe("lose");
    expect(gameOutcome(finished({ winner: null, result_reason: "draw" }))).toBe(
      "draw",
    );
    expect(gameOutcome(finished({ result_reason: "forfeit" }))).toBe(
      "forfeitWin",
    );
    expect(
      gameOutcome(finished({ winner: "pink", result_reason: "forfeit" })),
    ).toBe("forfeitLose");
    expect(gameOutcome(finished({ result_reason: "left" }))).toBe("leftWin");
  });

  it("judges the result from the receiving player's colour", () => {
    expect(gameOutcome(finished({ you: "pink", winner: "pink" }))).toBe("win");
    expect(
      gameOutcome(
        finished({ you: "pink", winner: "green", result_reason: "forfeit" }),
      ),
    ).toBe("forfeitLose");
  });
});
