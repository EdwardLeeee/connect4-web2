<script setup lang="ts">
// The rail and board of the play screen: pointer and touch preview (A02),
// keyboard play with a roving tab stop (A09), the drop (A01), the winning
// line, and the board's part of the round 7 endings (A03 C5, A11 F5, A12 T5).
// The server decides every move; this only reports the column.
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { dropDuration, type DropState } from "../composables/useDropQueue";
import type { Cell, Color } from "../types";
import type { Ending } from "../utils/ending";
import { measureWinLine, winOrder, type WinLine } from "../utils/winLine";
import AppIcon from "./AppIcon.vue";

const props = defineProps<{
  board: Cell[][];
  you: Color;
  /** It is your turn and the connection is up. */
  interactive: boolean;
  winningCells: Array<{ row: number; column: number }>;
  last: { row: number; column: number } | null;
  /** Drops in progress or waiting their turn, keyed by "row:column". */
  drops: Record<string, DropState>;
  /** The live ending playing (or played) on this board, if any. */
  ending: Ending | null;
  /** The ending was skipped: every board effect jumps to its end. */
  skipped: boolean;
  finished: boolean;
  overlay: "offline" | "error" | null;
}>();
const emit = defineEmits<{
  move: [column: number];
  announce: [text: string];
}>();
const { t } = useI18n();

const COLUMNS = 7;
const boardEl = ref<HTMLElement | null>(null);
const targetsEl = ref<HTMLElement | null>(null);
const buttons = ref<HTMLButtonElement[]>([]);
const hover = ref<number | null>(null);
const focusColumn = ref(3);
const line = ref<WinLine | null>(null);
let touch: { id: number } | null = null;
let suppressClick = false;

const winKeys = computed(() => winOrder(props.winningCells));

function isFull(column: number) {
  return props.board[0][column] !== null;
}

function landingRow(column: number) {
  for (let row = props.board.length - 1; row >= 0; row -= 1) {
    if (props.board[row][column] === null) return row;
  }
  return -1;
}

const preview = computed(() => {
  if (!props.interactive || hover.value === null || isFull(hover.value)) {
    return null;
  }
  return { column: hover.value, row: landingRow(hover.value) };
});

watch(
  () => props.interactive,
  (interactive) => {
    if (!interactive) hover.value = null;
  },
);

function columnLabel(column: number) {
  const n = column + 1;
  if (!props.interactive) return t("game.column", { column: n });
  return isFull(column)
    ? t("game.columnFull", { column: n })
    : t("game.columnReady", { column: n });
}

function drop(column: number) {
  if (!props.interactive) return;
  if (isFull(column)) {
    emit("announce", t("game.columnFull", { column: column + 1 }));
    return;
  }
  emit("move", column);
}

function columnAt(clientX: number, clientY: number): number | null {
  const board = boardEl.value?.getBoundingClientRect();
  const targets = targetsEl.value?.getBoundingClientRect();
  if (!board || !targets) return null;
  const inside =
    clientX >= board.left &&
    clientX <= board.right &&
    clientY >= board.top &&
    clientY <= board.bottom;
  if (!inside) return null;
  const ratio = (clientX - targets.left) / targets.width;
  return Math.min(COLUMNS - 1, Math.max(0, Math.floor(ratio * COLUMNS)));
}

function onPointerMove(event: PointerEvent) {
  if (!props.interactive) return;
  if (event.pointerType === "mouse") {
    hover.value = columnAt(event.clientX, event.clientY);
  } else if (touch?.id === event.pointerId) {
    hover.value = columnAt(event.clientX, event.clientY);
  }
}

function onPointerDown(event: PointerEvent) {
  if (!props.interactive || event.pointerType === "mouse") return;
  touch = { id: event.pointerId };
  hover.value = columnAt(event.clientX, event.clientY);
}

// Touch: releasing drops in the column under the finger (a tap included);
// releasing off the board cancels (D10).
function onPointerUp(event: PointerEvent) {
  if (touch?.id !== event.pointerId) return;
  touch = null;
  const column = columnAt(event.clientX, event.clientY);
  hover.value = null;
  suppressClick = true;
  window.setTimeout(() => {
    suppressClick = false;
  }, 500);
  if (column !== null) drop(column);
}

