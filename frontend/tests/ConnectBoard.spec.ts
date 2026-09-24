import { createApp, h, nextTick, reactive, type App } from "vue";
import { afterEach, describe, expect, it } from "vitest";
import ConnectBoard from "../src/components/ConnectBoard.vue";
import type { DropState } from "../src/composables/useDropQueue";
import { i18n } from "../src/i18n";
import type { Cell } from "../src/types";

const empty = (): Cell[][] =>
  Array.from({ length: 6 }, () => Array<Cell>(7).fill(null));
const mountedApps: App[] = [];

function mountBoard(options: { interactive: boolean; board?: Cell[][] }) {
  const moves: number[] = [];
  const announcements: string[] = [];
  const host = document.createElement("div");
  document.body.append(host);
  const app = createApp(ConnectBoard, {
    board: options.board ?? empty(),
    you: "green",
    interactive: options.interactive,
    winningCells: [],
    last: null,
    drops: {},
    ending: null,
    skipped: false,
    finished: false,
    overlay: null,
    onMove: (column: number) => moves.push(column),
    onAnnounce: (text: string) => announcements.push(text),
  });
  i18n.global.locale.value = "en";
  app.use(i18n);
  app.mount(host);
  mountedApps.push(app);
  const targets = () => [
    ...host.querySelectorAll<HTMLButtonElement>(".col-target"),
  ];
  return { host, moves, announcements, targets };
}

/** A board whose moves and drops change while it stays mounted. */
function mountLiveBoard() {
  const state = reactive({
    board: empty(),
    last: null as { row: number; column: number } | null,
    drops: {} as Record<string, DropState>,
  });
  const host = document.createElement("div");
  document.body.append(host);
  const app = createApp({
    render: () =>
      h(ConnectBoard, {
        board: state.board,
        you: "green",
        interactive: false,
        winningCells: [],
        last: state.last,
        drops: state.drops,
        ending: null,
        skipped: false,
        finished: false,
        overlay: null,
      }),
  });
  app.use(i18n);
  app.mount(host);
  mountedApps.push(app);
  const cell = (row: number, column: number) =>
    host.querySelectorAll<HTMLElement>(".grid .cell")[row * 7 + column];
  return { state, cell };
}

function pointer(type: string, x: number, pointerType = "touch") {
  const event = new MouseEvent(type, {
    bubbles: true,
    clientX: x,
    clientY: 50,
  });
  Object.defineProperty(event, "pointerType", { value: pointerType });
  Object.defineProperty(event, "pointerId", { value: 1 });
  return event;
}

// jsdom has no layout: give the board seven 100px columns.
function layOut(host: HTMLElement) {
  const rect = {
    left: 0,
    top: 0,
    right: 700,
    bottom: 600,
    width: 700,
    height: 600,
  };
  for (const selector of [".board", ".col-targets"]) {
    host.querySelector<HTMLElement>(selector)!.getBoundingClientRect = () =>
      ({ ...rect, x: 0, y: 0, toJSON: () => rect }) as DOMRect;
  }
}

afterEach(() => {
  for (const app of mountedApps.splice(0)) app.unmount();
  document.body.replaceChildren();
});

describe("ConnectBoard", () => {
  it("reports a zero-based column when a column is activated", async () => {
    const { moves, targets } = mountBoard({ interactive: true });
    targets()[3].click();
    await nextTick();
    expect(moves).toEqual([3]);
  });

  it("ignores input when it is not your turn", async () => {
    const { moves, targets } = mountBoard({ interactive: false });
    targets()[3].click();
    await nextTick();
    expect(moves).toEqual([]);
    expect(targets()[3].getAttribute("aria-disabled")).toBe("true");
  });

  it("keeps one tab stop that arrow, Home and End keys move", async () => {
    const { targets } = mountBoard({ interactive: true });
    const tabStops = () =>
      targets()
        .map((button, index) => (button.tabIndex === 0 ? index : -1))
        .filter((index) => index >= 0);
    expect(tabStops()).toEqual([3]);

    targets()[3].dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
    );
    await nextTick();
    expect(tabStops()).toEqual([4]);
    expect(document.activeElement).toBe(targets()[4]);

    targets()[4].dispatchEvent(
      new KeyboardEvent("keydown", { key: "End", bubbles: true }),
    );
    await nextTick();
    expect(tabStops()).toEqual([6]);

    targets()[6].dispatchEvent(
      new KeyboardEvent("keydown", { key: "Home", bubbles: true }),
    );
    await nextTick();
    expect(tabStops()).toEqual([0]);
  });

  it("announces a full column instead of playing it", async () => {
    const board = empty();
    for (const row of board) row[2] = "pink";
    const { moves, announcements, targets } = mountBoard({
      interactive: true,
      board,
    });
    targets()[2].click();
    await nextTick();
    expect(moves).toEqual([]);
    expect(announcements).toEqual(["Column 3 is full"]);
    expect(targets()[2].getAttribute("aria-label")).toBe("Column 3 is full");
  });

  it("drops where a touch is released and cancels off the board", async () => {
    const { host, moves } = mountBoard({ interactive: true });
    layOut(host);
    const targets = host.querySelector<HTMLElement>(".col-targets")!;

    targets.dispatchEvent(pointer("pointerdown", 150));
    targets.dispatchEvent(pointer("pointermove", 550));
    await nextTick();
    expect(host.querySelector(".hand")).not.toBeNull();
    targets.dispatchEvent(pointer("pointerup", 550));
    await nextTick();
    expect(moves).toEqual([5]);

    targets.dispatchEvent(pointer("pointerdown", 150));
    targets.dispatchEvent(pointer("pointerup", 900));
    await nextTick();
    expect(moves).toEqual([5]);
    expect(host.querySelector(".hand")).toBeNull();
  });

  it("keeps a falling token when the next move arrives (A01)", async () => {
    const { state, cell } = mountLiveBoard();
    state.board[5][3] = "green";
    state.last = { row: 5, column: 3 };
    state.drops = { "5:3": "dropping" };
    await nextTick();
    const yours = cell(5, 3).querySelector(".token")!;
    expect(yours.classList).toContain("is-dropping");

    state.board[4][3] = "pink";
    state.last = { row: 4, column: 3 };
    state.drops = { "5:3": "dropping", "4:3": "queued" };
    await nextTick();
    expect(cell(5, 3).querySelector(".token")).toBe(yours);
    expect(yours.classList).toContain("is-dropping");
    const reply = cell(4, 3).querySelector(".token")!;
    expect(reply.classList).toContain("is-queued");
    // The last-move frame waits until the token has landed.
    expect(cell(4, 3).classList).not.toContain("is-last");

    state.drops = {};
    await nextTick();
    expect(reply.classList).not.toContain("is-queued");
    expect(cell(4, 3).classList).toContain("is-last");
  });
});
