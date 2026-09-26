// The app's on-device AI game: it speaks the server's protocol for AI games
// (docs/protocol.md) and emits the same snapshots and error codes, so the UI cannot tell
// it from backend/connect4_app/manager.py. tests/local/localGame.spec.ts replays
// snapshots recorded from the real manager.
import type { Snapshot } from "../types";
import { AI_MIN_THINK_MS, AI_NICKNAME } from "./constants";
import {
  type AiGame,
  drop,
  newGame,
  replay,
  reset,
  RuleError,
  type Series,
} from "./rules";

export interface AiEngine {
  /** The Super AI's column for the position after `history`. */
  bestMove(history: string): Promise<number>;
  dispose(): void;
}

export type Outgoing =
  | { type: "state.snapshot"; payload: Snapshot }
  | { type: "error"; payload: { code: string } };

export interface LocalGameDeps {
  /** Starts the AI engine; called when a game starts or is restored. */
  engine: () => AiEngine;
  /** The player's current profile, shown in every snapshot. */
  session: () => Snapshot["session"];
  /** Milliseconds for the AI's minimum think time; defaults to performance.now. */
  now?: () => number;
  /** Wall-clock milliseconds for server_time; defaults to Date.now. */
  wallClock?: () => number;
  sleep?: (ms: number) => Promise<void>;
  newRoomId?: () => string;
}

/** What the app keeps between launches; the board is rebuilt from the history. */
export interface SavedGame {
  version: 1;
  roomId: string;
  history: string;
  series: Series;
  revision: number;
  /** The engine failed and the game shows solver_unavailable. */
  failed: boolean;
}

/** manager.py handle(): the messages an AI game understands. */
const AI_MESSAGES = new Set([
  "game.ai.start",
  "game.ai.retry",
  "game.move",
  "game.rematch",
  "game.leave",
  "state.request",
]);

/** Python int() on the payload's column, which the server applies to game.move. */
function toColumn(value: unknown): number | null {
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "number")
    return Number.isFinite(value) ? Math.trunc(value) : null;
  if (typeof value === "string" && /^\s*[+-]?\d+\s*$/.test(value)) {
    return Number.parseInt(value, 10);
  }
  return null;
}

export class LocalGame {
  private game: AiGame | null = null;
  private roomId = "";
  private engine: AiEngine | null = null;
  private readonly now: () => number;
  private readonly wallClock: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly newRoomId: () => string;

  constructor(
    private readonly onMessage: (message: Outgoing) => void,
    private readonly deps: LocalGameDeps,
  ) {
    this.now = deps.now ?? (() => performance.now());
    this.wallClock = deps.wallClock ?? (() => Date.now());
    this.sleep =
      deps.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.newRoomId = deps.newRoomId ?? (() => `local-${crypto.randomUUID()}`);
  }

  /** Like a WebSocket reply, the answer always arrives asynchronously. */
  handle(type: string, payload: Record<string, unknown> = {}): void {
    void Promise.resolve().then(() => this.dispatch(type, payload));
  }

  serialize(): SavedGame | null {
    if (!this.game) return null;
    return {
      version: 1,
      roomId: this.roomId,
      history: this.game.history,
      series: { ...this.game.series },
      revision: this.game.revision,
      failed: this.game.status === "error",
    };
  }

  /**
   * Resumes a saved game and emits its snapshot. If it was the AI's turn, the AI thinks
   * again; its move is deterministic, so the game continues exactly as before.
   */
  restore(saved: SavedGame): void {
    this.dispose();
    let game: AiGame;
    try {
      if (saved.version !== 1) return;
      game = replay(saved.history, saved.series, saved.revision);
    } catch {
      return; // An unreadable save is dropped, as if the game had been left.
    }
    this.game = game;
    this.roomId = saved.roomId;
    this.engine = this.deps.engine();
    if (saved.failed) {
      game.status = "error";
      game.resultReason = "solver_unavailable";
    } else if (game.status === "playing" && game.turn === "pink") {
      game.status = "thinking";
      game.revision += 1;
      void this.think(game, this.now());
    }
    this.handle("state.request");
  }

