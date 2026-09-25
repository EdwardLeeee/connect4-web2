import { createApp, defineComponent, ref, type App } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pageSnapshot, type PageId } from "../e2e/states";
import { useEnding } from "../src/composables/useEnding";
import type { GameState } from "../src/types";
import { ENDING_TIMING, endingFor } from "../src/utils/ending";

const game = (id: PageId) => pageSnapshot(id, "zh-TW").game as GameState;

describe("which ending a live finish plays", () => {
  it("plays C5 with the move count for four in a row", () => {
    expect(endingFor(game("P07"), "小安")).toEqual({
      kind: "win",
      line: true,
      title: { key: "game.stickerWin" },
      sub: { key: "game.stickerWinSub", args: { n: 13 } },
      skippable: true,
    });
  });

  it("says why you won when there is no line (forfeit, leave)", () => {
    expect(endingFor(game("P10"), "小安")).toMatchObject({
      kind: "win",
      line: false,
      sub: { key: "game.forfeitWinSub" },
    });
    expect(endingFor(game("P11"), "小安")).toMatchObject({
      kind: "win",
      line: false,
      sub: { key: "game.leftSub" },
    });
  });

  it("plays F5 with the opponent's name and T5 for a draw", () => {
    expect(endingFor(game("P08"), "Super AI")).toMatchObject({
      kind: "lose",
      line: true,
      sub: { key: "game.stickerLoseSub", args: { name: "Super AI" } },
    });
    expect(endingFor(game("P09"), "小安")).toMatchObject({
      kind: "draw",
      line: false,
    });
  });

  it("has none for a solver error or a game still on", () => {
    expect(endingFor(game("P12"), "Super AI")).toBeNull();
    expect(endingFor(game("P03"), "Super AI")).toBeNull();
  });
});

let app: App | null = null;

function mountTimeline(reduced = false) {
  let timeline!: ReturnType<typeof useEnding>;
  app = createApp(
    defineComponent({
      setup() {
        timeline = useEnding(ref(reduced));
        return () => null;
      },
    }),
  );
  app.mount(document.createElement("div"));
  return timeline;
}

describe("ending timeline", () => {
  const win = endingFor(game("P07"), "小安")!;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    app?.unmount();
    app = null;
    vi.useRealTimers();
  });

  it("waits for the last token, then holds the panel until its time", () => {
    const timeline = mountTimeline();
    timeline.start(win, 400);
    expect(timeline.stage.value).toBe("waiting");
    expect(timeline.panelHeld.value).toBe(true);

    vi.advanceTimersByTime(400);
    expect(timeline.stage.value).toBe("playing");
    vi.advanceTimersByTime(ENDING_TIMING.win.panelAt - 1);
    expect(timeline.panelHeld.value).toBe(true);
    vi.advanceTimersByTime(1);
    expect(timeline.panelHeld.value).toBe(false);
    expect(timeline.panelEntering.value).toBe(true);

    vi.advanceTimersByTime(ENDING_TIMING.win.endsAt);
    expect(timeline.stage.value).toBe("done");
    // The board keeps the ending's last frame (gold line) afterwards.
    expect(timeline.ending.value).toEqual(win);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("jumps to the panel on a tap", () => {
    const timeline = mountTimeline();
    timeline.start(win, 0);
    vi.advanceTimersByTime(1000);
    timeline.skip();
    expect(timeline.stage.value).toBe("done");
    expect(timeline.skipped.value).toBe(true);
    expect(timeline.panelHeld.value).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("only brings the panel in with reduced motion or without an ending", () => {
    const reduced = mountTimeline(true);
    reduced.start(win, 0);
    expect(reduced.ending.value).toBeNull();
    expect(reduced.panelEntering.value).toBe(true);
    app!.unmount();

    const error = mountTimeline();
    error.start(null, 0);
    expect(error.ending.value).toBeNull();
    expect(error.stage.value).toBe("done");
    expect(error.panelEntering.value).toBe(true);
  });
});