function onPointerCancel(event: PointerEvent) {
  if (touch?.id !== event.pointerId) return;
  touch = null;
  hover.value = null;
}

function onPointerLeave(event: PointerEvent) {
  if (event.pointerType === "mouse") hover.value = null;
}

// Mouse clicks, Enter and Space, and assistive technology all arrive here.
function onClick(column: number) {
  if (suppressClick) return;
  drop(column);
}

function moveFocus(column: number) {
  focusColumn.value = Math.min(COLUMNS - 1, Math.max(0, column));
  buttons.value[focusColumn.value]?.focus();
  if (props.interactive) hover.value = focusColumn.value;
}

function onKeydown(event: KeyboardEvent, column: number) {
  const moves: Record<string, number> = {
    ArrowLeft: column - 1,
    ArrowRight: column + 1,
    Home: 0,
    End: COLUMNS - 1,
  };
  if (event.key in moves) {
    event.preventDefault();
    moveFocus(moves[event.key]);
  }
}

function onFocus(column: number) {
  focusColumn.value = column;
  if (props.interactive) hover.value = column;
}

function onFocusOut(event: FocusEvent) {
  if (!targetsEl.value?.contains(event.relatedTarget as Node | null)) {
    hover.value = null;
  }
}

async function updateLine() {
  await nextTick();
  const board = boardEl.value;
  if (!board || props.winningCells.length < 4) {
    line.value = null;
    return;
  }
  line.value = measureWinLine(board, [
    ...board.querySelectorAll<HTMLElement>(".cell.is-win"),
  ]);
}

watch(() => props.winningCells, updateLine, { immediate: true });
let resizeObserver: ResizeObserver | null = null;
onMounted(() => {
  if (typeof ResizeObserver === "undefined" || !boardEl.value) return;
  resizeObserver = new ResizeObserver(() => void updateLine());
  resizeObserver.observe(boardEl.value);
});
onUnmounted(() => resizeObserver?.disconnect());

// C5: six stars around the gold line (r7.js), only when there is a line.
const stars = computed(() => {
  const l = line.value;
  if (props.ending?.kind !== "win" || !l) return [];
  const mx = (l.x1 + l.x2) / 2;
  const my = (l.y1 + l.y2) / 2;
  return [
    [l.x1 - 44, l.y1 + 6],
    [l.x2 + 10, l.y2 - 50],
    [mx - 90, my - 70],
    [mx + 60, my + 40],
    [l.x1 + 30, l.y1 - 70],
    [l.x2 - 60, l.y2 + 40],
  ].map(([x, y]) => ({ left: `${x}px`, top: `${y}px` }));
});

// F5: your tokens sink one after another, bottom row first.
const sinkOrder = computed(() => {
  const order = new Map<string, number>();
  if (props.ending?.kind !== "lose") return order;
  const mine: Array<[number, number]> = [];
  props.board.forEach((cells, row) =>
    cells.forEach((cell, column) => {
      if (cell === props.you) mine.push([row, column]);
    }),
  );
  mine.sort(([ra, ca], [rb, cb]) => rb - ra || ca - cb);
  mine.forEach(([row, column], k) => order.set(`${row}:${column}`, k));
  return order;
});

function cellStyle(row: number, column: number) {
  const key = `${row}:${column}`;
  const style: Record<string, number> = {};
  if (winKeys.value.has(key)) style["--i"] = winKeys.value.get(key)!;
  if (sinkOrder.value.has(key)) style["--k"] = sinkOrder.value.get(key)!;
  // T5: every token hops once, row by row from the bottom.
  if (props.ending?.kind === "draw")
    style["--row"] = props.board.length - 1 - row;
  return style;
}

function dropStyle(row: number) {
  return {
    "--fall": `calc(${row} * (var(--slot) + var(--slot-gap)) + var(--slot) + 25px)`,
    "--drop-dur": `${dropDuration(row)}ms`,
  };
}
</script>

