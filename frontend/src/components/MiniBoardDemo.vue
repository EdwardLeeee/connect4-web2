<script setup lang="ts">
// A10: the AI card's demo board plays a fixed winning move on a 6-second loop,
// pausing whenever it is off screen or the tab is hidden.
import { computed, nextTick, onMounted, onUnmounted, ref } from "vue";
import { measureWinLine, winOrder, type WinLine } from "../utils/winLine";

const ROWS = [".......", ".......", "....g..", "...GP..", "..GPG..", ".GPGP.."];
const TARGET = { row: 2, column: 4 };
const WIN = [
  { row: 5, column: 1 },
  { row: 4, column: 2 },
  { row: 3, column: 3 },
  { row: 2, column: 4 },
];
const order = winOrder(WIN);

type Phase = "ghost" | "drop" | "win" | "fade";
const SCHEDULE: Array<[number, Phase]> = [
  [800, "drop"],
  [1300, "win"],
  [4500, "fade"],
  [6000, "ghost"],
];

const phase = ref<Phase>("ghost");
const root = ref<HTMLElement | null>(null);
const line = ref<WinLine | null>(null);
let timers: number[] = [];
let inView = false;
let observer: IntersectionObserver | null = null;
const reducedMotion = window.matchMedia?.(
  "(prefers-reduced-motion: reduce)",
).matches;

const cells = computed(() =>
  ROWS.flatMap((row, rowIndex) =>
    [...row].map((char, column) => {
      const key = `${rowIndex}:${column}`;
      const isTarget = rowIndex === TARGET.row && column === TARGET.column;
      let token: string | null = null;
      if (char === "G") token = "green";
      if (char === "P") token = "pink";
      if (isTarget) token = phase.value === "ghost" ? "green ghost" : "green";
      return {
        key,
        token,
        dropping: isTarget && phase.value === "drop",
        win:
          order.has(key) && (phase.value === "win" || phase.value === "fade"),
        index: order.get(key) ?? 0,
      };
    }),
  ),
);

function clearTimers() {
  timers.forEach((timer) => window.clearTimeout(timer));
  timers = [];
}

function play() {
  clearTimers();
  if (reducedMotion || !inView || document.hidden) {
    phase.value = "ghost";
    return;
  }
  phase.value = "ghost";
  for (const [at, next] of SCHEDULE) {
    timers.push(
      window.setTimeout(() => {
        if (next === "ghost") {
          play();
          return;
        }
        phase.value = next;
        if (next === "win") void drawLine();
      }, at),
    );
  }
}

async function drawLine() {
  await nextTick();
  const grid = root.value;
  if (!grid) return;
  const winning = [...grid.querySelectorAll<HTMLElement>(".cell.is-win")];
  line.value = measureWinLine(grid, winning);
}

function onVisibility() {
  play();
}

onMounted(() => {
  document.addEventListener("visibilitychange", onVisibility);
  if (typeof IntersectionObserver === "undefined" || !root.value) return;
  observer = new IntersectionObserver(([entry]) => {
    inView = entry.isIntersecting;
    play();
  });
  observer.observe(root.value);
});

onUnmounted(() => {
  clearTimers();
  observer?.disconnect();
  document.removeEventListener("visibilitychange", onVisibility);
});
</script>

<template>
  <div
    ref="root"
    class="mini-board"
    :class="{
      'is-demo': phase === 'ghost' && !reducedMotion,
      'is-celebrating': phase === 'win',
      'is-fading': phase === 'fade',
    }"
    aria-hidden="true"
  >
    <div class="grid">
      <span
        v-for="cell in cells"
        :key="cell.key"
        class="cell"
        :class="{ 'is-win': cell.win }"
        :style="{ '--i': cell.index }"
      >
        <i
          v-if="cell.token"
          class="token"
          :class="[cell.token, { 'is-dropping': cell.dropping }]"
          :style="
            cell.dropping
              ? {
                  '--fall': `calc(${TARGET.row + 1} * (var(--m) + var(--mg)))`,
                  '--drop-dur': `${260 + 30 * TARGET.row}ms`,
                }
              : undefined
          "
        />
      </span>
    </div>
    <svg
      v-if="line && (phase === 'win' || phase === 'fade')"
      class="win-line"
      :viewBox="`0 0 ${line.width} ${line.height}`"
    >
      <line
        :x1="line.x1"
        :y1="line.y1"
        :x2="line.x2"
        :y2="line.y2"
        :style="{ '--len': line.length.toFixed(0) }"
      />
    </svg>
  </div>
</template>
