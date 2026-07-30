<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import type { Cell } from "../types";

const props = defineProps<{
  board: Cell[][];
  disabled: boolean;
  winningCells: Array<{ row: number; column: number }>;
}>();
const emit = defineEmits<{ move: [column: number] }>();
const { t } = useI18n();

const winningKeys = computed(
  () =>
    new Set(props.winningCells.map(({ row, column }) => `${row}:${column}`)),
);

function play(column: number) {
  if (!props.disabled) emit("move", column);
}
</script>

<template>
  <div
    class="board-wrap"
    role="group"
    :aria-label="t('common.brand')"
    :aria-disabled="disabled"
  >
    <div class="column-targets">
      <button
        v-for="column in 7"
        :key="column"
        type="button"
        tabindex="-1"
        :disabled="disabled || board[0][column - 1] !== null"
        :aria-label="t('game.playColumn', { column })"
        @click="play(column - 1)"
      />
    </div>
    <div class="board-grid" aria-hidden="true">
      <template v-for="(row, rowIndex) in board" :key="rowIndex">
        <div
          v-for="(cell, columnIndex) in row"
          :key="`${rowIndex}-${columnIndex}`"
          class="slot"
          :class="[
            cell,
            {
              winning: winningKeys.has(`${rowIndex}:${columnIndex}`),
            },
          ]"
        >
          <span v-if="cell" class="token-pattern" />
        </div>
      </template>
    </div>
  </div>
</template>
