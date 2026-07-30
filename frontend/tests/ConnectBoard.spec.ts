import { createApp, nextTick, type App } from "vue";
import { createI18n } from "vue-i18n";
import { afterEach, describe, expect, it } from "vitest";
import ConnectBoard from "../src/components/ConnectBoard.vue";

const i18n = createI18n({
  legacy: false,
  locale: "en",
  messages: {
    en: {
      common: { brand: "Connect 4" },
      game: { playColumn: "Play column {column}" },
    },
  },
});

const board = Array.from({ length: 6 }, () => Array<null>(7).fill(null));
const mountedApps: App[] = [];

function mountBoard(disabled: boolean) {
  const moves: number[] = [];
  const host = document.createElement("div");
  document.body.append(host);
  const app = createApp(ConnectBoard, {
    board,
    disabled,
    winningCells: [],
    onMove: (column: number) => moves.push(column),
  });
  app.use(i18n);
  app.mount(host);
  mountedApps.push(app);
  return { host, moves };
}

afterEach(() => {
  for (const app of mountedApps.splice(0)) app.unmount();
  document.body.replaceChildren();
});

describe("ConnectBoard", () => {
  it("emits a zero-based column for touch input", async () => {
    const { host, moves } = mountBoard(false);
    host
      .querySelectorAll<HTMLButtonElement>(".column-targets button")[3]
      .click();
    await nextTick();
    expect(moves).toEqual([3]);
  });

  it("ignores keyboard input and blocks disabled input", async () => {
    const enabled = mountBoard(false);
    const boardElement =
      enabled.host.querySelector<HTMLElement>(".board-wrap")!;
    for (const key of ["7", "ArrowLeft", "Enter", " "]) {
      boardElement.dispatchEvent(
        new KeyboardEvent("keydown", { key, bubbles: true }),
      );
    }
    await nextTick();
    expect(enabled.moves).toEqual([]);
    expect(boardElement.hasAttribute("tabindex")).toBe(false);
    expect(
      [...enabled.host.querySelectorAll(".column-targets button")].every(
        (button) => (button as HTMLButtonElement).tabIndex === -1,
      ),
    ).toBe(true);

    const disabled = mountBoard(true);
    disabled.host
      .querySelector<HTMLButtonElement>(".column-targets button")!
      .click();
    await nextTick();
    expect(disabled.moves).toEqual([]);
  });
});
