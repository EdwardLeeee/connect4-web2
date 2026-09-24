import { computed, onUnmounted, ref, watch, type Ref } from "vue";

const GRACE_SECONDS = 30;

/**
 * Seconds left until a server deadline, corrected by the server clock offset
 * (A05). `null` whenever there is no deadline, so callers show text only.
 */
export function useCountdown(
  deadline: Ref<number | null>,
  clockOffset: Ref<number>,
) {
  const now = ref(Date.now() / 1000);
  let timer: number | null = null;

  function stop() {
    if (timer !== null) window.clearInterval(timer);
    timer = null;
  }

  watch(
    deadline,
    (value) => {
      stop();
      now.value = Date.now() / 1000;
      if (value === null) return;
      timer = window.setInterval(() => {
        now.value = Date.now() / 1000;
      }, 250);
    },
    { immediate: true },
  );
  onUnmounted(stop);

  const remaining = computed(() => {
    if (deadline.value === null) return null;
    const left = deadline.value - (now.value + clockOffset.value);
    return Math.min(GRACE_SECONDS, Math.max(0, left));
  });

  return {
    /** Whole seconds shown to the player. */
    seconds: computed(() =>
      remaining.value === null ? null : Math.ceil(remaining.value),
    ),
    /** 1 → 0 as the grace period runs out; drives the rings. */
    fraction: computed(() =>
      remaining.value === null ? null : remaining.value / GRACE_SECONDS,
    ),
  };
}

export function formatClock(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
