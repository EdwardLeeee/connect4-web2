// The app's on-device AI game: it speaks the server's protocol for AI games
// (docs/protocol.md) and emits the same snapshots and error codes, so the UI cannot tell
// it from backend/connect4_app/manager.py. tests/local/localGame.spec.ts replays
// snapshots recorded from the real manager.
import type { Color, Difficulty, Player, Snapshot } from "../types";
import { AI_MIN_THINK_MS, AI_NICKNAMES } from "./constants";
import { DIFFICULTIES, plannedMove } from "./difficulty";
import {
  type AiGame,
  type AiOptions,
  drop,
  newGame,
  replay,
  reset,
  RuleError,
  type Series,
  SUPER_AI,
} from "./rules";

export interface AiEngine {
  /** The exact best move (the Super AI's column) for the position after `history`. */
  bestMove(history: string): Promise<number>;
  dispose(): void;
}

export type Outgoing =
  | { type: "state.snapshot"; payload: Snapshot }
  | { type: "error"; payload: { code: string } };

export interface LocalGameDeps {
  /**
   * Starts the AI engine. The engine lives as long as this LocalGame: it starts
   * with the first game and ends only on dispose(), or is rebuilt when a game
   * that failed is started again.
   */
  engine: () => AiEngine;
  /** The player's current profile, shown in every snapshot. */
  session: () => Snapshot["session"];
  /** Milliseconds for the AI's minimum think time; defaults to performance.now. */
  now?: () => number;
  /** Wall-clock milliseconds for server_time; defaults to Date.now. */
  wallClock?: () => number;
  sleep?: (ms: number) => Promise<void>;
  newRoomId?: () => string;
  /** A new game's 64-bit seed; defaults to crypto.getRandomValues. */
  newSeed?: () => bigint;
}

/** What the app keeps between launches; the board is rebuilt from the history. */
export interface SavedGameV2 {
  version: 2;
  roomId: string;
  history: string;
  series: Series;
  revision: number;
  /** The engine failed and the game shows solver_unavailable. */
  failed: boolean;
  difficulty: Difficulty;
  aiColor: Color;
  first: Color;
  /** A decimal string: JSON numbers cannot hold 64 bits. */
  seed: string;
}

/** Saved before 3.5.0: always the Super AI, with the player green and first. */
export type SavedGameV1 = Omit<
  SavedGameV2,
  "version" | "difficulty" | "aiColor" | "first" | "seed"
> & { version: 1 };

export type SavedGame = SavedGameV1 | SavedGameV2;

/** manager.py handle(): the messages an AI game understands. */
const AI_MESSAGES = new Set([
  "game.ai.start",
  "game.ai.retry",
  "game.move",
  "game.rematch",
  "game.leave",
  "state.request",
]);

const otherColor = (color: Color): Color =>
  color === "green" ? "pink" : "green";

/** manager.py _start_ai's checks on game.ai.start, without the seed. */
function startOptions(
  payload: Record<string, unknown>,
): Omit<AiOptions, "seed"> {
  const difficulty = "difficulty" in payload ? payload.difficulty : "super";
  const aiFirst = "ai_first" in payload ? payload.ai_first : false;
  const playerColor =
    "player_color" in payload ? payload.player_color : "green";
  if (
    !DIFFICULTIES.includes(difficulty as Difficulty) ||
    typeof aiFirst !== "boolean" ||
    (playerColor !== "green" && playerColor !== "pink") ||
    (difficulty === "super" && aiFirst)
  ) {
    throw new RuleError("invalid_payload");
  }
  const aiColor = otherColor(playerColor);
  return {
    difficulty: difficulty as Difficulty,
    aiColor,
    first: aiFirst ? aiColor : playerColor,
  };
}

