import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pageSnapshot } from "../e2e/states";
import { useGameStore } from "../src/stores/game";
import type { Snapshot } from "../src/types";
import { withToken } from "../src/utils/presentation";
import { FakeWebSocket } from "./fakeSocket";

// A1: your move is on the board from the moment you let go, until the
// server's snapshot has it or turns it down.
function latest() {
  return FakeWebSocket.instances.at(-1)!;
}

async function yourTurn() {
  const store = useGameStore();
  await store.initialise();
  latest().connect("P03");
  return store;
}

/** P03 after your move in column 5 (index 4). */
function played(): Snapshot {
  const start = pageSnapshot("P03", "en");
  const game = start.game!;
  return {
    ...start,
    game: {
      ...game,
      revision: game.revision + 1,
      status: "thinking",
      turn: "pink",
      board: withToken(game.board, 4, "green"),
      history: `${game.history}5`,
    },
  };
}

function deliver(payload: Snapshot) {
  latest().emit("message", { data: { type: "state.snapshot", payload } });
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
      json: async () => ({ nickname: "Player", locale: "en" }),
    })),
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("your move while the server confirms it", () => {
  it("is sent once, and the board waits for the server", async () => {
    const store = await yourTurn();
    const history = store.game!.history;
    expect(store.move(4)).toBe(true);
    expect(latest().sent).toEqual(["game.move"]);
    expect(store.pendingMove).toEqual({ column: 4, index: history.length });
    expect(store.canMove).toBe(false);

    // A second tap before the answer sends nothing.
    expect(store.move(2)).toBe(false);
    expect(latest().sent).toEqual(["game.move"]);
  });

  it("settles when a snapshot has it", async () => {
    const store = await yourTurn();
    store.move(4);
    deliver(played());
    expect(store.pendingMove).toBeNull();
  });

  it("waits through a snapshot sent before the server saw it", async () => {
    const store = await yourTurn();
    store.move(4);
    // For example, the room's presence changed meanwhile.
    deliver(pageSnapshot("P03", "en"));
    expect(store.pendingMove).not.toBeNull();
  });

  it("is taken back when the server turns it down", async () => {
    const store = await yourTurn();
    store.move(4);
    latest().emit("message", {
      data: { type: "error", payload: { code: "not_your_turn" } },
    });
    expect(store.pendingMove).toBeNull();
    expect(store.errorCode).toBe("not_your_turn");
  });

  it("is taken back when the connection drops", async () => {
    const store = await yourTurn();
    store.move(4);
    latest().emit("close");
    expect(store.pendingMove).toBeNull();
  });

  it("is not played out of turn", async () => {
    const store = await yourTurn();
    deliver(played());
    expect(store.move(2)).toBe(false);
  });

  it("is not played while reconnecting", async () => {
    const store = await yourTurn();
    latest().emit("close");
    expect(store.move(2)).toBe(false);
    expect(store.held).toBeNull();
  });
});
