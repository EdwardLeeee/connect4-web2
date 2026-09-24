// Mirrors the snapshot contract in docs/protocol.md; manager.py is the source of truth.
export type Color = "green" | "pink";
export type Cell = Color | null;
export type GameStatus =
  "waiting" | "playing" | "thinking" | "paused" | "finished" | "error";
export type ResultReason =
  "connect_four" | "draw" | "forfeit" | "left" | "solver_unavailable";

export interface Player {
  nickname: string;
  connected: boolean;
  is_ai: boolean;
  /** Server Unix seconds when this offline player forfeits; set only while paused. */
  grace_deadline: number | null;
}

export interface GameState {
  revision: number;
  status: GameStatus;
  board: Cell[][];
  /** Moves as columns "1"–"7"; even indices belong to `first`. */
  history: string;
  /** Who moves first this game; player-vs-player rematches alternate it. */
  first: Color;
  turn: Color;
  you: Color;
  winner: Color | null;
  winning_cells: Array<{ row: number; column: number }>;
  result_reason: ResultReason | null;
  players: Partial<Record<Color, Player>>;
  rematch: Record<Color, boolean>;
  /** Same as rematch[you]; kept by the server for compatibility. */
  rematch_requested: boolean;
  /** Computed from room membership, never from result_reason. */
  rematch_available: boolean;
  series: { you: number; opponent: number; draws: number };
  /** Earliest forfeit time among offline players; set only while paused. */
  grace_deadline: number | null;
}

export interface Snapshot {
  /** Server Unix seconds when the snapshot was built. */
  server_time: number;
  session: { nickname: string; locale: "zh-TW" | "en" };
  queue: { searching: boolean };
  room: {
    id: string;
    code: string | null;
    mode: "ai" | "private" | "matchmaking";
  } | null;
  game: GameState | null;
}
