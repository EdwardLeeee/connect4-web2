import { createPinia, setActivePinia } from "pinia";
import { watch } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { i18n } from "../src/i18n";
import { useGameStore } from "../src/stores/game";
import { FakeWebSocket } from "./fakeSocket";

// 3.2.0 04b, 05, 06: a new app install names itself; a default nickname
// follows the language; the device's profile goes back on a server that
// started over, before the socket connects, so no default ever shows.
type Session = {
  nickname: string;
  locale: "zh-TW" | "en";
  default_number: number | null;
};

const native = vi.hoisted(() => ({
  app: false,
  last: null as unknown,
  pending: null as "zh-TW" | "en" | null,
  restore: false,
}));
vi.mock("../src/native", () => ({
  isNative: () => native.app,
  usesLocalAi: () => native.app,
  tokenStore: { get: async () => null, set: async () => {} },
  localGameStore: { get: async () => null, set: async () => {} },
  profileMemory: {
    lastSession: async () => native.last,
    rememberSession: async (session: unknown) => {
      native.last = session;
    },
    pendingLocale: async () => native.pending,
    setPendingLocale: async (locale: "zh-TW" | "en" | null) => {
      native.pending = locale;
    },
    restorePending: async () => native.restore,
    setRestorePending: async (pending: boolean) => {
      native.restore = pending;
    },
  },
  nativeShare: vi.fn(),
}));

/** manager.py's session rules, as back measured them on the real server. */
const server = {
  session: {} as Session,
  created: false,
  failPatch: null as null | "network" | 422,
  patches: [] as Record<string, unknown>[],
};

function named(locale: "zh-TW" | "en", n: number) {
  return `${locale === "en" ? "Player" : "玩家"} ${n}`;
}

function stubServer() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit = {}) => {
      if (init.method === "PATCH") {
        const body = JSON.parse(String(init.body));
        server.patches.push(body);
        if (server.failPatch === "network") throw new TypeError("offline");
        if (server.failPatch === 422) {
          return {
            ok: false,
            status: 422,
            json: async () => ({ detail: "invalid_nickname" }),
          };
        }
        server.session =
          body.default_number === null
            ? {
                nickname: body.nickname,
                locale: body.locale,
                default_number: null,
              }
            : {
                nickname: named(body.locale, body.default_number),
                locale: body.locale,
                default_number: body.default_number,
              };
        return {
          ok: true,
          status: 200,
          json: async () => ({ ...server.session, created: false }),
        };
      }
      const created = server.created;
      server.created = false;
      return {
        ok: true,
        status: 200,
        json: async () => ({ ...server.session, created }),
      };
    }),
  );
}

/** The socket connects and the server sends its current state. */
function connect() {
  const socket = FakeWebSocket.instances.at(-1)!;
  socket.emit("open");
  socket.emit("message", {
    data: {
      type: "state.snapshot",
      payload: {
        server_time: 1,
        session: server.session,
        queue: { searching: false },
        room: null,
        game: null,
      },
    },
  });
}

async function settle() {
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
  await vi.advanceTimersByTimeAsync(0);
}

/** Every nickname the screen showed, from now on. */
function watchNames(store: ReturnType<typeof useGameStore>) {
  const names: string[] = [];
  watch(
    () => store.shownSession?.nickname,
    (name) => {
      if (name) names.push(name);
    },
    { flush: "sync" },
  );
  return names;
}

