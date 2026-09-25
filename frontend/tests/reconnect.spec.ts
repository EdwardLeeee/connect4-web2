import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pageSnapshot, type PageId } from "../e2e/states";
import { useGameStore } from "../src/stores/game";

// Coming back from the background (TestFlight feedback): reconnect at once,
// stay quiet through a quick reconnect, and keep a search cancelled meanwhile.
type Listener = (event: Event) => void;

class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: FakeWebSocket[] = [];
  readyState = FakeWebSocket.CONNECTING;
  sent: string[] = [];
  private listeners = new Map<string, Listener[]>();

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  addEventListener(type: string, listener: Listener) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  send(data: string) {
    this.sent.push(JSON.parse(data).type);
  }

  // A dead socket never confirms the close.
  close() {
    this.readyState = FakeWebSocket.CLOSING;
  }

  emit(type: string, init: { code?: number; data?: unknown } = {}) {
    if (type === "open") this.readyState = FakeWebSocket.OPEN;
    if (type === "close") this.readyState = FakeWebSocket.CLOSED;
    const event =
      type === "close"
        ? new CloseEvent(type, { code: init.code ?? 1006 })
        : type === "message"
          ? new MessageEvent(type, { data: JSON.stringify(init.data) })
          : new Event(type);
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }

  /** Accepts the connection with the state of a page. */
  connect(id: PageId) {
    this.emit("open");
    this.emit("message", {
      data: { type: "state.snapshot", payload: pageSnapshot(id, "en") },
    });
  }
}

let visibility: DocumentVisibilityState = "visible";

function latest() {
  return FakeWebSocket.instances.at(-1)!;
}

/** Lets the reconnect chain (session fetch, then the socket) run. */
async function settle() {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
}

async function online(id: PageId = "P03") {
  const store = useGameStore();
  await store.initialise();
  latest().connect(id);
  return store;
}

function hide(store: ReturnType<typeof useGameStore>) {
  visibility = "hidden";
  store.suspend();
}

function show(store: ReturnType<typeof useGameStore>) {
  visibility = "visible";
  store.resume();
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
  visibility = "visible";
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => visibility,
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(document, "visibilityState");
});

describe("coming back to the page", () => {
  it("reconnects at once instead of waiting out the backoff", async () => {
    const store = await online();
    hide(store);
    latest().emit("close");
    // Retries fail while the phone sleeps, stretching the backoff to 4s.
    for (const wait of [500, 1000, 2000]) {
      await vi.advanceTimersByTimeAsync(wait);
      await settle();
      latest().emit("close");
    }
    expect(FakeWebSocket.instances).toHaveLength(4);

    show(store);
    await settle();
    expect(FakeWebSocket.instances).toHaveLength(5);
    latest().connect("P03");
    expect(store.connection).toBe("online");
    expect(store.retryCount).toBe(0);
  });

  it("leaves a socket that is still connecting alone", async () => {
    const store = await online();
    latest().emit("close");
    await vi.advanceTimersByTimeAsync(500);
    await settle();
    expect(FakeWebSocket.instances).toHaveLength(2);

    show(store);
    store.reconnectNow();
    await settle();
    expect(FakeWebSocket.instances).toHaveLength(2);
  });

  it("does not come back after another tab took over", async () => {
    const store = await online();
    hide(store);
    latest().emit("close", { code: 4001 });
    show(store);
    await vi.advanceTimersByTimeAsync(10_000);
    await settle();
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(store.shownConnection).toBe("replaced");
  });

  it("recovers from a first connection that never started", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("offline");
      }),
    );
    const store = useGameStore();
    await expect(store.initialise()).rejects.toThrow();
    expect(FakeWebSocket.instances).toHaveLength(0);

    // The network is back (window "online").
    store.reconnectNow();
    await settle();
    expect(FakeWebSocket.instances).toHaveLength(1);
  });
});

