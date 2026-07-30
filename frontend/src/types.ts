export type Color = "green" | "pink";
export type Cell = Color | null;
export type GameStatus =
  "waiting" | "playing" | "thinking" | "paused" | "finished" | "error";

export interface Player {
  nickname: string;
  connected: boolean;
  is_ai: boolean;
}

export interface GameState {
  revision: number;
  status: GameStatus;
  board: Cell[][];
  turn: Color;
  you: Color;
  winner: Color | null;
  winning_cells: Array<{ row: number; column: number }>;
  result_reason: string | null;
  players: Partial<Record<Color, Player>>;
  rematch_requested: boolean;
  grace_deadline: number | null;
}

export interface Snapshot {
  session: { nickname: string; locale: "zh-TW" | "en" };
  queue: { searching: boolean };
  room: {
    id: string;
    code: string | null;
    mode: "ai" | "private" | "matchmaking";
  } | null;
  game: GameState | null;
}
