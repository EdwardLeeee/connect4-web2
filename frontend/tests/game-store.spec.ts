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

  emit(type: string) {
    if (type === "open") this.readyState = FakeWebSocket.OPEN;
    if (type === "close") this.readyState = FakeWebSocket.CLOSED;
    for (const listener of this.listeners.get(type) ?? []) {
      listener(new Event(type));
    }
  }
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
});
