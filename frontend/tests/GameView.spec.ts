import { createPinia, setActivePinia } from "pinia";
import { createApp, nextTick, type App } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BOARDS, pageSnapshot } from "../e2e/states";
import { dropDuration } from "../src/composables/useDropQueue";
import { i18n } from "../src/i18n";
import { useGameStore } from "../src/stores/game";
import type { GameState, Snapshot } from "../src/types";
import { ENDING_TIMING } from "../src/utils/ending";
import GameView from "../src/views/GameView.vue";

let app: App | null = null;

/** P07 (a private game you win) and the snapshot one move before it. */
const finished = () => pageSnapshot("P07", "zh-TW");

function beforeWin(): Snapshot {
  const snapshot = finished();
  const game = snapshot.game!;
  const board = game.board.map((row) => [...row]);
  board[2][4] = null;
  return {
    ...snapshot,
    game: {
      ...game,
      revision: game.revision - 1,
      status: "playing",
      turn: "green",
      board,
      history: game.history.slice(0, -1),
      winner: null,
      result_reason: null,
      winning_cells: [],
      series: { you: 0, opponent: 0, draws: 0 },
    },
  };
}

function withGame(snapshot: Snapshot, change: Partial<GameState>): Snapshot {
  const game = snapshot.game!;
  return {
    ...snapshot,
    game: { ...game, ...change, revision: game.revision + 1 },
  };
}

// The winning token lands in row 2, then the C5 ending starts.
const LANDED = dropDuration(2) + 50;
const PANEL_AT = LANDED + ENDING_TIMING.win.panelAt;

async function playToWin() {
  setActivePinia(createPinia());
  const store = useGameStore();
  store.snapshot = beforeWin();
  store.connection = "online";
  const host = document.createElement("div");
  document.body.append(host);
  i18n.global.locale.value = "zh-TW";
  app = createApp(GameView);
  app.use(i18n);
  app.mount(host);
  await nextTick();
  store.snapshot = finished();
  await nextTick();
  const card = () => host.querySelector<HTMLElement>(".result-card")!;
  return { store, host, card };
}

async function advance(ms: number) {
  vi.advanceTimersByTime(ms);
  await nextTick();
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  app?.unmount();
  app = null;
  document.body.replaceChildren();
  vi.useRealTimers();
});

describe("round 7 endings in the game view", () => {
  it("shows a snapshot that arrives mid-ending in the panel, on time", async () => {
    const { store, card } = await playToWin();
    await advance(LANDED + 1000);
    expect(document.querySelector(".ending-scene")).not.toBeNull();
    expect(card().classList).toContain("is-held");

    // The opponent asks for a rematch while the sticker is on screen.
    store.snapshot = withGame(store.snapshot!, {
      rematch: { green: false, pink: true },
    });
    await nextTick();
    // The timeline is not restarted by the new snapshot.
    await advance(PANEL_AT - LANDED - 1000 - 1);
    expect(card().classList).toContain("is-held");
    await advance(1);
    expect(card().classList).not.toContain("is-held");
    expect(card().textContent).toContain("好，再來一局");

    // Leaving afterwards still updates the panel it already shows.
    store.snapshot = withGame(store.snapshot!, { rematch_available: false });
    await nextTick();
    expect(card().textContent).toContain("回到大廳");
  });

  it("shows the leave when the opponent leaves mid-ending", async () => {
    const { store, card } = await playToWin();
    await advance(LANDED + 500);
    store.snapshot = withGame(store.snapshot!, { rematch_available: false });
    await nextTick();
    await advance(PANEL_AT - LANDED - 500);
    expect(card().classList).not.toContain("is-held");
    expect(card().textContent).toContain("小安 已離開房間，無法再來一局。");
  });

  it("cancels the whole timeline when you leave the game view", async () => {
    await playToWin();
    await advance(LANDED + 1000);
    expect(document.querySelector(".ending-scene")).not.toBeNull();
    app!.unmount();
    app = null;
    expect(document.querySelector(".ending-scene")).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cancels it when the next game starts", async () => {
    const { store, host } = await playToWin();
    await advance(LANDED + 1000);
    store.snapshot = withGame(store.snapshot!, {
      status: "playing",
      board: BOARDS.EMPTY,
      history: "",
      first: "pink",
      turn: "pink",
      winner: null,
      result_reason: null,
      winning_cells: [],
      rematch: { green: false, pink: false },
    });
    await nextTick();
    expect(document.querySelector(".ending-scene")).toBeNull();
    expect(host.querySelector(".board")!.className).not.toMatch(/ending-/);
    expect(host.querySelector(".result-card")).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });
});
