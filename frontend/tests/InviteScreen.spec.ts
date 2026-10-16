import { createPinia, setActivePinia } from "pinia";
import { createApp, h, nextTick, type App } from "vue";
import { createMemoryHistory, createRouter } from "vue-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { i18n } from "../src/i18n";
import type { Snapshot } from "../src/types";

vi.mock("../src/native", () => ({
  isNative: () => true,
  usesLocalAi: () => true,
  tokenStore: { get: async () => null, set: async () => {} },
  localGameStore: { get: async () => null, set: async () => {} },
  profileMemory: {
    lastSession: async () => null,
    rememberSession: async () => {},
    pendingProfile: async () => null,
    setPendingProfile: async () => {},
    restorePending: async () => false,
    setRestorePending: async () => {},
  },
  nativeShare: vi.fn(),
}));

let app: App | null = null;

const session = {
  nickname: "Ann",
  locale: "en",
  default_number: null,
} as const;
const aiGame = {
  revision: 3,
  status: "playing",
  board: Array.from({ length: 6 }, () => Array(7).fill(null)),
  history: "44",
  first: "green",
  turn: "green",
  you: "green",
  winner: null,
  winning_cells: [],
  result_reason: null,
  players: {},
  rematch: { green: false, pink: false },
  rematch_requested: false,
  rematch_available: false,
  series: { you: 0, opponent: 0, draws: 0 },
  grace_deadline: null,
};

/** The invite page over an on-device AI game (or over nothing). */
async function mountInvite({ onDevice = true, connection = "online" } = {}) {
  const { default: InviteScreen } =
    await import("../src/components/InviteScreen.vue");
  const { useGameStore } = await import("../src/stores/game");
  setActivePinia(createPinia());
  const store = useGameStore();
  const server = {
    server_time: 1,
    session,
    queue: { searching: false },
    room: null,
    game: null,
  } as Snapshot;
  store.serverSnapshot = server;
  store.connection = connection as "online" | "offline";
  if (onDevice) {
    store.source = "local";
    store.snapshot = {
      ...server,
      room: { id: "local-1", code: null, mode: "ai" },
      game: aiGame,
    } as unknown as Snapshot;
  } else {
    store.snapshot = server;
  }
  const sent: string[] = [];
  vi.spyOn(store, "send").mockImplementation((type: string) => {
    sent.push(type);
  });
  const saveProfile = vi.spyOn(store, "saveProfile").mockResolvedValue();
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/", component: { render: () => null } },
      { path: "/play", component: { render: () => null } },
    ],
  });
  await router.push("/?room=LAN427");
  i18n.global.locale.value = "en";
  const host = document.createElement("div");
  document.body.append(host);
  app = createApp({ render: () => h(InviteScreen, { code: "LAN427" }) });
  app.use(router).use(i18n);
  app.mount(host);
  await nextTick();
  const button = (name: string) =>
    [...host.querySelectorAll("button")].find((b) =>
      b.textContent?.includes(name),
    )!;
  return { host, sent, saveProfile, router, button };
}

afterEach(() => {
  app?.unmount();
  app = null;
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.resetModules();
  i18n.global.locale.value = "zh-TW";
});

describe("an invite over an on-device AI game (invite first)", () => {
  it("ends the AI game before joining the friend's room", async () => {
    const { sent, button } = await mountInvite();
    button("Join room").click();
    await nextTick();
    expect(sent).toEqual(["game.leave", "room.join"]);
  });

  it("keeps the AI game when the nickname cannot be saved", async () => {
    const { sent, saveProfile, button, host } = await mountInvite();
    const { ProfileError } = await import("../src/stores/game");
    saveProfile.mockRejectedValue(new ProfileError("invalid_nickname"));
    const input = host.querySelector("input")!;
    input.value = "Bob";
    input.dispatchEvent(new Event("input"));
    button("Join room").click();
    await nextTick();
    await nextTick();
    expect(sent).toEqual([]);
  });

  it("cannot join, nor end the game, while the server is out of reach", async () => {
    const { sent, button } = await mountInvite({ connection: "offline" });
    expect(button("Join room").disabled).toBe(true);
    button("Join room").click();
    await nextTick();
    expect(sent).toEqual([]);
  });

  it("goes back to the AI game when the guest does not join", async () => {
    const { router, button, sent } = await mountInvite();
    button("Not now").click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(router.currentRoute.value.fullPath).toBe("/play");
    expect(sent).toEqual([]);
  });
});

describe("an invite with no game waiting", () => {
  it("joins straight away and goes to the lobby when not joining", async () => {
    const { sent, button, router } = await mountInvite({ onDevice: false });
    button("Join room").click();
    await nextTick();
    expect(sent).toEqual(["room.join"]);
    button("Not now").click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(router.currentRoute.value.fullPath).toBe("/");
  });
});
