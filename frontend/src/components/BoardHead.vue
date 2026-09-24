<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { formatClock } from "../composables/useCountdown";
import type { HeadModel } from "../utils/presentation";
import AppIcon from "./AppIcon.vue";

defineProps<{
  head: HeadModel | null;
  place: "in-unit" | "in-side";
  countdownSeconds: number | null;
  countdownFraction: number | null;
  late: boolean;
}>();
const { t } = useI18n();
</script>

<template>
  <div
    class="board-head"
    :class="[place, head?.tone, { 'is-late': late }]"
    role="status"
    aria-live="polite"
  >
    <template v-if="head">
      <div class="turn-status">
        <span v-if="head.icon" class="status-icon">
          <AppIcon :name="head.icon" />
        </span>
        <span v-else-if="head.token === 'draw'" class="draw-pair">
          <i class="token green status-token" />
          <i class="token pink status-token" />
        </span>
        <i
          v-else-if="head.token"
          class="token status-token"
          :class="head.token"
        />
        <strong>{{ t(head.title.key, head.title.args ?? {}) }}</strong>
        <span v-if="head.dots" class="dots thinking-dots" aria-hidden="true">
          <i /><i /><i />
        </span>
        <span v-if="head.hint" class="hint">{{ t(head.hint.key) }}</span>
      </div>
      <span
        v-if="head.countdown && countdownSeconds !== null"
        class="move-chip countdown"
        :class="{ 'is-urgent': countdownSeconds <= 10 }"
        :style="{ '--p': countdownFraction ?? 0 }"
      >
        <i class="ring" aria-hidden="true" />
        {{ formatClock(countdownSeconds) }}
      </span>
      <span v-else class="move-chip">
        {{ t(head.chip.key, head.chip.args ?? {}) }}
      </span>
      <p v-if="head.note" class="head-note">{{ t(head.note.key) }}</p>
    </template>
  </div>
</template>
