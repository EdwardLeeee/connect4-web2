// A line-by-line port of backend/connect4_app/domain.py for AI games, so the app can
// play them offline. tests/local/rules.spec.ts replays fixtures recorded from domain.py.
import type { Cell, Color, GameStatus, ResultReason } from "../types";
import { COLUMNS, ROWS } from "./constants";

export interface CellRef {
  row: number;
  column: number;
}

export class RuleError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

export interface Series {
  you: number;
  opponent: number;
  draws: number;
}

/** The human is always green and moves first in AI games. */
export interface AiGame {
  board: Cell[][];
  history: string;
  first: Color;
  turn: Color;
  status: GameStatus;
  winner: Color | null;
  winCells: CellRef[];
  resultReason: ResultReason | null;
  revision: number;
  series: Series;
}

export function emptyBoard(): Cell[][] {
  return Array.from({ length: ROWS }, () => Array<Cell>(COLUMNS).fill(null));
}

export function winningCells(board: Cell[][], color: Color): CellRef[] {
  const directions = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ];
  for (let row = 0; row < ROWS; row++) {
    for (let column = 0; column < COLUMNS; column++) {
      for (const [deltaRow, deltaColumn] of directions) {
        const cells: CellRef[] = [];
        for (let offset = 0; offset < 4; offset++) {
          const targetRow = row + deltaRow * offset;
          const targetColumn = column + deltaColumn * offset;
          if (
            targetRow < 0 ||
            targetRow >= ROWS ||
            targetColumn < 0 ||
            targetColumn >= COLUMNS
          ) {
            break;
          }
          if (board[targetRow][targetColumn] !== color) break;
          cells.push({ row: targetRow, column: targetColumn });
        }
        if (cells.length === 4) return cells;
      }
    }
  }
  return [];
}

export function newGame(): AiGame {
  return {
    board: emptyBoard(),
    history: "",
    first: "green",
    turn: "green",
    status: "playing",
    winner: null,
    winCells: [],
    resultReason: null,
    revision: 1,
    series: { you: 0, opponent: 0, draws: 0 },
  };
}

/** domain.py Game.drop; `game` is changed only when no RuleError is thrown. */
export function drop(game: AiGame, color: Color, column: number): number {
  const allowed =
    game.status === "playing" ||
    (game.status === "thinking" && color === "pink");
  if (!allowed) throw new RuleError("game_not_playable");
  if (color !== game.turn) throw new RuleError("not_your_turn");
  if (!Number.isInteger(column) || column < 0 || column >= COLUMNS) {
    throw new RuleError("invalid_column");
  }
  let row = -1;
  for (let candidate = ROWS - 1; candidate >= 0; candidate--) {
    if (game.board[candidate][column] === null) {
      row = candidate;
      break;
    }
  }
  if (row < 0) throw new RuleError("column_full");

  game.board[row][column] = color;
  game.history += String(column + 1);
  game.revision += 1;
  const cells = winningCells(game.board, color);
  if (cells.length) {
    game.status = "finished";
    game.winner = color;
    game.winCells = cells;
    game.resultReason = "connect_four";
    if (color === "green") game.series.you += 1;
    else game.series.opponent += 1;
  } else if (game.history.length === ROWS * COLUMNS) {
    game.status = "finished";
    game.winner = null;
    game.resultReason = "draw";
    game.series.draws += 1;
  } else {
    game.turn = color === "green" ? "pink" : "green";
  }
  return row;
}

/** domain.py Game.reset for AI games: the order never alternates. */
export function reset(game: AiGame): void {
  game.board = emptyBoard();
  game.history = "";
  game.turn = game.first;
  game.status = "playing";
  game.winner = null;
  game.winCells = [];
  game.resultReason = null;
  game.revision += 1;
}

/** Rebuilds a game from its moves, as a restored app replays its saved history. */
export function replay(
  history: string,
  series: Series,
  revision: number,
): AiGame {
  const game = newGame();
  game.series = { ...series };
  for (let index = 0; index < history.length; index++) {
    const color: Color = index % 2 === 0 ? "green" : "pink";
    drop(game, color, Number(history[index]) - 1);
  }
  // Replaying scored the finished game again; the saved series already counts it.
  game.series = { ...series };
  game.revision = revision;
  return game;
}
