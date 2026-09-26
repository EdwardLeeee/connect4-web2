// The on-device Super AI: exact scores from the reply table when it has the position,
// otherwise from connect-four-ai-wasm, then the server's centre-first tie-break. It runs
// inside ai.worker.ts in the app and directly in Node in tests/local.
import { CENTRE_FIRST } from "./constants";
import type { ReplyTable, Scores } from "./replyTable";

/** The part of connect-four-ai-wasm the engine uses. */
export interface WasmLib {
  Solver: new () => {
    getAllMoveScores(position: unknown): unknown[];
    free(): void;
  };
  Position: { fromMoves(moves: string): { free(): void } };
}

/** native_solver/src/choice.rs select_best. */
export function pickCentreFirst(scores: Scores): number | null {
  let best: number | null = null;
  for (const column of CENTRE_FIRST) {
    const score = scores[column];
    if (score === null || score === undefined) continue;
    if (best === null || score > (scores[best] as number)) best = column;
  }
  return best;
}

export class Engine {
  private readonly solver: InstanceType<WasmLib["Solver"]>;

  constructor(
    private readonly lib: WasmLib,
    private readonly table: ReplyTable | null,
  ) {
    this.solver = new lib.Solver();
  }

  /** Exact scores for every column; full columns are `null`. */
  scores(history: string): Scores {
    const stored = this.table?.scores(history);
    if (stored) return stored;
    const position = this.lib.Position.fromMoves(history);
    try {
      return this.solver
        .getAllMoveScores(position)
        .map((score) => (typeof score === "number" ? score : null));
    } finally {
      position.free();
    }
  }

  bestMove(history: string): number {
    const column = pickCentreFirst(this.scores(history));
    if (column === null) throw new Error("position has no legal moves");
    return column;
  }

  dispose(): void {
    this.solver.free();
  }
}