describe("a quick reconnect shows nothing", () => {
  it("keeps the screen as it was through a two-second drop", async () => {
    const store = await online();
    const shown: string[] = [];
    store.$subscribe(() => shown.push(store.shownConnection), {
      flush: "sync",
    });

    latest().emit("close");
    // The board cannot be played meanwhile.
    expect(store.canMove).toBe(false);
    await vi.advanceTimersByTimeAsync(500);
    await settle();
    await vi.advanceTimersByTimeAsync(1000);
    latest().connect("P03");

    expect(shown.every((state) => state === "online")).toBe(true);
    expect(store.connection).toBe("online");
  });

  it("says so once the drop lasts longer", async () => {
    const store = await online();
    latest().emit("close");
    await vi.advanceTimersByTimeAsync(1999);
    expect(store.shownConnection).toBe("online");
    await vi.advanceTimersByTimeAsync(1);
    expect(store.shownConnection).toBe("offline");
  });

  it("starts the grace from coming back, not from a drop nobody saw", async () => {
    const store = await online();
    hide(store);
    latest().emit("close");
    await vi.advanceTimersByTimeAsync(30_000);
    expect(store.shownConnection).toBe("online");

    show(store);
    await settle();
    expect(store.shownConnection).toBe("online");
    // The reconnect hangs: the notice shows two seconds after coming back.
    await vi.advanceTimersByTimeAsync(1999);
    expect(store.shownConnection).toBe("online");
    await vi.advanceTimersByTimeAsync(1);
    expect(store.shownConnection).toBe("offline");
  });

  it("keeps a notice already shown when the page comes back", async () => {
    const store = await online();
    latest().emit("close");
    await vi.advanceTimersByTimeAsync(2000);
    expect(store.shownConnection).toBe("offline");
    hide(store);
    show(store);
    await settle();
    expect(store.shownConnection).toBe("offline");
  });

  it("shows the first connection as connecting, with no grace", async () => {
    const store = useGameStore();
    await store.initialise();
    expect(store.shownConnection).toBe("connecting");
    latest().emit("close");
    expect(store.shownConnection).toBe("offline");
  });
});

describe("a socket that looks open after a long absence", () => {
  it("is asked for the state and kept when it answers", async () => {
    const store = await online();
    hide(store);
    await vi.advanceTimersByTimeAsync(60_000);
    show(store);
    expect(latest().sent).toEqual(["state.request"]);

    latest().emit("message", {
      data: { type: "state.snapshot", payload: pageSnapshot("P03", "en") },
    });
    await vi.advanceTimersByTimeAsync(5000);
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(store.connection).toBe("online");
  });

  it("is replaced when it stays silent, without a notice", async () => {
    const store = await online();
    const dead = latest();
    hide(store);
    await vi.advanceTimersByTimeAsync(60_000);
    show(store);
    await vi.advanceTimersByTimeAsync(3000);
    await settle();
    expect(dead.readyState).toBe(FakeWebSocket.CLOSING);
    expect(FakeWebSocket.instances).toHaveLength(2);
    expect(store.shownConnection).toBe("online");

    // The dead socket's late close and messages change nothing.
    dead.emit("close");
    dead.emit("message", { data: { type: "error", payload: { code: "x" } } });
    await vi.advanceTimersByTimeAsync(1000);
    await settle();
    expect(FakeWebSocket.instances).toHaveLength(2);
    expect(store.errorCode).toBeNull();
    latest().connect("P03");
    expect(store.connection).toBe("online");
  });

  it("is not probed after a short absence", async () => {
    const store = await online();
    hide(store);
    await vi.advanceTimersByTimeAsync(5000);
    show(store);
    expect(latest().sent).toEqual([]);
  });
});

describe("messages sent while reconnecting", () => {
  it("cancel a search once the connection is back", async () => {
    const store = await online("P01");
    latest().emit("close");
    store.send("queue.leave");
    expect(store.errorCode).toBeNull();

    await vi.advanceTimersByTimeAsync(500);
    await settle();
    latest().connect("P01");
    expect(latest().sent).toEqual(["queue.leave"]);
  });

  it("drop the cancel when the server matched a game meanwhile", async () => {
    const store = await online("P01");
    latest().emit("close");
    store.send("queue.leave");
    await vi.advanceTimersByTimeAsync(500);
    await settle();
    latest().connect("P04");
    expect(latest().sent).toEqual([]);
    expect(store.game).not.toBeNull();
  });

  it("start a game from the lobby only if still in the lobby", async () => {
    const store = await online("L01");
    latest().emit("close");
    store.send("game.ai.start");
    await vi.advanceTimersByTimeAsync(500);
    await settle();
    latest().connect("L01");
    expect(latest().sent).toEqual(["game.ai.start"]);

    latest().emit("close");
    store.send("game.ai.start");
    await vi.advanceTimersByTimeAsync(500);
    await settle();
    latest().connect("P03");
    expect(latest().sent).toEqual([]);
  });

  it("never hold a move or a state request", async () => {
    const store = await online();
    latest().emit("close");
    store.send("game.move", { column: 3 });
    store.send("state.request");
    await vi.advanceTimersByTimeAsync(500);
    await settle();
    latest().connect("P03");
    expect(latest().sent).toEqual([]);
  });

  it("still fail in a replaced tab", async () => {
    const store = await online();
    latest().emit("close", { code: 4001 });
    store.send("game.leave");
    expect(store.errorCode).toBe("generic");
  });
});
