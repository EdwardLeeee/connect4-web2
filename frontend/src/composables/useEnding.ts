import { onUnmounted, ref, type Ref } from "vue";
import { ENDING_TIMING, type Ending } from "../utils/ending";

export type EndingStage = "idle" | "waiting" | "playing" | "done";

/**
 * The ending timeline of a live finish (round 7 A03, A11, A12). It only
 * decides when things happen: what the result panel says always comes from
 * the latest snapshot, so a rematch request or a leave during the animation
 * shows up as soon as the panel does.
 */
export function useEnding(reducedMotion: Ref<boolean>) {
  /** The ending being played, kept afterwards for the board's final look. */
  const ending = ref<Ending | null>(null);
  const stage = ref<EndingStage>("idle");
  const skipped = ref(false);
  /** The result panel keeps its place but stays hidden until its turn. */
  const panelHeld = ref(false);
  const panelEntering = ref(false);
  let timers: number[] = [];

  function clear() {
    timers.forEach((timer) => window.clearTimeout(timer));
    timers = [];
  }

  function later(ms: number, run: () => void) {
    timers.push(window.setTimeout(run, ms));
  }

  function showPanel() {
    panelHeld.value = false;
    panelEntering.value = true;
  }

  /**
   * Plays `next` once the last token has landed, `wait` ms from now. With no
   * ending (a solver error) or reduced motion, only the panel comes in.
   */
  function start(next: Ending | null, wait: number) {
    cancel();
    panelHeld.value = true;
    const begin = () => {
      if (!next || reducedMotion.value) {
        stage.value = "done";
        showPanel();
        return;
      }
      const { panelAt, endsAt } = ENDING_TIMING[next.kind];
      ending.value = next;
      stage.value = "playing";
      later(panelAt, showPanel);
      later(endsAt, () => {
        stage.value = "done";
      });
    };
    if (wait > 0) {
      stage.value = "waiting";
      later(wait, begin);
    } else {
      begin();
    }
  }

  /** A tap on the screen jumps straight to the result panel. */
  function skip() {
    if (stage.value !== "playing" || !ending.value?.skippable) return;
    clear();
    skipped.value = true;
    stage.value = "done";
    showPanel();
  }

  /** A new game, another room, a reconnect or leaving stops everything. */
  function cancel() {
    clear();
    ending.value = null;
    stage.value = "idle";
    skipped.value = false;
    panelHeld.value = false;
    panelEntering.value = false;
  }

  onUnmounted(clear);
  return {
    ending,
    stage,
    skipped,
    panelHeld,
    panelEntering,
    start,
    skip,
    cancel,
  };
}
