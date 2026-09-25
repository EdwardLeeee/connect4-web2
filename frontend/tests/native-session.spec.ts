import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The app path (docs/protocol.md "App 連線"), with Capacitor replaced by fakes.
const native = vi.hoisted(() => {
  const state = { stored: null as string | null };
  return {
    state,
    isNative: () => true,
    tokenStore: {
      get: async () => state.stored,
      set: async (token: string) => {
        state.stored = token;
      },
    },
    nativeShare: vi.fn(),
  };
});
vi.mock("../src/native", () => ({
  isNative: native.isNative,
  tokenStore: native.tokenStore,
  nativeShare: native.nativeShare,
}));

type Listener = (event: Event) => void;

class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 3;
  static instances: FakeWebSocket[] = [];
  readyState = FakeWebSocket.CONNECTING;
  private listeners = new Map<string, Listener[]>();

  constructor(
    readonly url: string,
    readonly protocols?: string[],
  ) {
    FakeWebSocket.instances.push(this);
  }

  addEventListener(type: string, listener: Listener) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  send() {}

  emit(type: string, init: { code?: number; data?: unknown } = {}) {
    if (type === "open") this.readyState = FakeWebSocket.OPEN;
    if (type === "close") this.readyState = FakeWebSocket.CLOSED;
    const event =
      type === "close"
        ? new CloseEvent(type, { code: init.code })
        : type === "message"
          ? new MessageEvent(type, { data: JSON.stringify(init.data) })
          : new Event(type);
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

// Each reply hands out the next token, as the server does for a new session.
let issued = 0;
const requests: Array<{ method: string; auth: string | null; creds: string }> =
  [];

function stubServer() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit = {}) => {
      requests.push({
        method: init.method ?? "GET",
        auth: new Headers(init.headers).get("Authorization"),
        creds: String(init.credentials),
      });
      issued += 1;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          nickname: "Player",
          locale: "en",
          token: `t${issued}`,
        }),
      };
    }),
  );
}

/** Lets the reconnect chain (session fetch, token save) run to the end. */
async function settle() {
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
}

async function freshStore() {
  vi.resetModules();
  const { useGameStore } = await import("../src/stores/game");
  return useGameStore();
}

const snapshot = {
  server_time: 1,
  session: { nickname: "Player", locale: "en" },
  queue: { searching: false },
  room: null,
  game: null,
};

beforeEach(() => {
  vi.useFakeTimers();
  setActivePinia(createPinia());
  vi.stubGlobal("WebSocket", FakeWebSocket);
  FakeWebSocket.instances = [];
  native.state.stored = null;
  issued = 0;
  requests.length = 0;
  stubServer();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("app session token", () => {
  it("sends the stored token and keeps the one each reply carries", async () => {
    native.state.stored = "saved";
    const store = await freshStore();
    await store.initialise();

    expect(requests).toEqual([
      { method: "GET", auth: "Bearer saved", creds: "omit" },
    ]);
    expect(native.state.stored).toBe("t1");
    // The token rides in a subprotocol, never in the URL.
    const socket = FakeWebSocket.instances[0];
    expect(socket.protocols).toEqual(["connect4.v1", "connect4.token.t1"]);
    expect(socket.url).not.toContain("t1");
    expect(store.session).toBeNull();
  });

  it("asks without a token the first time", async () => {
    const store = await freshStore();
    await store.initialise();
    expect(requests[0].auth).toBeNull();
    expect(native.state.stored).toBe("t1");
  });

  it("keeps the token out of the session it shows", async () => {
    const store = await freshStore();
    await store.initialise();
    FakeWebSocket.instances[0].emit("message", {
      data: { type: "state.snapshot", payload: snapshot },
    });
    await store.saveProfile("Ann", "en");
    expect(requests.at(-1)).toEqual({
      method: "PATCH",
      auth: "Bearer t1",
      creds: "omit",
    });
    expect(native.state.stored).toBe("t2");
    expect(store.session).toEqual({ nickname: "Player", locale: "en" });
  });

  it("backs off on an accepted-then-4401 socket without flashing online", async () => {
    const store = await freshStore();
    await store.initialise();
    const seen: string[] = [];
    store.$subscribe(() => seen.push(store.connection));

    // Token rejected: the server accepts, then closes with 4401.
    FakeWebSocket.instances[0].emit("open");
    FakeWebSocket.instances[0].emit("close", { code: 4401 });
    await vi.advanceTimersByTimeAsync(500);
    await settle();
    expect(FakeWebSocket.instances).toHaveLength(2);
    // A new token was fetched with the old one and is used at once.
    expect(requests[1].auth).toBe("Bearer t1");
    expect(FakeWebSocket.instances[1].protocols).toContain("connect4.token.t2");

    FakeWebSocket.instances[1].emit("open");
    FakeWebSocket.instances[1].emit("close", { code: 4401 });
    // The backoff keeps growing: not again after 500ms, but after 1000ms.
    await vi.advanceTimersByTimeAsync(500);
    await settle();
    expect(FakeWebSocket.instances).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(500);
    await settle();
    expect(FakeWebSocket.instances).toHaveLength(3);
    expect(seen).not.toContain("online");
    expect(store.connectionEpoch).toBe(0);

    // The first snapshot is what makes the connection count.
    FakeWebSocket.instances[2].emit("open");
    expect(store.connection).not.toBe("online");
    FakeWebSocket.instances[2].emit("message", {
      data: { type: "state.snapshot", payload: snapshot },
    });
    expect(store.connection).toBe("online");
    expect(store.retryCount).toBe(0);
    expect(store.connectionEpoch).toBe(1);
  });
});

describe("app invites", () => {
  beforeEach(() => {
    native.nativeShare.mockReset();
  });

  it("uses the system share sheet", async () => {
    native.nativeShare.mockResolvedValue("shared");
    const { shareInvite } = await import("../src/utils/invite");
    await expect(shareInvite("LAN427", "Title", "Text")).resolves.toBe(
      "shared",
    );
    expect(native.nativeShare).toHaveBeenCalledWith({
      title: "Title",
      text: "Text",
      url: expect.stringContaining("/?room=LAN427"),
    });
  });

  it("copies the link when the share sheet fails", async () => {
    native.nativeShare.mockResolvedValue("failed");
    const writeText = vi.fn(async () => {});
    Object.defineProperty(window, "isSecureContext", {
      configurable: true,
      value: true,
    });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const { shareInvite } = await import("../src/utils/invite");
    await expect(shareInvite("LAN427", "Title", "Text")).resolves.toBe(
      "copied",
    );
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining("/?room=LAN427"),
    );
    Reflect.deleteProperty(window, "isSecureContext");
    Reflect.deleteProperty(navigator, "clipboard");
  });
});
