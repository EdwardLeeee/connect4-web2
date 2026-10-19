// What the lobby's AI sheet asks before a game (R29 01): the level, who
// starts and your colour. Sent as game.ai.start's options (docs/protocol.md
// "AI 局的選項"); 開始對戰 also keeps them for the next time (04).
import type { Color, Difficulty } from "../types";

export const LEVELS: readonly Difficulty[] = ["easy", "normal", "super"];

export interface AiChoice {
  difficulty: Difficulty;
  aiFirst: boolean;
  colour: Color;
}

/** Everyone starts here (03): Super AI, you first, green. */
export const DEFAULT_CHOICE: AiChoice = {
  difficulty: "super",
  aiFirst: false,
  colour: "green",
};

/** A kept choice, or the default when it is missing or unreadable. */
export function readChoice(raw: string | null): AiChoice {
  try {
    const saved = JSON.parse(raw ?? "null");
    if (
      LEVELS.includes(saved?.difficulty) &&
      typeof saved.aiFirst === "boolean" &&
      (saved.colour === "green" || saved.colour === "pink")
    ) {
      return {
        difficulty: saved.difficulty,
        aiFirst: saved.aiFirst,
        colour: saved.colour,
      };
    }
  } catch {
    // Unreadable: as if nothing were kept.
  }
  return { ...DEFAULT_CHOICE };
}

export function keptChoice(choice: AiChoice): string {
  return JSON.stringify({
    difficulty: choice.difficulty,
    aiFirst: choice.aiFirst,
    colour: choice.colour,
  });
}

/** game.ai.start's payload: all three, so the server never falls back. */
export function startPayload(choice: AiChoice) {
  return {
    difficulty: choice.difficulty,
    ai_first: choice.aiFirst,
    player_color: choice.colour,
  };
}

/** 05-A: a Super AI that starts is very hard to beat. */
export function warnsSuperFirst(choice: AiChoice): boolean {
  return choice.difficulty === "super" && choice.aiFirst;
}
