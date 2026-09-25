import { createApp, nextTick, type App } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pageSnapshot } from "../e2e/states";
import ResultCard from "../src/components/ResultCard.vue";
import { i18n } from "../src/i18n";
import type { GameState } from "../src/types";
import { resultPanel } from "../src/utils/presentation";

// Narrow screens 02: the result buttons stack only when a label does not fit.
class FakeResizeObserver {
  static last: FakeResizeObserver | null = null;
  constructor(readonly callback: ResizeObserverCallback) {
    FakeResizeObserver.last = this;
  }
  observe() {}
  disconnect() {}
  resize(width: number, height: number) {
    this.callback(
      [{ contentRect: { width, height } } as ResizeObserverEntry],
      this as unknown as ResizeObserver,
    );
  }
}

let app: App | null = null;

async function mountCard() {
  const game = pageSnapshot("P08", "en").game as GameState;
  const host = document.createElement("div");
  document.body.append(host);
  i18n.global.locale.value = "en";
  app = createApp(ResultCard, {
    result: resultPanel(game, "ai", "Super AI")!,
    mode: "ai",
    opponent: "pink",
    opponentName: "Super AI",
    youMoveFirst: true,
    entering: false,
    held: false,
  });
  app.use(i18n);
  app.mount(host);
  await nextTick();
  return host.querySelector<HTMLElement>(".result-actions")!;
}

/**
 * jsdom has no layout: give the row and its buttons widths. A label of
 * `needed` px fits in a side-by-side button only when the row is wide
 * enough; stacked, each button spans the row. Reads are counted.
 */
function layOut(actions: HTMLElement, row: { width: number }, needed: number) {
  const reads = { count: 0 };
  const stacked = () => actions.classList.contains("is-stacked");
  const buttonWidth = () => (stacked() ? row.width : (row.width - 10) / 2);
  Object.defineProperty(actions, "clientWidth", { get: () => row.width });
  Object.defineProperty(actions, "scrollWidth", { get: () => row.width });
  for (const button of actions.children) {
    Object.defineProperty(button, "clientWidth", { get: buttonWidth });
    Object.defineProperty(button, "scrollWidth", {
      get: () => {
        reads.count += 1;
        return Math.max(needed, buttonWidth());
      },
    });
  }
  return reads;
}

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
});

afterEach(() => {
  app?.unmount();
  app = null;
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe("result buttons on narrow screens", () => {
  it("stacks, main action first, when a label would be cut", async () => {
    const actions = await mountCard();
    const row = { width: 280 };
    layOut(actions, row, 160);
    FakeResizeObserver.last!.resize(280, 60);
    await nextTick();
    expect(actions.classList).toContain("is-stacked");
    // The main action comes first in the DOM; CSS keeps it on top.
    expect(actions.firstElementChild?.classList).toContain("primary");
  });

  it("does not refit, or flip back and forth, when only the height changes", async () => {
    const actions = await mountCard();
    const row = { width: 280 };
    const reads = layOut(actions, row, 160);
    const observer = FakeResizeObserver.last!;
    observer.resize(280, 60);
    await nextTick();
    const afterFirst = reads.count;
    const seen: boolean[] = [];

    // Stacking makes the row taller: the observer fires again at the same width.
    for (const height of [120, 124, 120]) {
      observer.resize(280, height);
      await nextTick();
      seen.push(actions.classList.contains("is-stacked"));
    }
    expect(reads.count).toBe(afterFirst);
    expect(seen).toEqual([true, true, true]);
  });

  it("goes back side by side when the row widens enough", async () => {
    const actions = await mountCard();
    const row = { width: 280 };
    layOut(actions, row, 160);
    FakeResizeObserver.last!.resize(280, 60);
    await nextTick();
    expect(actions.classList).toContain("is-stacked");

    row.width = 400;
    FakeResizeObserver.last!.resize(400, 120);
    await nextTick();
    expect(actions.classList).not.toContain("is-stacked");
  });
});