  /** Stops the engine and forgets the game, without a snapshot. */
  dispose(): void {
    this.engine?.dispose();
    this.engine = null;
    this.game = null;
  }

  private dispatch(type: string, payload: Record<string, unknown>): void {
    if (!AI_MESSAGES.has(type)) return this.error("unknown_message");
    try {
      switch (type) {
        case "state.request":
          return this.emitSnapshot();
        case "game.ai.start":
          return this.start();
        case "game.move":
          return this.move(payload);
        case "game.ai.retry":
        case "game.rematch":
          return this.again();
        case "game.leave":
          return this.leave();
      }
    } catch (error) {
      if (error instanceof RuleError) return this.error(error.code);
      throw error;
    }
  }

  private start(): void {
    if (this.game) throw new RuleError("already_in_game");
    this.game = newGame();
    this.roomId = this.newRoomId();
    this.engine = this.deps.engine();
    this.emitSnapshot();
  }

  private move(payload: Record<string, unknown>): void {
    const game = this.requireGame();
    const column = toColumn(payload.column);
    if (column === null) throw new RuleError("invalid_payload");
    drop(game, "green", column);
    if (game.status === "playing" && game.turn === "pink") {
      game.status = "thinking";
      game.revision += 1;
      void this.think(game, this.now());
    }
    this.emitSnapshot();
  }

  /** game.ai.retry and game.rematch: a finished or failed AI game restarts as it was. */
  private again(): void {
    const game = this.requireGame();
    if (game.status !== "finished" && game.status !== "error") {
      throw new RuleError("rematch_unavailable");
    }
    reset(game);
    this.emitSnapshot();
  }

  private leave(): void {
    this.requireGame();
    this.dispose();
    this.emitSnapshot();
  }

  /** manager.py _run_ai: exact move, at least AI_MIN_THINK_MS after the player's move. */
  private async think(game: AiGame, started: number): Promise<void> {
    const history = game.history;
    const stillThinking = () =>
      this.game === game &&
      game.history === history &&
      game.status === "thinking";
    let column: number;
    try {
      if (!this.engine) throw new Error("no engine");
      column = await this.engine.bestMove(history);
    } catch {
      // The failure is shown at once; there is no fallback move.
      if (stillThinking()) {
        game.status = "error";
        game.resultReason = "solver_unavailable";
        game.revision += 1;
        this.emitSnapshot();
      }
      return;
    }
    const remaining = AI_MIN_THINK_MS - (this.now() - started);
    if (remaining > 0) await this.sleep(remaining);
    if (!stillThinking()) return;
    drop(game, "pink", column);
    if (game.status === "thinking") game.status = "playing";
    this.emitSnapshot();
  }

  private requireGame(): AiGame {
    if (!this.game) throw new RuleError("not_in_game");
    return this.game;
  }

  private error(code: string): void {
    this.onMessage({ type: "error", payload: { code } });
  }

  private emitSnapshot(): void {
    this.onMessage({ type: "state.snapshot", payload: this.snapshot() });
  }

  private snapshot(): Snapshot {
    const session = this.deps.session();
    const base: Snapshot = {
      server_time: this.wallClock() / 1000,
      session: { ...session },
      queue: { searching: false },
      room: null,
      game: null,
    };
    const game = this.game;
    if (!game) return base;
    return {
      ...base,
      room: { id: this.roomId, code: null, mode: "ai" },
      game: {
        revision: game.revision,
        status: game.status,
        board: game.board.map((row) => [...row]),
        history: game.history,
        first: game.first,
        turn: game.turn,
        you: "green",
        winner: game.winner,
        winning_cells: game.winCells.map((cell) => ({ ...cell })),
        result_reason: game.resultReason,
        players: {
          green: {
            nickname: session.nickname,
            connected: true,
            is_ai: false,
            grace_deadline: null,
          },
          pink: {
            nickname: AI_NICKNAME,
            connected: true,
            is_ai: true,
            grace_deadline: null,
          },
        },
        rematch: { green: false, pink: false },
        rematch_requested: false,
        rematch_available:
          game.status === "finished" || game.status === "error",
        series: { ...game.series },
        grace_deadline: null,
      },
    };
  }
}
