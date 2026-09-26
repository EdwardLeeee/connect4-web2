// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

// Solving runs real WASM; under a busy full test run it can take far longer than 5 s.
vi.setConfig({ testTimeout: 60_000 });
import { AI_MIN_THINK_MS } from "../../src/local/constants";
import {
  type AiEngine,
  LocalGame,
  type Outgoing,
} from "../../src/local/localGame";
import { fixture, sharedEngine } from "./wasm";

type Action = { type: string; payload: Record<string, unknown> };
type Recording = {
  name: string;
  engine: "exact" | "failing";
  script: Action[];
  replies: Outgoing[][];
};

const recordings = fixture<Recording[]>("protocol-parity.json");
const session = { nickname: "Ada", locale: "zh-TW" as const };

function exactEngine(): AiEngine {
  const engine = sharedEngine();
  return {
    bestMove: async (history) => engine.bestMove(history),
    // The engine is shared across tests, so a game's dispose() must not free it.
    dispose: () => {},
  };
}

function failingEngine(): AiEngine {
  return {
    bestMove: () => Promise.reject(new Error("solver offline")),
    dispose: () => {},
  };
}

/** Lets the async replies, the engine and the zero-length think wait finish. */
async function settle(): Promise<void> {
  for (let round = 0; round < 5; round++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

/** The server's recordings drop the clock and the room id; so does this. */
function normalise(message: Outgoing): Outgoing {
  if (message.type !== "state.snapshot") return message;
  const { server_time: _time, ...payload } = structuredClone(message.payload);
  if (payload.room) payload.room.id = "<room>";
  return { type: message.type, payload } as unknown as Outgoing;
}

function harness(engine: () => AiEngine, overrides = {}) {
  const messages: Outgoing[] = [];
  const game = new LocalGame((message) => messages.push(message), {
    engine,
    session: () => session,
    sleep: () => Promise.resolve(),
    ...overrides,
  });
  return { game, messages };
}

describe("LocalGame speaks the server's AI protocol", () => {
  it.each(recordings.map((recording) => [recording.name, recording] as const))(
    "%s: every reply matches manager.py",
    async (_name, recording) => {
      const { game, messages } = harness(
        recording.engine === "exact" ? exactEngine : failingEngine,
      );
      for (const [index, action] of recording.script.entries()) {
        game.handle(action.type, action.payload);
        await settle();
        expect(
          messages.splice(0).map(normalise),
          `${action.type} #${index}`,
        ).toEqual(recording.replies[index]);
      }
    },
  );

  it("replies asynchronously, like the network", () => {
    const { game, messages } = harness(exactEngine);
    game.handle("state.request");
    expect(messages).toEqual([]);
  });

  it("waits at least the minimum think time after the player's move", async () => {
    let clock = 0;
    const sleep = vi.fn(() => Promise.resolve());
    const { game } = harness(exactEngine, { now: () => clock, sleep });
    game.handle("game.ai.start");
    await settle();
    clock = 100;
    game.handle("game.move", { column: 3 });
    await settle();
    expect(sleep).toHaveBeenCalledWith(AI_MIN_THINK_MS);

    sleep.mockClear();
    let answer!: (column: number) => void;
    const slow: AiEngine = {
      bestMove: () => new Promise((resolve) => (answer = resolve)),
      dispose: () => {},
    };
    const second = harness(() => slow, { now: () => clock, sleep });
    second.game.handle("game.ai.start");
    await settle();
    clock = 0;
    second.game.handle("game.move", { column: 3 });
    await settle();
    clock = AI_MIN_THINK_MS + 500;
    answer(3);
    await settle();
    expect(sleep).not.toHaveBeenCalled();
    expect(second.messages.at(-1)).toMatchObject({
      payload: { game: { history: "44", status: "playing" } },
    });
  });

  it("drops the AI's move when the player leaves while it thinks", async () => {
    let answer!: (column: number) => void;
    const dispose = vi.fn();
    const slow: AiEngine = {
      bestMove: () => new Promise((resolve) => (answer = resolve)),
      dispose,
    };
    const { game, messages } = harness(() => slow);
    game.handle("game.ai.start");
    game.handle("game.move", { column: 3 });
    await settle();
    game.handle("game.leave");
    await settle();
    answer(3);
    await settle();
    expect(dispose).toHaveBeenCalled();
    expect(messages.at(-1)).toMatchObject({
      payload: { room: null, game: null },
    });
    expect(game.serialize()).toBeNull();
  });

  it("restores a saved game and lets the AI finish the move it was thinking about", async () => {
    const first = harness(exactEngine);
    first.game.handle("game.ai.start");
    first.game.handle("game.move", { column: 3 });
    await settle();
    first.game.handle("game.move", { column: 2 });
    await settle();
    const saved = first.game.serialize()!;
    expect(saved.history).toHaveLength(4);
    expect(saved.failed).toBe(false);

    // Saved just after the player's move, before the AI answered.
    const restored = harness(exactEngine);
    restored.game.restore({ ...saved, history: saved.history.slice(0, 3) });
    await settle();
    expect(restored.messages.at(-1)).toMatchObject({
      payload: { game: { history: saved.history, status: "playing" } },
    });
  });

  it("restores a failed game as failed and ignores an unreadable save", async () => {
    const failed = harness(exactEngine);
    failed.game.restore({
      version: 1,
      roomId: "local-x",
      history: "4",
      series: { you: 1, opponent: 2, draws: 0 },
      revision: 7,
      failed: true,
    });
    await settle();
    expect(failed.messages.at(-1)).toMatchObject({
      payload: {
        room: { id: "local-x" },
        game: {
          status: "error",
          result_reason: "solver_unavailable",
          rematch_available: true,
          series: { you: 1, opponent: 2, draws: 0 },
        },
      },
    });

    const broken = harness(exactEngine);
    broken.game.restore({
      version: 1,
      roomId: "local-y",
      history: "1111111",
      series: { you: 0, opponent: 0, draws: 0 },
      revision: 3,
      failed: false,
    });
    await settle();
    expect(broken.game.serialize()).toBeNull();
    expect(broken.messages).toEqual([]);
  });
});
