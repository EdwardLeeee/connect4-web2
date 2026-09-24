// Snapshots for the design/spec.md page IDs, ported from
// design/mockups/round2/states.js into the protocol shape (docs/protocol.md).
import type { Cell, GameState, Player, Snapshot } from "../src/types";

export const SERVER_TIME = 1_790_000_000;

function rows(...lines: string[]): Cell[][] {
  return lines.map((line) =>
    [...line].map((ch) => (ch === "G" ? "green" : ch === "P" ? "pink" : null)),
  );
}

/** A history of the right length whose last move is `lastColumn` (0-based). */
function history(moves: number, lastColumn: number | null): string {
  if (moves === 0 || lastColumn === null) return "";
  return "4".repeat(moves - 1) + String(lastColumn + 1);
}

export const BOARDS = {
  EMPTY: rows(".......", ".......", ".......", ".......", ".......", "......."),
  B7: rows(".......", ".......", ".......", ".......", "..GPG..", "..PGP.."),
  B8: rows(".......", ".......", ".......", "....G..", "..GPG..", "..PGP.."),
  B8m: rows(".......", ".......", ".......", "...P...", "..GGP..", ".PGPG.."),
  B11: rows(".......", ".......", "...G...", "...PG..", "..GGPP.", ".PGPGP."),
  B13win: rows(
    ".......",
    ".......",
    "....G..",
    "...GP..",
    "..GPGG.",
    "PGPGPP.",
  ),
  B12lose: rows(
    ".......",
    ".......",
    "....P..",
    "...GP..",
    "..GGP..",
    ".GPGPGP",
  ),
  BDRAW: rows("GGPPGGP", "PPGGPPG", "GGPPGGP", "PPGGPPG", "GGPPGGP", "PPGGPPG"),
};

function stones(board: Cell[][]) {
  return board.flat().filter(Boolean).length;
}

const person = (nickname: string, connected = true): Player => ({
  nickname,
  connected,
  is_ai: false,
  grace_deadline: null,
});
const me = person("曜宇");
const friend = person("小安");
const stranger = person("玩家 4821");
const ai: Player = {
  nickname: "Super AI",
  connected: true,
  is_ai: true,
  grace_deadline: null,
};

const GREEN_WIN = [
  { row: 5, column: 1 },
  { row: 4, column: 2 },
  { row: 3, column: 3 },
  { row: 2, column: 4 },
];
const PINK_COLUMN_WIN = [
  { row: 5, column: 4 },
  { row: 4, column: 4 },
  { row: 3, column: 4 },
  { row: 2, column: 4 },
];

function game(
  board: Cell[][],
  lastColumn: number | null,
  extra: Partial<GameState>,
): GameState {
  return {
    revision: 20,
    status: "playing",
    board,
    history: history(stones(board), lastColumn),
    first: "green",
    turn: "green",
    you: "green",
    winner: null,
    winning_cells: [],
    result_reason: null,
    players: { green: me, pink: ai },
    rematch: { green: false, pink: false },
    rematch_requested: false,
    rematch_available: false,
    series: { you: 0, opponent: 0, draws: 0 },
    grace_deadline: null,
    ...extra,
  };
}

function snapshot(
  locale: "zh-TW" | "en",
  room: Snapshot["room"],
  state: GameState | null,
  searching = false,
): Snapshot {
  return {
    server_time: SERVER_TIME,
    session: { nickname: locale === "zh-TW" ? "曜宇" : "Taylor", locale },
    queue: { searching },
    room,
    game: state,
  };
}

const AI_ROOM = { id: "ai-room", code: null, mode: "ai" } as const;
const PRIVATE_ROOM = {
  id: "private-room",
  code: "LAN427",
  mode: "private",
} as const;
const MATCH_ROOM = {
  id: "match-room",
  code: null,
  mode: "matchmaking",
} as const;

const aiGame = (board: Cell[][], last: number | null, extra = {}) =>
  game(board, last, extra);
const privateGame = (
  board: Cell[][],
  last: number | null,
  extra: Partial<GameState> = {},
) =>
  game(board, last, {
    players: { green: me, pink: friend },
    rematch_available: true,
    ...extra,
  });

export type PageId =
  | "L01"
  | "L02"
  | "L03"
  | "L04"
  | "L05"
  | "L06"
  | "L07"
  | "L08"
  | "L09"
  | "L10"
  | "L12"
  | "L13"
  | "L14"
  | "P01"
  | "P02"
  | "P03"
  | "P04"
  | "P05"
  | "P06"
  | "P07"
  | "P08"
  | "P09"
  | "P10"
  | "P11"
  | "P12"
  | "P13"
  | "P14"
  | "P15"
  | "P16"
  | "P17"
  | "P18";

