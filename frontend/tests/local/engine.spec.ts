// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

// Solving runs real WASM; under a busy full test run it can take far longer than 5 s.
vi.setConfig({ testTimeout: 60_000 });
import { pickCentreFirst } from "../../src/local/engine";
import { fixture, realEngine, sharedEngine } from "./wasm";

const positions = fixture<
  Array<{
    history: string;
    scores: (number | null)[];
    column: number;
    in_table: boolean;
  }>
>("ai-parity.json");

describe("on-device engine", () => {
  it("breaks ties centre first, then left before right", () => {
    expect(pickCentreFirst([0, 0, 0, 0, 0, 0, 0])).toBe(3);
    expect(pickCentreFirst([null, null, 1, null, 1, null, null])).toBe(2);
    expect(pickCentreFirst([-2, 1, null, 0, 4, 4, -1])).toBe(4);
    expect(
      pickCentreFirst([null, null, null, null, null, null, null]),
    ).toBeNull();
  });

  it("matches the server's exact scores and column on every recorded position", () => {
    const engine = sharedEngine();
    for (const { history, scores, column } of positions) {
      expect(engine.scores(history)).toEqual(scores);
      expect(engine.bestMove(history)).toBe(column);
    }
  });

  it("solves live to the same answer without the table", () => {
    const engine = realEngine(false);
    const stored = positions.filter(
      ({ in_table, history }) => in_table && history.length === 13,
    );
    expect(stored.length).toBeGreaterThan(0);
    for (const { history, scores, column } of stored.slice(0, 5)) {
      expect(engine.scores(history)).toEqual(scores);
      expect(engine.bestMove(history)).toBe(column);
    }
    engine.dispose();
  });
});