<template>
  <div class="rail">
    <div
      v-if="preview"
      class="hand"
      :style="{ '--col': preview.column }"
      aria-hidden="true"
    >
      <i class="token in-hand" :class="you" />
      <span class="drop-cue" />
    </div>
  </div>
  <div
    ref="boardEl"
    class="board"
    :class="{
      'is-disabled': !interactive,
      'is-interactive': interactive,
      'is-finished': finished,
      [`ending-${ending?.kind}`]: ending,
      'has-line': ending?.line,
      'is-ending-skipped': skipped,
    }"
    :style="{ '--hc': preview ? preview.column : -9 }"
    @pointermove="onPointerMove"
    @pointerleave="onPointerLeave"
  >
    <span v-if="preview" :key="preview.column" class="col-hover" />
    <!-- C5: the board flashes white as the winning token lands -->
    <span
      v-if="ending?.kind === 'win'"
      class="board-flash"
      aria-hidden="true"
    />
    <div class="grid" aria-hidden="true">
      <template v-for="(cells, row) in board" :key="row">
        <div
          v-for="(cell, column) in cells"
          :key="`${row}:${column}`"
          class="cell"
          :class="{
            'is-preview': preview?.row === row && preview?.column === column,
            // A01: the last-move frame appears once the token has landed.
            'is-last':
              cell &&
              last?.row === row &&
              last?.column === column &&
              !drops[`${row}:${column}`],
            'is-win': winKeys.has(`${row}:${column}`),
            'is-mine': sinkOrder.has(`${row}:${column}`),
          }"
          :style="cellStyle(row, column)"
        >
          <!-- No key tied to the drop: changing another cell's drop must not
               recreate this token and cut its animation. -->
          <i
            v-if="cell"
            class="token"
            :class="[
              cell,
              {
                'is-dropping': drops[`${row}:${column}`] === 'dropping',
                'is-queued': drops[`${row}:${column}`] === 'queued',
              },
            ]"
            :style="drops[`${row}:${column}`] ? dropStyle(row) : undefined"
          />
          <i
            v-else-if="preview?.row === row && preview?.column === column"
            class="token ghost"
            :class="you"
          />
        </div>
      </template>
    </div>
    <div
      ref="targetsEl"
      class="col-targets"
      role="group"
      :aria-label="t('game.board')"
      @pointerdown="onPointerDown"
      @pointerup="onPointerUp"
      @pointercancel="onPointerCancel"
      @focusout="onFocusOut"
    >
      <button
        v-for="column in COLUMNS"
        :key="column"
        ref="buttons"
        class="col-target"
        type="button"
        :tabindex="focusColumn === column - 1 ? 0 : -1"
        :aria-disabled="!interactive || isFull(column - 1)"
        :aria-label="columnLabel(column - 1)"
        @click="onClick(column - 1)"
        @keydown="onKeydown($event, column - 1)"
        @focus="onFocus(column - 1)"
      />
    </div>
    <svg
      v-if="line"
      class="win-line"
      aria-hidden="true"
      :viewBox="`0 0 ${line.width} ${line.height}`"
    >
      <!-- C5 draws a gold line over a wider ink one -->
      <line
        v-for="kind in ending?.kind === 'win' ? ['under', 'gold'] : ['']"
        :key="kind"
        :class="kind"
        :x1="line.x1"
        :y1="line.y1"
        :x2="line.x2"
        :y2="line.y2"
        :style="{ '--len': line.length.toFixed(0) }"
      />
    </svg>
    <span
      v-for="(style, index) in stars"
      :key="index"
      class="star"
      aria-hidden="true"
      :style="style"
    />
    <div v-if="overlay === 'offline'" class="board-overlay">
      <div class="overlay-card">
        <AppIcon name="wifiOff" />
        <strong>{{ t("game.offlineTitle") }}</strong>
        <small>{{ t("game.offlineBody") }}</small>
      </div>
    </div>
    <div v-else-if="overlay === 'error'" class="board-overlay plain" />
  </div>
</template>
