import { onUnmounted, ref, type Ref } from "vue";

export type DropState = "queued" | "dropping";

/** A01: 260ms plus 30ms per row fallen; the CSS drop uses the same value. */
export function dropDuration(row: number): number {
  return 260 + 30 * row;
}

// Keep the class a moment past the animation so its last frame is not cut.
const SETTLE_MS = 50;

/**
 * Plays drops one after another (A01). Moves that arrive together, such as
 * your move and an instant AI reply, wait their turn hidden instead of
 * replacing the drop in flight. Keys are "row:column".
 */
export function useDropQueue(reducedMotion: Ref<boolean>) {
  const states = ref<Record<string, DropState>>({});
  let busyUntil = 0;
  let timers: number[] = [];

  function enqueue(cells: Array<{ row: number; column: number }>) {
    if (reducedMotion.value) return;
    for (const { row, column } of cells) {
      const key = `${row}:${column}`;
      const now = Date.now();
      const start = Math.max(now, busyUntil);
      const duration = dropDuration(row);
      const wait = start - now;
      busyUntil = start + duration;
      if (wait > 0) {
        states.value[key] = "queued";
        timers.push(
          window.setTimeout(() => {
            states.value[key] = "dropping";
          }, wait),
        );
      } else {
        states.value[key] = "dropping";
      }
      timers.push(
        window.setTimeout(
          () => {
            delete states.value[key];
          },
          wait + duration + SETTLE_MS,
        ),
      );
    }
  }

  /** Milliseconds until the last queued drop has landed and settled. */
  function idleIn(): number {
    const left = busyUntil - Date.now();
    return left > 0 ? left + SETTLE_MS : 0;
  }

  function reset() {
    timers.forEach((timer) => window.clearTimeout(timer));
    timers = [];
    states.value = {};
    busyUntil = 0;
  }

  onUnmounted(reset);
  return { states, enqueue, idleIn, reset };
}