/** A save's game options; throws when the save cannot be read. */
function savedOptions(saved: SavedGame): AiOptions {
  if (saved.version === 1) return SUPER_AI;
  const { difficulty, aiColor, first } = saved;
  const colors: unknown[] = ["green", "pink"];
  if (
    saved.version !== 2 ||
    !DIFFICULTIES.includes(difficulty) ||
    !colors.includes(aiColor) ||
    !colors.includes(first) ||
    typeof saved.seed !== "string"
  ) {
    throw new Error("unreadable save");
  }
  return { difficulty, aiColor, first, seed: BigInt(saved.seed) };
}

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
  private readonly newSeed: () => bigint;

  constructor(
    private readonly onMessage: (message: Outgoing) => void,
    private readonly deps: LocalGameDeps,
  ) {
    this.now = deps.now ?? (() => performance.now());
    this.wallClock = deps.wallClock ?? (() => Date.now());
    this.sleep =
      deps.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.newRoomId = deps.newRoomId ?? (() => `local-${crypto.randomUUID()}`);
    this.newSeed =
      deps.newSeed ?? (() => crypto.getRandomValues(new BigUint64Array(1))[0]);
  }

  /** Like a WebSocket reply, the answer always arrives asynchronously. */
  handle(type: string, payload: Record<string, unknown> = {}): void {
    void Promise.resolve().then(() => this.dispatch(type, payload));
  }

  serialize(): SavedGameV2 | null {
    if (!this.game) return null;
    return {
      version: 2,
      roomId: this.roomId,
      history: this.game.history,
      series: { ...this.game.series },
      revision: this.game.revision,
      failed: this.game.status === "error",
      difficulty: this.game.difficulty,
      aiColor: this.game.aiColor,
      first: this.game.first,
      seed: this.game.seed.toString(),
    };
  }

  /**
   * Resumes a saved game and emits its snapshot. If it was the AI's turn, the AI thinks
   * again; its move depends only on the seed and the history, so the game continues
   * exactly as before.
   */
  restore(saved: SavedGame): void {
    this.game = null;
    let game: AiGame;
    try {
      game = replay(
        saved.history,
        saved.series,
        saved.revision,
        savedOptions(saved),
      );
    } catch {
      return; // An unreadable save is dropped, as if the game had been left.
    }
    this.game = game;
    this.roomId = saved.roomId;
    this.engine ??= this.deps.engine();
    let thinks = false;
    if (saved.failed) {
      game.status = "error";
      game.resultReason = "solver_unavailable";
    } else {
      thinks = this.aiTurn(game);
    }
    this.handle("state.request");
    if (thinks) void this.think(game, this.now());
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
          return this.start(payload);
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

  private start(payload: Record<string, unknown>): void {
    const options = startOptions(payload);
    if (this.game) throw new RuleError("already_in_game");
    const game = newGame({ ...options, seed: this.newSeed() });
    this.game = game;
    this.roomId = this.newRoomId();
    // One engine for every game: its WASM and reply table load once.
    this.engine ??= this.deps.engine();
    this.emitAndThink(game);
  }

  private move(payload: Record<string, unknown>): void {
    const game = this.requireGame();
    const column = toColumn(payload.column);
    if (column === null) throw new RuleError("invalid_payload");
    drop(game, otherColor(game.aiColor), column);
    this.emitAndThink(game);
  }

  /** manager.py _ai_turn: starts the AI thinking when the next move is its own. */
  private aiTurn(game: AiGame): boolean {
    if (game.status !== "playing" || game.turn !== game.aiColor) return false;
    game.status = "thinking";
    game.revision += 1;
    return true;
  }

  /** Like manager.py: the snapshot goes out first, then the AI starts on its move. */
  private emitAndThink(game: AiGame): void {
    const thinks = this.aiTurn(game);
    this.emitSnapshot();
    if (thinks) void this.think(game, this.now());
  }

  /** game.ai.retry and game.rematch: a finished or failed AI game restarts as it was. */
  private again(): void {
    const game = this.requireGame();
    if (game.status !== "finished" && game.status !== "error") {
      throw new RuleError("rematch_unavailable");
    }
    if (game.status === "error") {
      // A failed engine (a worker that could not load, say) would fail again.
      this.engine?.dispose();
      this.engine = this.deps.engine();
    }
    reset(game);
    game.seed = this.newSeed();
    this.emitAndThink(game);
  }

  /** The engine stays for the next game; a move it is still thinking about is dropped. */
  private leave(): void {
    this.requireGame();
    this.game = null;
    this.emitSnapshot();
  }

  /**
   * manager.py _run_ai: the level's own pick or the exact move, at least AI_MIN_THINK_MS
   * after the AI's turn began. Only the exact move needs the engine.
   */
  private async think(game: AiGame, started: number): Promise<void> {
    const history = game.history;
    const stillThinking = () =>
      this.game === game &&
      game.history === history &&
      game.status === "thinking";
    let column: number;
    try {
      const planned = plannedMove(game.difficulty, game.seed, history);
      if (planned !== null) {
        column = planned;
      } else {
        if (!this.engine) throw new Error("no engine");
        column = await this.engine.bestMove(history);
      }
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
    drop(game, game.aiColor, column);
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
    const you = otherColor(game.aiColor);
    const players: Partial<Record<Color, Player>> = {
      [you]: {
        nickname: session.nickname,
        connected: true,
        is_ai: false,
        grace_deadline: null,
      },
      [game.aiColor]: {
        nickname: AI_NICKNAMES[game.difficulty],
        connected: true,
        is_ai: true,
        grace_deadline: null,
      },
    };
    return {
      ...base,
      room: { id: this.roomId, code: null, mode: "ai" },
      game: {
        revision: game.revision,
        difficulty: game.difficulty,
        status: game.status,
        board: game.board.map((row) => [...row]),
        history: game.history,
        first: game.first,
        turn: game.turn,
        you,
        winner: game.winner,
        winning_cells: game.winCells.map((cell) => ({ ...cell })),
        result_reason: game.resultReason,
        players,
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
