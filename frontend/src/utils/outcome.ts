import type { GameState } from "../types";

export type GameOutcome =
  "win" | "lose" | "draw" | "forfeitWin" | "forfeitLose" | "leftWin";

/** Classifies a finished game from the receiving player's point of view. */
export function gameOutcome(game: GameState): GameOutcome | null {
  if (game.status !== "finished") return null;
  if (game.result_reason === "draw") return "draw";
  const won = game.winner === game.you;
  if (game.result_reason === "forfeit")
    return won ? "forfeitWin" : "forfeitLose";
  // The player who leaves returns to the lobby, so only the winner sees "left".
  if (game.result_reason === "left" && won) return "leftWin";
  return won ? "win" : "lose";
}
