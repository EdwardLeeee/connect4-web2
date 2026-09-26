import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pageSnapshot } from "../e2e/states";
import { CENTRE_FIRST, ROWS } from "../src/local/constants";
import { useGameStore } from "../src/stores/game";
import { FakeWebSocket } from "./fakeSocket";

// 3.2.0: the app plays AI games on the device (src/local), the website on the
// server. The engine is a stand-in here; tests/local checks the real one.
const native = vi.hoisted(() => ({
  app: true,
  saved: null as string | null,
  last: null as unknown,
}));
vi.mock("../src/native", () => ({
  isNative: () => native.app,
  usesLocalAi: () => native.app,
  tokenStore: { get: async () => null, set: async () => {} },
  localGameStore: {
    get: async () => native.saved,
    set: async (value: string | null) => {
      native.saved = value;
    },
  },
  profileMemory: {
    lastSession: async () => native.last,
    rememberSession: async (session: unknown) => {
      native.last = session;
    },
    pendingLocale: async () => null,
    setPendingLocale: async () => {},
    restorePending: async () => false,
    setRestorePending: async () => {},
  },
  nativeShare: vi.fn(),
}));

/** Centre first into the first column with room: predictable, and legal. */
vi.mock("../src/local/aiClient", () => ({
  createWorkerEngine: () => ({
    bestMove: async (history: string) => {
      const heights = Array.from({ length: 7 }, () => 0);
      for (const digit of history) heights[Number(digit) - 1] += 1;
      return CENTRE_FIRST.find((column) => heights[column] < ROWS)!;
    },
    dispose: () => {},
  }),
}));

function latest() {
  return FakeWebSocket.instances.at(-1)!;
}

/** Lets dynamic imports, replies and saves finish. */
async function settle() {
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
  await vi.advanceTimersByTimeAsync(0);
}

/** The AI's minimum think time (manager.py AI_MIN_THINK_SECONDS). */
async function aiThinks() {
  await vi.advanceTimersByTimeAsync(1000);
  await settle();
}

async function inTheLobby() {
  const store = useGameStore();
  await store.initialise();
  latest().connect("L01");
  return store;
}

/** Starts an AI game; the first one also loads src/local. */
async function start(store: ReturnType<typeof useGameStore>) {
  store.send("game.ai.start");
  await store.localLoading;
  await settle();
}

async function playing() {
  const store = await inTheLobby();
  await start(store);
  return store;
}

function saved() {
  return native.saved ? JSON.parse(native.saved) : null;
}

beforeEach(() => {
  vi.useFakeTimers();
  setActivePinia(createPinia());
  FakeWebSocket.instances = [];
  vi.stubGlobal("WebSocket", FakeWebSocket);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ nickname: "Ada", locale: "zh-TW" }),
    })),
  );
  native.app = true;
  native.saved = null;
  native.last = null;
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("AI games in the app", () => {
  it("are played on the device, not on the server", async () => {
    const store = await playing();
    expect(latest().sent).toEqual([]);
    expect(store.source).toBe("local");
    expect(store.room?.id).toMatch(/^local-/);
    expect(store.game).toMatchObject({ history: "", you: "green" });
    expect(store.session?.nickname).toBe("Taylor");

    expect(store.move(3)).toBe(true);
    await settle();
    expect(store.game?.status).toBe("thinking");
    await aiThinks();
    expect(store.game).toMatchObject({ history: "44", status: "playing" });
    expect(latest().sent).toEqual([]);
  });

  it("need no connection, and show no connection notice", async () => {
    const store = await playing();
    latest().emit("close");
    await vi.advanceTimersByTimeAsync(5000);
    expect(store.connection).toBe("offline");
    expect(store.shownConnection).toBe("online");
    expect(store.canMove).toBe(true);
    expect(store.move(2)).toBe(true);
    await aiThinks();
    expect(store.game?.history).toBe("34");
  });

  it("keep a pending move when the server's socket drops", async () => {
    const store = await playing();
    store.move(3);
    latest().emit("close");
    expect(store.pendingMove).not.toBeNull();
    await settle();
    expect(store.game?.history).toBe("4");
    expect(store.pendingMove).toBeNull();
  });

  it("stay on screen when the server sends its state", async () => {
    const store = await playing();
    const lobby = pageSnapshot("L01", "zh-TW");
    latest().emit("message", {
      data: {
        type: "state.snapshot",
        payload: { ...lobby, session: { nickname: "Bea", locale: "zh-TW" } },
      },
    });
    expect(store.room?.id).toMatch(/^local-/);
    expect(store.session?.nickname).toBe("Bea");
    // The next local snapshot carries the new name too.
    store.move(3);
    await settle();
    expect(store.game?.players.green?.nickname).toBe("Bea");
  });

  it("keep animating through a server reconnect", async () => {
    const store = await playing();
    const epoch = store.liveEpoch;
    latest().emit("close");
    await vi.advanceTimersByTimeAsync(500);
    await settle();
    latest().connect("L01");
    expect(store.connectionEpoch).toBe(2);
    expect(store.liveEpoch).toBe(epoch);
  });

  it("go back to the server's lobby when left", async () => {
    const store = await playing();
    store.move(3);
    await aiThinks();
    expect(saved()).not.toBeNull();

    store.send("game.leave");
    await settle();
    expect(store.source).toBe("server");
    expect(store.game).toBeNull();
    expect(store.hasActivity).toBe(false);
    expect(saved()).toBeNull();
    expect(latest().sent).toEqual([]);
  });

  it("start again after being left, on the same device", async () => {
    const store = await playing();
    store.send("game.leave");
    await settle();
    await start(store);
    expect(store.source).toBe("local");
    expect(store.game?.history).toBe("");
  });
});

