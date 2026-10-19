// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

// Solving runs real WASM; under a busy full test run it can take far longer than 5 s.
vi.setConfig({ testTimeout: 60_000 });
import { AI_MIN_THINK_MS } from "../../src/local/constants";
import {
  type AiEngine,
  LocalGame,
  type Outgoing,
  type SavedGame,
} from "../../src/local/localGame";
import { fixture, sharedEngine } from "./wasm";

type Action = { type: string; payload: Record<string, unknown> };
type Recording = {
  name: string;
  engine: "exact" | "failing";
  /** Every game seed the server drew, in order, as decimal strings. */
  seeds: string[];
  script: Action[];
  replies: Outgoing[][];
};

const recordings = fixture<Recording[]>("protocol-parity.json");
const session = {
  nickname: "Ada",
  locale: "zh-TW" as const,
  default_number: null,
};

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
      const seeds = recording.seeds.map(BigInt);
      const { game, messages } = harness(
        recording.engine === "exact" ? exactEngine : failingEngine,
        {
          newSeed: () => {
            const seed = seeds.shift();
            if (seed === undefined)
              throw new Error("drew more seeds than the server");
            return seed;
          },
        },
      );
      for (const [index, action] of recording.script.entries()) {
        game.handle(action.type, action.payload);
        await settle();
        expect(
          messages.splice(0).map(normalise),
          `${action.type} #${index}`,
        ).toEqual(recording.replies[index]);
      }
      expect(seeds).toEqual([]);
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
    // The engine stays for the next game; only its answer is dropped.
    expect(dispose).not.toHaveBeenCalled();
    expect(messages.at(-1)).toMatchObject({
      payload: { room: null, game: null },
    });
    expect(game.serialize()).toBeNull();
  });

  it("keeps one engine from game to game until it is disposed", async () => {
    const dispose = vi.fn();
    const engine = vi.fn(() => ({ ...exactEngine(), dispose }));
    const { game } = harness(engine);
    game.handle("game.ai.start");
    await settle();
    game.handle("game.leave");
    await settle();
    game.handle("game.ai.start");
    await settle();
    expect(engine).toHaveBeenCalledTimes(1);
    game.dispose();
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("starts a new engine when a failed game is tried again", async () => {
    const broken = { ...failingEngine(), dispose: vi.fn() };
    const engine = vi
      .fn<() => AiEngine>()
      .mockReturnValueOnce(broken)
      .mockImplementation(exactEngine);
    const { game, messages } = harness(engine);
    game.handle("game.ai.start");
    game.handle("game.move", { column: 3 });
    await settle();
    expect(messages.at(-1)).toMatchObject({
      payload: { game: { status: "error" } },
    });

    game.handle("game.ai.retry");
    await settle();
    expect(broken.dispose).toHaveBeenCalled();
    expect(engine).toHaveBeenCalledTimes(2);
    game.handle("game.move", { column: 3 });
    await settle();
    expect(messages.at(-1)).toMatchObject({
      payload: { game: { status: "playing", history: "44" } },
    });
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

  it("saves the level, colours and seed, so a restored Easy AI repeats its move", async () => {
    // Above 2**53, so the save must keep the seed as a string.
    const seed = 2n ** 63n + 12345n;
    const first = harness(exactEngine, { newSeed: () => seed });
    first.game.handle("game.ai.start", {
      difficulty: "easy",
      ai_first: true,
      player_color: "pink",
    });
    await settle();
    for (const column of [0, 6, 0]) {
      first.game.handle("game.move", { column });
      await settle();
    }
    const saved = first.game.serialize()!;
    const original = first.messages.at(-1) as Extract<
      Outgoing,
      { type: "state.snapshot" }
    >;
    expect(saved).toMatchObject({
      version: 2,
      difficulty: "easy",
      aiColor: "green",
      first: "green",
      seed: String(seed),
    });
    expect(saved.history).toHaveLength(7);

    // Saved after the player's third move, before the AI answered.
    const restored = harness(exactEngine, {
      newSeed: () => {
        throw new Error("a restored game keeps its seed");
      },
    });
    restored.game.restore(
      JSON.parse(
        JSON.stringify({ ...saved, history: saved.history.slice(0, 6) }),
      ),
    );
    await settle();
    expect(restored.messages.at(-1)).toMatchObject({
      payload: {
        game: {
          difficulty: "easy",
          you: "pink",
          first: "green",
          history: saved.history,
          status: original.payload.game!.status,
        },
      },
    });
  });

  it("reads a save from before 3.5.0 as the Super AI with the player green and first", async () => {
    const { game, messages } = harness(exactEngine);
    game.restore({
      version: 1,
      roomId: "local-x",
      history: "4",
      series: { you: 0, opponent: 0, draws: 0 },
      revision: 2,
      failed: false,
    });
    await settle();
    expect(messages.at(-1)).toMatchObject({
      payload: {
        game: {
          difficulty: "super",
          you: "green",
          first: "green",
          history: "44",
          status: "playing",
          players: { pink: { nickname: "Super AI", is_ai: true } },
        },
      },
    });
    expect(game.serialize()).toMatchObject({ version: 2, difficulty: "super" });
  });

  it.each([
    ["an unknown level", { difficulty: "hard" }],
    ["an unknown colour", { aiColor: "blue" }],
    ["a seed that is not a number", { seed: "x" }],
    ["a newer version", { version: 3 }],
  ])("drops a save with %s", async (_name, change) => {
    const valid = {
      version: 2,
      roomId: "local-x",
      history: "4",
      series: { you: 0, opponent: 0, draws: 0 },
      revision: 2,
      failed: false,
      difficulty: "normal",
      aiColor: "pink",
      first: "green",
      seed: "7",
    };
    const { game, messages } = harness(exactEngine);
    game.restore({ ...valid, ...change } as unknown as SavedGame);
    await settle();
    expect(game.serialize()).toBeNull();
    expect(messages).toEqual([]);
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
