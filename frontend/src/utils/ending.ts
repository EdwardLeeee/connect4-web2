// Which ending animation a live finish plays (design/spec.md §0 round 7:
// A03 C5 win, A11 F5 loss, A12 T5 draw) and what its centre sticker says.
// Pure, so every outcome can be checked without rendering.
import type { GameState } from "../types";
import { gameOutcome } from "./outcome";
import type { Text } from "./presentation";

export type EndingKind = "win" | "lose" | "draw";

export interface Ending {
  kind: EndingKind;
  /** A four-in-a-row line is drawn; forfeits and leaves have none. */
  line: boolean;
  title: Text;
  sub: Text;
  /** Tapping the screen jumps to the result panel (all three, per drafts). */
  skippable: boolean;
}

/** Milliseconds from the start of each ending (r7.css keyframes). */
export const ENDING_TIMING: Record<
  EndingKind,
  { panelAt: number; endsAt: number }
> = {
  // C5: the sticker flies at 3000ms, the panel enters at 3300ms, the winning
  // tokens pulse until 4800ms.
  win: { panelAt: 3300, endsAt: 5500 },
  // F5: the panel enters at 4000ms while the rain fades out until 6200ms.
  lose: { panelAt: 4000, endsAt: 6200 },
  // T5: the sticker flies at 5000ms, the panel enters at 5300ms, the last
  // confetti lands by 5800ms.
  draw: { panelAt: 5300, endsAt: 5800 },
};

export function endingFor(
  game: GameState,
  opponentName: string,
): Ending | null {
  const outcome = gameOutcome(game);
  if (!outcome) return null;
  const line = game.winning_cells.length >= 4;
  switch (outcome) {
    case "draw":
      return {
        kind: "draw",
        line: false,
        title: { key: "game.stickerDraw" },
        sub: { key: "game.stickerDrawSub" },
        skippable: true,
      };
    case "win":
    case "forfeitWin":
    case "leftWin":
      return {
        kind: "win",
        line,
        title: { key: "game.stickerWin" },
        // Without a four in a row the sticker says why you won instead.
        sub:
          outcome === "win"
            ? { key: "game.stickerWinSub", args: { n: game.history.length } }
            : {
                key:
                  outcome === "forfeitWin"
                    ? "game.forfeitWinSub"
                    : "game.leftSub",
              },
        skippable: true,
      };
    case "lose":
    case "forfeitLose":
      return {
        kind: "lose",
        line,
        title: { key: "game.stickerLose" },
        sub: { key: "game.stickerLoseSub", args: { name: opponentName } },
        skippable: true,
      };
  }
}