describe("an AI game the app was closed during", () => {
  it("resumes on the next launch, before and without the network", async () => {
    const first = await playing();
    first.move(2);
    await aiThinks();
    const kept = saved();
    expect(kept.game.history).toBe("34");
    expect(kept.session.nickname).toBe("Taylor");

    // Relaunch with no network at all.
    setActivePinia(createPinia());
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("offline");
      }),
    );
    const store = useGameStore();
    await store.initialise().catch(() => {});
    await settle();
    expect(store.source).toBe("local");
    expect(store.game?.history).toBe("34");
    expect(store.session?.nickname).toBe("Taylor");
    expect(store.canMove).toBe(true);
    // Resumed, not live: nothing animates on the way in.
    expect(store.liveEpoch).toBe("local-1");

    expect(store.move(3)).toBe(true);
    await aiThinks();
    expect(store.game?.history).toBe("3444");
  });

  it("lets the AI finish the move it was thinking about", async () => {
    const first = await playing();
    first.move(2);
    await settle();
    expect(first.game?.status).toBe("thinking");
    expect(saved().game.history).toBe("3");

    setActivePinia(createPinia());
    const store = useGameStore();
    await store.initialise();
    await settle();
    expect(store.game?.status).toBe("thinking");
    await aiThinks();
    expect(store.game).toMatchObject({ history: "34", status: "playing" });
  });

  it("is dropped when the save cannot be read", async () => {
    native.saved = JSON.stringify({
      session: { nickname: "Ada", locale: "zh-TW" },
      game: {
        version: 1,
        roomId: "local-x",
        history: "1111111",
        series: { you: 0, opponent: 0, draws: 0 },
        revision: 3,
        failed: false,
      },
    });
    const store = await inTheLobby();
    await settle();
    expect(store.source).toBe("server");
    expect(store.game).toBeNull();
    expect(native.saved).toBeNull();
  });
});

describe("AI games on the website", () => {
  it("stay on the server", async () => {
    native.app = false;
    const store = await inTheLobby();
    store.send("game.ai.start");
    await settle();
    expect(latest().sent).toEqual(["game.ai.start"]);
    expect(store.source).toBe("server");
    expect(store.local).toBeNull();
  });
});

// docs/protocol.md App 本機 AI 局: a local game never coexists with a place
// in the queue, a room or a game on the server.
describe("the server's queue, rooms and games", () => {
  async function connectedTo(id: "P01" | "P02") {
    const store = useGameStore();
    await store.initialise();
    latest().connect(id);
    return store;
  }

  it("refuse the AI while searching, as the server does", async () => {
    const store = await connectedTo("P01");
    store.send("game.ai.start");
    await settle();
    expect(store.errorCode).toBe("already_searching");
    expect(store.source).toBe("server");
    expect(latest().sent).toEqual([]);
  });

  it("refuse the AI while in a room", async () => {
    const store = await connectedTo("P02");
    store.send("game.ai.start");
    await settle();
    expect(store.errorCode).toBe("already_in_game");
    expect(store.source).toBe("server");
  });

  it("refuse the AI during the grace after a drop, as if online", async () => {
    const store = await connectedTo("P01");
    latest().emit("close");
    store.send("game.ai.start");
    await settle();
    expect(store.errorCode).toBe("already_searching");
    expect(store.source).toBe("server");
  });

  async function searchGivenUpOffline() {
    const store = await connectedTo("P01");
    latest().emit("close");
    // Past the grace, and every retry fails: offline.
    for (const wait of [2000, 1000, 2000]) {
      await vi.advanceTimersByTimeAsync(wait);
      await settle();
      latest().emit("close");
    }
    expect(store.serverConnection).toBe("offline");
    await start(store);
    expect(store.source).toBe("local");
    expect(store.abandonedSearch).toBe(true);
    return store;
  }

  async function reconnect(id: "P01" | "P04") {
    await vi.advanceTimersByTimeAsync(5000);
    await settle();
    latest().connect(id);
  }

  it("give the search up offline, and leave the queue on reconnect", async () => {
    const store = await searchGivenUpOffline();
    await reconnect("P01");
    expect(latest().sent).toEqual(["queue.leave"]);
    expect(store.room?.id).toMatch(/^local-/);
    latest().connect("L01");
    expect(store.abandonedSearch).toBe(false);
    expect(store.room?.id).toMatch(/^local-/);
  });

  it("leave a game the server matched on reconnect", async () => {
    const store = await searchGivenUpOffline();
    await reconnect("P04");
    expect(latest().sent).toEqual(["game.leave"]);
    // The local game stays on screen throughout.
    expect(store.source).toBe("local");
    expect(store.room?.id).toMatch(/^local-/);
    expect(store.game?.you).toBe("green");
  });

  it("leave the queue even if the local game ended first", async () => {
    const store = await searchGivenUpOffline();
    store.send("game.leave");
    await settle();
    expect(store.source).toBe("server");
    await reconnect("P01");
    expect(latest().sent).toEqual(["queue.leave"]);
    // The lobby shows, not the search being left.
    expect(store.searching).toBe(false);
    expect(store.hasActivity).toBe(false);
  });
});
