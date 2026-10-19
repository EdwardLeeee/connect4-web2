import { createPinia, setActivePinia } from "pinia";
import { createApp, nextTick, type App } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { aiVariant, BOARDS, pageSnapshot } from "../e2e/states";
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

describe("your move drops as you let go (A1)", () => {
  /** P03 after your move in column 5 and, optionally, the AI's in column 2. */
  function played(start: Snapshot, reply: boolean): Snapshot {
    const game = start.game!;
    const board = game.board.map((row) => [...row]);
    board[3][4] = "green";
    if (reply) board[5][1] = "pink";
    return {
      ...start,
      game: {
        ...game,
        revision: game.revision + (reply ? 2 : 1),
        status: reply ? "playing" : "thinking",
        turn: reply ? "green" : "pink",
        board,
        history: `${game.history}${reply ? "52" : "5"}`,
      },
    };
  }

  async function yourTurn() {
    setActivePinia(createPinia());
    const store = useGameStore();
    const start = pageSnapshot("P03", "zh-TW");
    store.snapshot = start;
    store.connection = "online";
    const sent: string[] = [];
    store.socket = {
      readyState: WebSocket.OPEN,
      send: (data: string) => sent.push(JSON.parse(data).type),
    } as unknown as WebSocket;
    const host = document.createElement("div");
    document.body.append(host);
    i18n.global.locale.value = "zh-TW";
    app = createApp(GameView);
    app.use(i18n);
    app.mount(host);
    await nextTick();
    const token = (row: number, column: number) =>
      host
        .querySelectorAll(".grid .cell")
        [row * 7 + column].querySelector(".token");
    const tap = async (column: number) => {
      host.querySelectorAll<HTMLButtonElement>(".col-target")[column].click();
      await nextTick();
    };
    /** What the socket handler does with the server's answer. */
    const answer = async (snapshot: Snapshot) => {
      store.snapshot = snapshot;
      store.settleMove();
      await nextTick();
    };
    return { store, start, sent, token, tap, answer };
  }

  it("drops at once, and the same token drops on when the server confirms", async () => {
    const { store, start, sent, token, tap, answer } = await yourTurn();
    await tap(4);
    const mine = token(3, 4)!;
    expect(mine.classList).toContain("green");
    expect(mine.classList).toContain("is-dropping");
    expect(sent).toEqual(["game.move"]);
    expect(store.canMove).toBe(false);

    await advance(100);
    await answer(played(start, false));
    expect(token(3, 4)).toBe(mine);
    expect(mine.classList).toContain("is-dropping");

    await advance(dropDuration(3) - 100 + 50);
    expect(mine.classList).not.toContain("is-dropping");
    expect(mine.parentElement!.classList).toContain("is-last");
  });

  it("does not drop it again when the answer comes after it landed", async () => {
    const { start, token, tap, answer } = await yourTurn();
    await tap(4);
    await advance(dropDuration(3) + 200);
    await answer(played(start, false));
    expect(token(3, 4)!.className).not.toMatch(/is-dropping|is-queued/);
  });

  it("queues an instant AI reply behind your token", async () => {
    const { start, token, tap, answer } = await yourTurn();
    await tap(4);
    await advance(100);
    await answer(played(start, true));
    expect(token(3, 4)!.classList).toContain("is-dropping");
    expect(token(5, 1)!.classList).toContain("is-queued");
    await advance(dropDuration(3) - 100);
    expect(token(5, 1)!.classList).toContain("is-dropping");
  });

  it("takes the token back when the server turns the move down", async () => {
    const { store, token, tap } = await yourTurn();
    await tap(4);
    expect(token(3, 4)).not.toBeNull();

    // What the socket handler does with an error.
    store.errorCode = "not_your_turn";
    store.pendingMove = null;
    await nextTick();
    expect(token(3, 4)).toBeNull();
    expect(store.canMove).toBe(true);
  });
});

describe("an AI game at a level, in your colour (R29 06-A, 07, 09)", () => {
  async function show(snapshot: Snapshot, locale: "zh-TW" | "en" | "th") {
    setActivePinia(createPinia());
    const store = useGameStore();
    store.snapshot = snapshot;
    store.connection = "online";
    const host = document.createElement("div");
    document.body.append(host);
    i18n.global.locale.value = locale;
    app = createApp(GameView);
    app.use(i18n);
    app.mount(host);
    await nextTick();
    const text = (selector: string) =>
      [...host.querySelectorAll(selector)].map((e) => e.textContent!.trim());
    return { host, text };
  }

  it("names the AI by its level, with you pink and first", async () => {
    const { host, text } = await show(
      aiVariant(pageSnapshot("P03", "zh-TW"), {
        difficulty: "normal",
        you: "pink",
      }),
      "zh-TW",
    );
    expect(text(".mode-label")).toEqual(["挑戰 普通 AI"]);
    expect(text(".match-card .player strong")).toEqual(["普通 AI", "曜宇"]);
    expect(text(".match-card .player small")).toEqual([
      "後手 · 普通",
      "你 · 先手",
    ]);
    expect(host.querySelector(".game")!.classList).toContain("you-pink");
    expect(text(".turn-status")[0]).toContain("輪到你了");
  });

  it("opens with the AI thinking when it starts (09)", async () => {
    const { host, text } = await show(
      aiVariant(pageSnapshot("P05", "zh-TW"), {
        difficulty: "easy",
        you: "pink",
        aiFirst: true,
        opening: "thinking",
      }),
      "zh-TW",
    );
    expect(host.querySelector(".board-head")!.classList).toContain("thinking");
    expect(text(".turn-status")[0]).toContain("AI 正在思考");
    expect(text(".board-head")[0]).toContain("第 1 手");
    expect(text(".match-card .player small")).toEqual([
      "先手 · 簡單",
      "你 · 後手",
    ]);
    expect(text(".info-card strong")[0]).toBe("簡單 AI");
    expect(host.querySelectorAll(".board .token").length).toBe(0);
  });

  it("names it in English and Thai", async () => {
    const english = await show(
      aiVariant(pageSnapshot("P03", "en"), { difficulty: "easy" }),
      "en",
    );
    expect(english.text(".mode-label")).toEqual(["vs Easy AI"]);
    expect(english.text(".match-card .player small")[1]).toBe("Second · Easy");
    app!.unmount();
    document.body.replaceChildren();
    const thai = await show(
      aiVariant(pageSnapshot("P03", "th"), { difficulty: "normal" }),
      "th",
    );
    expect(thai.text(".match-card .player strong")[1]).toBe("AI\u00A0ปกติ");
    expect(thai.text(".mode-label")).toEqual(["ท้าดวล\u00A0AI\u00A0ปกติ"]);
  });

  it("keeps Super AI for a server from before 3.5.0", async () => {
    const { text } = await show(pageSnapshot("P03", "zh-TW"), "zh-TW");
    expect(text(".mode-label")).toEqual(["挑戰 Super AI"]);
    expect(text(".match-card .player small")[1]).toBe("後手 · Super AI");
  });
});