beforeEach(() => {
  vi.useFakeTimers();
  setActivePinia(createPinia());
  FakeWebSocket.instances = [];
  vi.stubGlobal("WebSocket", FakeWebSocket);
  native.app = false;
  native.last = null;
  native.pending = null;
  native.restore = false;
  server.session = {
    nickname: "玩家 4553",
    locale: "zh-TW",
    default_number: 4553,
  };
  server.created = false;
  server.failPatch = null;
  server.patches = [];
  stubServer();
  i18n.global.locale.value = "zh-TW";
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("a new app install (04b)", () => {
  it("names itself at once, and saves that name on its first connection", async () => {
    native.app = true;
    server.created = true;
    const store = useGameStore();
    const names = watchNames(store);
    await store.initialise();
    const own = store.shownSession!;
    expect(own.nickname).toMatch(/^玩家 \d{4}$/);
    expect(own.default_number).toBeGreaterThanOrEqual(1000);
    expect(own.default_number).toBeLessThanOrEqual(9999);
    // Saved before the socket, with the default marker.
    expect(server.patches).toEqual([
      { locale: "zh-TW", default_number: own.default_number },
    ]);
    connect();
    expect(store.shownSession?.nickname).toBe(own.nickname);
    // The server's own default never showed.
    expect(names).not.toContain("玩家 4553");
  });

  it("names itself in English when the app is in English", async () => {
    native.app = true;
    native.pending = "en";
    const store = useGameStore();
    await store.initialise().catch(() => {});
    expect(store.shownSession?.nickname).toMatch(/^Player \d{4}$/);
  });
});

describe("a server that started over (06)", () => {
  it("gets the player's own name back before the socket connects", async () => {
    native.last = { nickname: "曜宇", locale: "en", default_number: null };
    server.created = true;
    const store = useGameStore();
    const locales: string[] = [];
    watch(
      () => i18n.global.locale.value,
      (locale) => locales.push(locale),
      { flush: "sync" },
    );
    await store.initialise();
    expect(server.patches).toEqual([
      { nickname: "曜宇", locale: "en", default_number: null },
    ]);
    expect(FakeWebSocket.instances).toHaveLength(1);
    const names = watchNames(store);
    connect();
    expect(names).toEqual(["曜宇"]);
    // English from the start: the new session's zh-TW never showed.
    expect(locales).toEqual(["en"]);
  });

  it("gets a default name back as a default, by its number", async () => {
    native.last = {
      nickname: "Player 1234",
      locale: "en",
      default_number: 1234,
    };
    server.created = true;
    const store = useGameStore();
    await store.initialise();
    expect(server.patches).toEqual([{ locale: "en", default_number: 1234 }]);
    connect();
    expect(store.shownSession).toEqual({
      nickname: "Player 1234",
      locale: "en",
      default_number: 1234,
    });
  });

  it("leaves a session that was not new alone", async () => {
    native.last = { nickname: "曜宇", locale: "zh-TW", default_number: null };
    server.session = { nickname: "Ann", locale: "zh-TW", default_number: null };
    const store = useGameStore();
    await store.initialise();
    expect(server.patches).toEqual([]);
    connect();
    expect(store.shownSession?.nickname).toBe("Ann");
    expect(native.last).toEqual(server.session);
  });

  it("keeps the device's name on screen when the network fails, and tries again", async () => {
    native.last = { nickname: "曜宇", locale: "zh-TW", default_number: null };
    server.created = true;
    server.failPatch = "network";
    const store = useGameStore();
    await store.initialise();
    expect(native.restore).toBe(true);
    connect();
    expect(store.shownSession?.nickname).toBe("曜宇");
    expect(native.last).toEqual({
      nickname: "曜宇",
      locale: "zh-TW",
      default_number: null,
    });

    // The next connection sends it again, first.
    server.failPatch = null;
    FakeWebSocket.instances.at(-1)!.emit("close");
    await vi.advanceTimersByTimeAsync(500);
    await settle();
    expect(server.patches).toHaveLength(2);
    expect(native.restore).toBe(false);
    connect();
    expect(store.shownSession?.nickname).toBe("曜宇");
  });

  it("takes the server's profile when the server refuses the device's", async () => {
    native.last = { nickname: "曜宇", locale: "en", default_number: null };
    server.created = true;
    server.failPatch = 422;
    const store = useGameStore();
    await store.initialise();
    connect();
    expect(store.shownSession?.nickname).toBe("玩家 4553");
    expect(i18n.global.locale.value).toBe("zh-TW");
    expect(native.last).toEqual(server.session);
    expect(native.restore).toBe(false);
  });

  it("works with a server that sends no default_number", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ nickname: "Ann", locale: "en" }),
      })),
    );
    const store = useGameStore();
    await store.initialise();
    expect(store.syncProfile()).toEqual({
      nickname: "Ann",
      locale: "en",
      default_number: null,
    });
  });
});

describe("a default nickname and the language (05)", () => {
  async function online() {
    const store = useGameStore();
    await store.initialise();
    connect();
    return store;
  }

  async function offline(store: ReturnType<typeof useGameStore>) {
    FakeWebSocket.instances.at(-1)!.emit("close");
    for (const wait of [2000, 1000, 2000]) {
      await vi.advanceTimersByTimeAsync(wait);
      await settle();
      FakeWebSocket.instances.at(-1)!.emit("close");
    }
    expect(store.serverConnection).toBe("offline");
  }

  it("follows the language online, by its number", async () => {
    const store = await online();
    await store.saveProfile("玩家 4553", "en");
    expect(server.patches).toEqual([{ locale: "en", default_number: 4553 }]);
    expect(store.shownSession).toEqual({
      nickname: "Player 4553",
      locale: "en",
      default_number: 4553,
    });
  });

  it("follows the language offline at once, and syncs as a default", async () => {
    const store = await online();
    await offline(store);
    await store.saveProfile("玩家 4553", "en");
    expect(store.shownSession?.nickname).toBe("Player 4553");
    expect(server.patches).toEqual([]);

    await vi.advanceTimersByTimeAsync(5000);
    await settle();
    connect();
    await settle();
    expect(server.patches).toEqual([{ locale: "en", default_number: 4553 }]);
    expect(store.shownSession?.nickname).toBe("Player 4553");
  });

  it("stays a default when the same name is typed again", async () => {
    const store = await online();
    await store.saveProfile("  玩家 4553 ", "zh-TW");
    expect(server.patches).toEqual([{ locale: "zh-TW", default_number: 4553 }]);
  });

  it("becomes the player's own once the name changes", async () => {
    const store = await online();
    await store.saveProfile("曜宇", "zh-TW");
    expect(server.patches).toEqual([
      { nickname: "曜宇", locale: "zh-TW", default_number: null },
    ]);
  });

  it("never renames a name the player chose, even one like a default", async () => {
    server.session = {
      nickname: "玩家 1234",
      locale: "zh-TW",
      default_number: null,
    };
    const store = await online();
    await store.saveProfile("玩家 1234", "en");
    expect(server.patches).toEqual([
      { nickname: "玩家 1234", locale: "en", default_number: null },
    ]);

    await offline(store);
    await store.saveProfile("玩家 1234", "zh-TW");
    expect(store.shownSession?.nickname).toBe("玩家 1234");
  });
});
