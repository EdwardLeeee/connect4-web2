// The app's on-device AI must play exactly like the server. tests/test_local_parity.py
// checks each value against its source of truth.
import type { Difficulty } from "../types";

/** backend/connect4_app/manager.py AI_MIN_THINK_SECONDS, in milliseconds. */
export const AI_MIN_THINK_MS = 1000;

/** native_solver/src/choice.rs CENTRE_FIRST: centre first, then left before right. */
export const CENTRE_FIRST: readonly number[] = [3, 2, 4, 1, 5, 0, 6];

/** backend/connect4_app/domain.py ROWS and COLUMNS. */
export const ROWS = 6;
export const COLUMNS = 7;

/** The display names the server gives the AI seat (manager.py AI_NICKNAMES). */
export const AI_NICKNAMES: Readonly<Record<Difficulty, string>> = {
  easy: "Easy AI",
  normal: "Normal AI",
  super: "Super AI",
};