/** The snapshot each page ID starts from; interactions are added by the test. */
export function pageSnapshot(id: PageId, locale: "zh-TW" | "en"): Snapshot {
  const lobby = snapshot(locale, null, null);
  switch (id) {
    case "L01":
    case "L02":
    case "L03":
    case "L04":
    case "L05":
    case "L06":
    case "L07":
    case "L08":
    case "L09":
    case "L10":
    case "L12":
    case "L13":
    case "L14":
      return lobby;
    case "P01":
      return snapshot(locale, null, null, true);
    case "P02":
      return snapshot(
        locale,
        PRIVATE_ROOM,
        game(BOARDS.EMPTY, null, {
          status: "waiting",
          players: { green: me },
        }),
      );
    case "P03":
      return snapshot(locale, AI_ROOM, aiGame(BOARDS.B7, 3));
    case "P04":
      return snapshot(
        locale,
        MATCH_ROOM,
        game(BOARDS.B8m, 3, {
          you: "pink",
          players: { green: stranger, pink: me },
          series: { you: 0, opponent: 0, draws: 0 },
          rematch_available: false,
        }),
      );
    case "P05":
      return snapshot(
        locale,
        AI_ROOM,
        aiGame(BOARDS.B8, 4, { status: "thinking", turn: "pink" }),
      );
    case "P06":
      return snapshot(
        locale,
        PRIVATE_ROOM,
        privateGame(BOARDS.B11, 5, {
          status: "paused",
          rematch_available: false,
          players: {
            green: me,
            pink: {
              ...friend,
              connected: false,
              grace_deadline: SERVER_TIME + 18,
            },
          },
          grace_deadline: SERVER_TIME + 18,
        }),
      );
    case "P07":
      return snapshot(
        locale,
        PRIVATE_ROOM,
        privateGame(BOARDS.B13win, 4, {
          status: "finished",
          turn: "pink",
          winner: "green",
          result_reason: "connect_four",
          winning_cells: GREEN_WIN,
          series: { you: 1, opponent: 0, draws: 0 },
        }),
      );
    case "P08":
      return snapshot(
        locale,
        AI_ROOM,
        aiGame(BOARDS.B12lose, 4, {
          status: "finished",
          winner: "pink",
          result_reason: "connect_four",
          winning_cells: PINK_COLUMN_WIN,
          rematch_available: true,
        }),
      );
    case "P09":
      return snapshot(
        locale,
        PRIVATE_ROOM,
        privateGame(BOARDS.BDRAW, 6, {
          status: "finished",
          result_reason: "draw",
          series: { you: 1, opponent: 1, draws: 1 },
        }),
      );
    case "P10":
      return snapshot(
        locale,
        PRIVATE_ROOM,
        privateGame(BOARDS.B11, 5, {
          status: "finished",
          winner: "green",
          result_reason: "forfeit",
          players: { green: me, pink: { ...friend, connected: false } },
        }),
      );
    case "P11":
      return snapshot(
        locale,
        PRIVATE_ROOM,
        privateGame(BOARDS.B11, 5, {
          status: "finished",
          winner: "green",
          result_reason: "left",
          rematch_available: false,
          players: { green: me, pink: { ...friend, connected: false } },
        }),
      );
    case "P12":
      return snapshot(
        locale,
        AI_ROOM,
        aiGame(BOARDS.B8, 4, {
          status: "error",
          turn: "pink",
          result_reason: "solver_unavailable",
          rematch_available: true,
        }),
      );
    case "P13":
      return snapshot(
        locale,
        PRIVATE_ROOM,
        privateGame(BOARDS.B13win, 4, {
          status: "finished",
          turn: "pink",
          winner: "green",
          result_reason: "connect_four",
          winning_cells: GREEN_WIN,
          series: { you: 1, opponent: 0, draws: 0 },
          rematch: { green: true, pink: false },
          rematch_requested: true,
        }),
      );
    case "P14":
    case "P15":
      return snapshot(locale, AI_ROOM, aiGame(BOARDS.B7, 3));
    case "P16":
      return snapshot(
        locale,
        PRIVATE_ROOM,
        privateGame(BOARDS.B11, 5, {
          status: "finished",
          winner: "pink",
          result_reason: "forfeit",
        }),
      );
    case "P17":
      return snapshot(
        locale,
        PRIVATE_ROOM,
        privateGame(BOARDS.B12lose, 4, {
          status: "finished",
          winner: "pink",
          result_reason: "connect_four",
          winning_cells: PINK_COLUMN_WIN,
          series: { you: 1, opponent: 1, draws: 0 },
          rematch: { green: false, pink: true },
        }),
      );
    case "P18":
      return snapshot(
        locale,
        PRIVATE_ROOM,
        privateGame(BOARDS.B13win, 4, {
          status: "finished",
          turn: "pink",
          winner: "green",
          result_reason: "connect_four",
          winning_cells: GREEN_WIN,
          series: { you: 1, opponent: 0, draws: 0 },
          rematch_available: false,
          players: { green: me, pink: { ...friend, connected: false } },
        }),
      );
  }
}
