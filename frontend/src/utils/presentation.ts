// What the play screen shows for a snapshot: the status chip above the board
// (design/spec.md §4) and the result panel (P07–P18). Pure, so each page ID
// can be checked without rendering.
import type { Cell, Color, GameState } from "../types";
import { gameOutcome } from "./outcome";

export type RoomMode = "ai" | "private" | "matchmaking";

export interface Text {
  key: string;
  args?: Record<string, string | number>;
}

export interface HeadModel {
  tone:
    | "mine"
    | "back"
    | "theirs"
    | "thinking"
    | "paused"
    | "error"
    | "muted"
    | "over";
  token: Color | "draw" | null;
  icon: "warn" | null;
  title: Text;
  hint: Text | null;
  chip: Text;
  /** The chip shows the grace countdown instead of the move number. */
  countdown: boolean;
  dots: boolean;
  note: Text | null;
}

export interface HeadInput {
  game: GameState;
  opponentName: string;
  online: boolean;
  /** Shown for two seconds after the opponent reconnects (A05). */
  reconnectedName: string | null;
  countdownSeconds: number | null;
}

export function opponentOf(colour: Color): Color {
  return colour === "green" ? "pink" : "green";
}

export function statusHead(input: HeadInput): HeadModel | null {
  const { game, opponentName, online } = input;
  const moves = game.history.length;
  const next: Text = { key: "game.moveNo", args: { n: moves + 1 } };
  const base = {
    icon: null,
    hint: null,
    countdown: false,
    dots: false,
    note: null,
  } as const;

  if (game.status === "finished") {
    return {
      ...base,
      tone: "over",
      token: game.winner ?? "draw",
      title: { key: "game.gameOver" },
      chip: { key: "game.movesTotal", args: { n: moves } },
    };
  }
  if (game.status === "error") {
    return {
      ...base,
      tone: "error",
      token: null,
      icon: "warn",
      title: { key: "game.solverError" },
      chip: next,
    };
  }
  // A04 (round 7): the AI is announced as soon as it is its turn.
  if (game.status === "thinking") {
    return {
      ...base,
      tone: "thinking",
      token: game.turn,
      title: { key: "game.aiThinking" },
      chip: next,
      dots: online,
    };
  }
  if (game.status === "paused") {
    const hasCountdown = input.countdownSeconds !== null;
    return {
      ...base,
      tone: "paused",
      token: opponentOf(game.you),
      title: { key: "game.paused", args: { name: opponentName } },
      chip: next,
      countdown: hasCountdown,
      note: { key: "game.pausedBody" },
    };
  }

  const mine = game.turn === game.you;
  if (!online) {
    return {
      ...base,
      tone: "muted",
      token: game.turn,
      title: mine
        ? { key: "game.yourTurn" }
        : { key: "game.opponentTurn", args: { name: opponentName } },
      chip: next,
    };
  }
  if (input.reconnectedName) {
    return {
      ...base,
      // Keeps the mint "back" chip; only your own turn follows your colour.
      tone: "back",
      token: opponentOf(game.you),
      title: { key: "game.reconnected", args: { name: input.reconnectedName } },
      chip: next,
    };
  }
  if (mine) {
    return {
      ...base,
      tone: "mine",
      token: game.you,
      title: { key: "game.yourTurn" },
      hint: { key: "game.yourTurnHint" },
      chip: next,
    };
  }
  return {
    ...base,
    tone: "theirs",
    token: game.turn,
    title: { key: "game.opponentTurn", args: { name: opponentName } },
    chip: next,
    dots: true,
  };
}

export type ResultAction = "again" | "accept" | "waiting" | "leave" | "lobby";

export interface ResultModel {
  tone: "win" | "lose" | "draw" | "error";
  /** Outcome badge; round 3 dropped the player colours from the panel. */
  emblem: "trophy" | "flag" | "equal" | "warn" | "wifiOff";
  title: Text;
  sub: Text;
  rematch: "sent" | "incoming" | "leftAfter" | null;
  actions: ResultAction[];
}

