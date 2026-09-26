import { createPinia, setActivePinia } from "pinia";
import { watch } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { i18n } from "../src/i18n";
import { useGameStore } from "../src/stores/game";
import { FakeWebSocket } from "./fakeSocket";

// 3.2.0 app 離線 03 and 04b: offline, only the language changes, at once, and
// reaches the server once connected; the app shows the last profile it saw.
const native = vi.hoisted(() => ({
  app: false,
  last: null as {
    nickname: string;
    locale: "zh-TW" | "en";
    default_number: number | null;
  } | null,
  pending: null as "zh-TW" | "en" | null,
  remembered: [] as unknown[],
}));
vi.mock("../src/native", () => ({
  isNative: () => native.app,
  usesLocalAi: () => native.app,
  tokenStore: { get: async () => null, set: async () => {} },
  localGameStore: { get: async () => null, set: async () => {} },
  profileMemory: {
    lastSession: async () => native.last,
    rememberSession: async (session: unknown) => {
      native.remembered.push(session);
    },
    pendingLocale: async () => native.pending,
    setPendingLocale: async (locale: "zh-TW" | "en" | null) => {
      native.pending = locale;
    },
    restorePending: async () => false,
    setRestorePending: async () => {},
  },
  nativeShare: vi.fn(),
}));

type Patch = { nickname: string; locale: string };
let patches: Patch[] = [];
let patchReply: () => Promise<{ ok: boolean; status: number }>;

function stubServer(session = { nickname: "Taylor", locale: "en" }) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit = {}) => {
      if (init.method === "PATCH") {
        const body = JSON.parse(String(init.body)) as Patch;
        patches.push(body);
        const reply = await patchReply();
        return { ...reply, json: async () => body };
      }
      return { ok: true, status: 200, json: async () => session };
    }),
  );
}

function latest() {
  return FakeWebSocket.instances.at(-1)!;
}

async function settle() {
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
  await vi.advanceTimersByTimeAsync(0);
}

/** Online in the lobby (English), then the connection drops past the grace. */
async function offlineInTheLobby() {
  const store = useGameStore();
  await store.initialise();
  latest().connect("L01");
  latest().emit("close");
  for (const wait of [2000, 1000, 2000]) {
    await vi.advanceTimersByTimeAsync(wait);
    await settle();
    latest().emit("close");
  }
  expect(store.serverConnection).toBe("offline");
  return store;
}

async function reconnect() {
  await vi.advanceTimersByTimeAsync(5000);
  await settle();
  latest().connect("L01");
  await settle();
}

beforeEach(() => {
  vi.useFakeTimers();
  setActivePinia(createPinia());
  FakeWebSocket.instances = [];
  vi.stubGlobal("WebSocket", FakeWebSocket);
  native.app = false;
  native.last = null;
  native.pending = null;
  native.remembered = [];
  patches = [];
  patchReply = async () => ({ ok: true, status: 200 });
  stubServer();
  i18n.global.locale.value = "en";
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("the language chosen offline", () => {
  it("changes at once, without sending anything", async () => {
    const store = await offlineInTheLobby();
    await store.saveProfile("Someone else", "zh-TW");
    expect(i18n.global.locale.value).toBe("zh-TW");
    expect(store.pendingLocale).toBe("zh-TW");
    expect(native.pending).toBe("zh-TW");
    expect(patches).toEqual([]);
  });

  it("reaches the server with its nickname once connected, with no flash back", async () => {
    const store = await offlineInTheLobby();
    await store.saveProfile("Someone else", "zh-TW");
    const shown: string[] = [];
    watch(
      () => i18n.global.locale.value,
      (locale) => shown.push(locale),
      { flush: "sync" },
    );
    await reconnect();
    // Both fields, and the server's own nickname (see syncNickname).
    expect(patches).toEqual([
      { nickname: "Taylor", locale: "zh-TW", default_number: null },
    ]);
    expect(store.pendingLocale).toBeNull();
    expect(native.pending).toBeNull();
    expect(shown).not.toContain("en");
    expect(i18n.global.locale.value).toBe("zh-TW");
  });

  it("is sent again on the next connection when it fails", async () => {
    const store = await offlineInTheLobby();
    await store.saveProfile("", "zh-TW");
    patchReply = async () => {
      throw new TypeError("offline");
    };
    await reconnect();
    expect(patches).toHaveLength(1);
    expect(store.pendingLocale).toBe("zh-TW");
    expect(i18n.global.locale.value).toBe("zh-TW");

    patchReply = async () => ({ ok: true, status: 200 });
    latest().emit("close");
    await reconnect();
    expect(patches).toHaveLength(2);
    expect(store.pendingLocale).toBeNull();
  });

  it("gives way to the server's language when the server refuses it", async () => {
    const store = await offlineInTheLobby();
    await store.saveProfile("", "zh-TW");
    patchReply = async () => ({ ok: false, status: 422 });
    await reconnect();
    expect(store.pendingLocale).toBeNull();
    expect(i18n.global.locale.value).toBe("en");
  });

  it("is dropped when it is the server's language already", async () => {
    const store = await offlineInTheLobby();
    await store.saveProfile("", "en");
    expect(store.pendingLocale).toBeNull();
    await reconnect();
    expect(patches).toEqual([]);
  });

  it("is kept across a launch, and shown before the server answers", async () => {
    native.pending = "zh-TW";
    const store = useGameStore();
    await store.initialise();
    expect(i18n.global.locale.value).toBe("zh-TW");
    expect(store.shownLocale).toBe("zh-TW");
    latest().connect("L01");
    await settle();
    expect(patches).toEqual([
      { nickname: "Taylor", locale: "zh-TW", default_number: null },
    ]);
  });

  it("is cleared by a save made online", async () => {
    native.pending = "zh-TW";
    patchReply = () => new Promise(() => {});
    const store = useGameStore();
    await store.initialise();
    latest().connect("L01");
    await settle();
    patchReply = async () => ({ ok: true, status: 200 });
    await store.saveProfile("Taylor", "en");
    expect(store.pendingLocale).toBeNull();
    expect(native.pending).toBeNull();
    expect(i18n.global.locale.value).toBe("en");
  });
});

describe("the last profile", () => {
  it("shows in the app before the server answers, with its language", async () => {
    native.app = true;
    native.last = { nickname: "曜宇", locale: "zh-TW", default_number: null };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("offline");
      }),
    );
    const store = useGameStore();
    await store.initialise().catch(() => {});
    expect(store.session).toEqual({
      nickname: "曜宇",
      locale: "zh-TW",
      default_number: null,
    });
    expect(i18n.global.locale.value).toBe("zh-TW");
  });

  it("is remembered in the app whenever the server gives a new one", async () => {
    native.app = true;
    native.last = { nickname: "Ann", locale: "en", default_number: null };
    const store = useGameStore();
    await store.initialise();
    latest().connect("L01");
    expect(native.remembered).toEqual([
      { nickname: "Taylor", locale: "en", default_number: null },
    ]);
    // The same profile again is not written again.
    latest().connect("L01");
    expect(native.remembered).toHaveLength(1);
  });

  it("stays off the website's screen until the snapshot, but is kept", async () => {
    native.last = { nickname: "曜宇", locale: "zh-TW", default_number: null };
    const store = useGameStore();
    await store.initialise();
    expect(store.session).toBeNull();
    // Kept for putting back after a server restart (06).
    expect(native.remembered).toEqual([
      { nickname: "Taylor", locale: "en", default_number: null },
    ]);
  });
});
