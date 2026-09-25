import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useGameStore } from "../src/stores/game";

type SocketListener = (event: Event) => void;

class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  readonly url: string;
  readyState = FakeWebSocket.CONNECTING;
  private listeners = new Map<string, SocketListener[]>();

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  addEventListener(type: string, listener: SocketListener) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  send() {}

  emit(type: string, init: CloseEventInit = {}) {
    if (type === "open") this.readyState = FakeWebSocket.OPEN;
    if (type === "close") this.readyState = FakeWebSocket.CLOSED;
    const event =
      type === "close" ? new CloseEvent(type, init) : new Event(type);
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }
}

function stubSessionFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ nickname: "Player", locale: "en" }),
    })),
  );
}

function stubProfileResponse(status: number, body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: status < 400,
      status,
      json: async () => body,
    })),
  );
}

describe("game connection recovery", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeWebSocket.instances = [];
    setActivePinia(createPinia());
    vi.stubGlobal("WebSocket", FakeWebSocket);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("refreshes the HTTP session before reconnecting the WebSocket", async () => {
    const events: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        events.push("session");
        return {
          ok: true,
          json: async () => ({ nickname: "Player", locale: "en" }),
        } as Response;
      }),
    );

    const OriginalSocket = FakeWebSocket;
    vi.stubGlobal(
      "WebSocket",
      class extends OriginalSocket {
        constructor(url: string) {
          events.push("socket");
          super(url);
        }
      },
    );

    const store = useGameStore();
    await store.initialise();
    expect(events).toEqual(["session", "socket"]);

    FakeWebSocket.instances[0].emit("close");
    await vi.advanceTimersByTimeAsync(500);

    expect(events).toEqual(["session", "socket", "session", "socket"]);
    expect(FakeWebSocket.instances).toHaveLength(2);
  });

  it("keeps the website on its cookie: no token, no subprotocol", async () => {
    const inits: RequestInit[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        inits.push(init);
        return {
          ok: true,
          json: async () => ({ nickname: "Player", locale: "en" }),
        };
      }),
    );
    const protocols: unknown[] = [];
    const OriginalSocket = FakeWebSocket;
    vi.stubGlobal(
      "WebSocket",
      class extends OriginalSocket {
        constructor(url: string, ...rest: unknown[]) {
          protocols.push(rest.length ? rest[0] : "none");
          super(url);
        }
      },
    );

    const store = useGameStore();
    await store.initialise();
    expect(inits[0].credentials).toBe("same-origin");
    expect(new Headers(inits[0].headers).has("Authorization")).toBe(false);
    expect(protocols).toEqual(["none"]);

    // Online once the first snapshot arrives, not when the socket opens.
    FakeWebSocket.instances[0].emit("open");
    expect(store.connection).toBe("connecting");
  });

  it("talks to the API origin the app is built with", async () => {
    vi.stubEnv("VITE_API_ORIGIN", "https://connect4.oraclelee.com");
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ nickname: "Player", locale: "en" }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    await useGameStore().initialise();
    expect(fetchMock).toHaveBeenCalledWith(
      "https://connect4.oraclelee.com/api/session",
      expect.anything(),
    );
    expect(FakeWebSocket.instances[0].url).toBe(
      "wss://connect4.oraclelee.com/ws",
    );
    vi.unstubAllEnvs();
  });

  it("stops reconnecting when a newer tab replaces the connection", async () => {
    stubSessionFetch();
    const store = useGameStore();
    await store.initialise();
    FakeWebSocket.instances[0].emit("open");

    FakeWebSocket.instances[0].emit("close", { code: 4001 });
    await vi.advanceTimersByTimeAsync(10_000);

    expect(store.connection).toBe("replaced");
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(store.canMove).toBe(false);
  });

  it("keeps retrying after an ordinary disconnect", async () => {
    stubSessionFetch();
    const store = useGameStore();
    await store.initialise();
    FakeWebSocket.instances[0].emit("open");

    FakeWebSocket.instances[0].emit("close", { code: 1006 });
    expect(store.connection).toBe("offline");
    await vi.advanceTimersByTimeAsync(500);

    expect(FakeWebSocket.instances).toHaveLength(2);
  });
});

describe("profile errors", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reports the session rule that rejected the profile", async () => {
    stubProfileResponse(422, { detail: "invalid_nickname" });
    const store = useGameStore();

    await expect(store.saveProfile(" ", "en")).rejects.toMatchObject({
      code: "invalid_nickname",
    });
  });

  it("treats request validation issues as an invalid payload", async () => {
    stubProfileResponse(422, {
      detail: [{ loc: ["body", "nickname"], type: "string_type" }],
    });
    const store = useGameStore();

    await expect(store.saveProfile("Ann", "en")).rejects.toMatchObject({
      code: "invalid_payload",
    });
  });

  it("does not blame the input for server or network failures", async () => {
    stubProfileResponse(500, null);
    const store = useGameStore();
    await expect(store.saveProfile("Ann", "en")).rejects.toMatchObject({
      code: "generic",
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    await expect(store.saveProfile("Ann", "en")).rejects.toMatchObject({
      code: "generic",
    });
  });
});