export function resultPanel(
  game: GameState,
  mode: RoomMode,
  opponentName: string,
): ResultModel | null {
  const name = { name: opponentName };
  const moves = { n: game.history.length };
  if (game.status === "error") {
    return {
      tone: "error",
      emblem: "warn",
      title: { key: "game.solverError" },
      sub: { key: "game.solverErrorBody" },
      rematch: null,
      actions: ["again", "leave"],
    };
  }

  const outcome = gameOutcome(game);
  if (!outcome) return null;
  let panel: ResultModel;
  switch (outcome) {
    case "draw":
      panel = {
        tone: "draw",
        emblem: "equal",
        title: { key: "game.draw" },
        sub: { key: "game.drawSub" },
        rematch: null,
        actions: ["again", "leave"],
      };
      break;
    case "leftWin":
      panel = {
        tone: "win",
        emblem: "trophy",
        title: { key: "game.left", args: name },
        sub: { key: "game.leftSub" },
        rematch: null,
        actions: [],
      };
      break;
    case "forfeitWin":
      panel = {
        tone: "win",
        emblem: "trophy",
        title: { key: "game.forfeitWin", args: name },
        sub: { key: "game.forfeitWinSub" },
        rematch: null,
        actions: ["again", "leave"],
      };
      break;
    case "forfeitLose":
      panel = {
        tone: "lose",
        emblem: "wifiOff",
        title: { key: "game.forfeitLose" },
        sub: { key: "game.forfeitLoseSub" },
        rematch: null,
        actions: ["again", "leave"],
      };
      break;
    case "win":
      panel = {
        tone: "win",
        emblem: "trophy",
        title: { key: "game.win" },
        sub: { key: "game.winSub", args: moves },
        rematch: null,
        actions: ["again", "leave"],
      };
      break;
    case "lose":
      panel = {
        tone: "lose",
        emblem: "flag",
        title:
          mode === "ai"
            ? { key: "game.loseAi" }
            : { key: "game.lose", args: name },
        sub:
          mode === "ai"
            ? { key: "game.loseAiSub" }
            : { key: "game.winSub", args: moves },
        rematch: null,
        actions: ["again", "leave"],
      };
      break;
  }

  // rematch_available comes from room membership; result_reason stays as it
  // was when the opponent leaves after the game was decided (P18).
  if (mode !== "ai") {
    const opponent = opponentOf(game.you);
    if (!game.rematch_available) {
      panel.actions = ["lobby"];
      if (game.result_reason !== "left") panel.rematch = "leftAfter";
    } else if (game.rematch[game.you]) {
      panel.actions = ["waiting", "leave"];
      panel.rematch = "sent";
    } else if (game.rematch[opponent]) {
      panel.actions = ["accept", "leave"];
      panel.rematch = "incoming";
    }
  }
  return panel;
}

export interface Move {
  row: number;
  column: number;
  colour: Color;
}

/**
 * Cells of the moves after the first `from` in history, oldest first. Each
 * move's column is its history digit; the new tokens are the top ones of
 * their columns on the current board, the latest highest.
 */
export function movesSince(game: GameState, from: number): Move[] {
  const moves = game.history.slice(from);
  const second = opponentOf(game.first);
  return [...moves].map((digit, index) => {
    const column = Number(digit) - 1;
    const top = game.board.findIndex((cells) => cells[column] !== null);
    const above = [...moves.slice(index + 1)].filter((d) => d === digit).length;
    const number = from + index + 1;
    return {
      row: top + above,
      column,
      colour: number % 2 === 1 ? game.first : second,
    };
  });
}

/** The row a token dropped in `column` lands on, or -1 when it is full. */
export function landingRow(board: Cell[][], column: number): number {
  for (let row = board.length - 1; row >= 0; row -= 1) {
    if (board[row][column] === null) return row;
  }
  return -1;
}

/** The board with one more token dropped in `column`. */
export function withToken(
  board: Cell[][],
  column: number,
  colour: Color,
): Cell[][] {
  const row = landingRow(board, column);
  if (row < 0) return board;
  const next = board.map((cells) => [...cells]);
  next[row][column] = colour;
  return next;
}

/** The last move: its column is history's last digit, its cell the top token. */
export function lastMove(game: GameState): Move | null {
  const digit = game.history.at(-1);
  if (!digit) return null;
  const column = Number(digit) - 1;
  const row = game.board.findIndex((cells) => cells[column] !== null);
  if (row < 0) return null;
  const second = opponentOf(game.first);
  return {
    row,
    column,
    colour: game.history.length % 2 === 1 ? game.first : second,
  };
}
