// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { Color } from "../../src/types";
import {
  type AiGame,
  drop,
  newGame,
  reset,
  RuleError,
} from "../../src/local/rules";
import { fixture } from "./wasm";

type Step = { reset: true } | { color: Color; column: number };
type Result =
  { skipped: true } | { error: string } | { state: Record<string, unknown> };

const scripts =
  fixture<Array<{ steps: Step[]; results: Result[] }>>("rules-parity.json");

function compact(game: AiGame) {
  return {
    board: game.board.map((row) =>
      row
        .map((cell) => (cell === "green" ? "g" : cell === "pink" ? "p" : "."))
        .join(""),
    ),
    history: game.history,
    turn: game.turn,
    status: game.status,
    winner: game.winner,
    winning_cells: game.winCells,
    result_reason: game.resultReason,
    revision: game.revision,
    series: game.series,
  };
}

describe("rules replay domain.py", () => {
  it.each(scripts.map((script, index) => [index, script] as const))(
    "script %i matches every recorded step",
    (_index, script) => {
      const game = newGame();
      script.steps.forEach((step, stepIndex) => {
        const expected = script.results[stepIndex];
        if ("reset" in step) {
          if ("skipped" in expected) {
            expect(game.status).not.toBe("finished");
            return;
          }
          reset(game);
        } else {
          try {
            drop(game, step.color, step.column);
          } catch (error) {
            expect(error).toBeInstanceOf(RuleError);
            expect(expected).toEqual({ error: (error as RuleError).code });
            return;
          }
        }
        expect(expected).toEqual({ state: compact(game) });
      });
    },
  );
});
