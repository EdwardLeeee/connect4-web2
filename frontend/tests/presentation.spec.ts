import { describe, expect, it } from "vitest";
import { pageSnapshot, type PageId } from "../e2e/states";
import type { Cell, Color, GameState } from "../src/types";
import {
  lastMove,
  movesSince,
  opponentOf,
  resultPanel,
  statusHead,
  type RoomMode,
} from "../src/utils/presentation";

function page(id: PageId) {
  const snapshot = pageSnapshot(id, "zh-TW");
  return {
    game: snapshot.game as GameState,
    mode: (snapshot.room?.mode ?? "ai") as RoomMode,
  };
}

function head(
  id: PageId,
  extra: Partial<Parameters<typeof statusHead>[0]> = {},
) {
  return statusHead({
    game: page(id).game,
    opponentName: "小安",
    online: true,
    reconnectedName: null,
    countdownSeconds: null,
    ...extra,
  });
}

function panel(id: PageId) {
  const { game, mode } = page(id);
  return resultPanel(game, mode, "小安");
}

describe("status chip (design/spec.md §4)", () => {
  it("shows your turn with the next move number", () => {
    expect(head("P03")).toMatchObject({
      tone: "mine",
      title: { key: "game.yourTurn" },
      chip: { key: "game.moveNo", args: { n: 7 } },
    });
  });

  it("shows your own colour on your turn when you play pink", () => {
    const game = { ...page("P04").game, turn: "pink" as const };
    expect(head("P04", { game })).toMatchObject({
      tone: "mine",
      token: "pink",
      title: { key: "game.yourTurn" },
    });
  });

  it("keeps the reconnected chip apart from your turn", () => {
    expect(head("P03", { reconnectedName: "小安" })).toMatchObject({
      tone: "back",
      token: "pink",
      title: { key: "game.reconnected", args: { name: "小安" } },
    });
  });

  it("shows the opponent thinking with dots", () => {
    expect(head("P04")).toMatchObject({ tone: "theirs", dots: true });
  });

  it("announces the AI as soon as it is its turn", () => {
    expect(head("P05")).toMatchObject({
      tone: "thinking",
      title: { key: "game.aiThinking" },
    });
  });

  it("counts down only while there is a deadline", () => {
    expect(head("P06", { countdownSeconds: 18 })).toMatchObject({
      tone: "paused",
      countdown: true,
    });
    expect(head("P06")).toMatchObject({ tone: "paused", countdown: false });
  });

  it("mutes the chip while offline", () => {
    expect(head("P14", { online: false })).toMatchObject({ tone: "muted" });
  });
});

describe("result panel (P07–P18)", () => {
  it.each([
    ["P07", "win", "game.win", ["again", "leave"], null],
    ["P08", "lose", "game.loseAi", ["again", "leave"], null],
    ["P09", "draw", "game.draw", ["again", "leave"], null],
    ["P10", "win", "game.forfeitWin", ["again", "leave"], null],
    ["P11", "win", "game.left", ["lobby"], null],
    ["P12", "error", "game.solverError", ["again", "leave"], null],
    ["P13", "win", "game.win", ["waiting", "leave"], "sent"],
    ["P16", "lose", "game.forfeitLose", ["again", "leave"], null],
    ["P17", "lose", "game.lose", ["accept", "leave"], "incoming"],
    ["P18", "win", "game.win", ["lobby"], "leftAfter"],
  ] as const)("%s", (id, tone, title, actions, rematch) => {
    expect(panel(id)).toMatchObject({
      tone,
      title: { key: title },
      actions,
      rematch,
    });
  });

  it.each([
    ["P07", "trophy"],
    ["P08", "flag"],
    ["P09", "equal"],
    ["P12", "warn"],
    ["P16", "wifiOff"],
  ] as const)("%s shows the %s badge, not a player colour", (id, emblem) => {
    expect(panel(id)?.emblem).toBe(emblem);
  });

  it("is absent while the game is on", () => {
    expect(panel("P03")).toBeNull();
    expect(panel("P06")).toBeNull();
  });
});

describe("last move", () => {
  it("takes the column from history and the colour from the first mover", () => {
    const { game } = page("P07");
    expect(lastMove(game)).toEqual({ row: 2, column: 4, colour: "green" });
    expect(lastMove({ ...game, first: "pink" })).toMatchObject({
      colour: "pink",
    });
  });
});

/** A game after playing `history` from an empty board. */
function played(history: string, first: Color = "green"): GameState {
  const board: Cell[][] = Array.from({ length: 6 }, () =>
    Array<Cell>(7).fill(null),
  );
  [...history].forEach((digit, index) => {
    const column = Number(digit) - 1;
    let row = board.length - 1;
    while (board[row][column] !== null) row -= 1;
    board[row][column] = index % 2 === 0 ? first : opponentOf(first);
  });
  return { ...page("P03").game, board, history, first };
}

describe("moves since", () => {
  it("places every new move, stacked ones included, oldest first", () => {
    expect(movesSince(played("4454"), 1)).toEqual([
      { row: 4, column: 3, colour: "pink" },
      { row: 5, column: 4, colour: "green" },
      { row: 3, column: 3, colour: "pink" },
    ]);
  });

  it("follows the first mover's colour", () => {
    expect(movesSince(played("45", "pink"), 0)).toEqual([
      { row: 5, column: 3, colour: "pink" },
      { row: 5, column: 4, colour: "green" },
    ]);
  });

  it("ends with the last move", () => {
    const game = played("3344");
    expect(movesSince(game, 3)).toEqual([lastMove(game)]);
    expect(movesSince(game, 4)).toEqual([]);
  });
});
