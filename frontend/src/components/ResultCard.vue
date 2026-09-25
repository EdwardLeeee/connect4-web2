<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import type { Color } from "../types";
import type {
  ResultAction,
  ResultModel,
  RoomMode,
} from "../utils/presentation";
import AppIcon from "./AppIcon.vue";

const props = defineProps<{
  result: ResultModel;
  mode: RoomMode;
  opponent: Color;
  opponentName: string;
  /** You moved first this game, so the opponent moves first in the next. */
  youMoveFirst: boolean;
  entering: boolean;
  /** Hidden in place until the last token lands (A03). */
  held: boolean;
}>();
const emit = defineEmits<{ action: [action: ResultAction] }>();
const { t, locale } = useI18n();

// Narrow screens (spec 02): the two buttons sit side by side while both
// labels fit and stack, main action first, once either would be cut or push
// out of the panel. Measured on the real text, so any language or font works.
const actionsEl = ref<HTMLElement | null>(null);
const stacked = ref(false);
let observer: ResizeObserver | null = null;
let lastWidth = -1;

function fit() {
  const el = actionsEl.value;
  if (!el || el.children.length < 2) {
    stacked.value = false;
    return;
  }
  // Measure the side-by-side layout and settle in one synchronous pass, so
  // nothing is painted in between.
  el.classList.remove("is-stacked");
  const overflows =
    el.scrollWidth > el.clientWidth + 1 ||
    [...el.children].some(
      (button) => button.scrollWidth > button.clientWidth + 1,
    );
  el.classList.toggle("is-stacked", overflows);
  stacked.value = overflows;
}

onMounted(() => {
  fit();
  void document.fonts?.ready.then(fit);
  if (typeof ResizeObserver === "undefined" || !actionsEl.value) return;
  observer = new ResizeObserver(([entry]) => {
    // Stacking changes only the height; refitting on that would loop.
    const width = entry.contentRect.width;
    if (Math.abs(width - lastWidth) < 0.5) return;
    lastWidth = width;
    fit();
  });
  observer.observe(actionsEl.value);
});

onUnmounted(() => observer?.disconnect());

watch(
  () => [props.result.actions, props.result.tone, props.mode, locale.value],
  () => void nextTick(fit),
);

function label(action: ResultAction) {
  switch (action) {
    case "again":
      if (props.mode !== "ai") return t("common.rematch");
      // A finished AI game invites another try; a solver failure restarts (P12).
      return props.result.tone === "error"
        ? t("common.retry")
        : t("common.challengeAgain");
    case "accept":
      return t("game.rematchAccept");
    case "waiting":
      return t("game.rematchWaiting");
    case "leave":
      return t("common.leave");
    case "lobby":
      return t("common.backToLobby");
  }
}

function icon(action: ResultAction) {
  if (action === "lobby") return "back" as const;
  const retrying =
    props.mode === "ai" &&
    (props.result.tone === "lose" || props.result.tone === "error");
  return action === "again" && retrying ? ("restart" as const) : null;
}
</script>

<template>
  <div
    class="card result-card"
    :class="[result.tone, { 'is-entering': entering, 'is-held': held }]"
    role="status"
  >
    <div class="result-top">
      <span class="emblem-icon"><AppIcon :name="result.emblem" /></span>
      <div>
        <h2>{{ t(result.title.key, result.title.args ?? {}) }}</h2>
        <p>{{ t(result.sub.key, result.sub.args ?? {}) }}</p>
      </div>
    </div>
    <div v-if="result.rematch === 'leftAfter'" class="rematch-row">
      <AppIcon name="back" />
      <div>
        <strong>{{ t("game.leftAfter", { name: opponentName }) }}</strong>
      </div>
    </div>
    <div v-else-if="result.rematch === 'sent'" class="rematch-row">
      <span class="dots" aria-hidden="true"><i /><i /><i /></span>
      <div>
        <strong>{{ t("game.rematchSent", { name: opponentName }) }}</strong>
        <small>{{ t("game.rematchPending", { name: opponentName }) }}</small>
      </div>
    </div>
    <div v-else-if="result.rematch === 'incoming'" class="rematch-row incoming">
      <i class="token stat-token" :class="opponent" />
      <div>
        <strong>{{ t("game.rematchIncoming", { name: opponentName }) }}</strong>
        <small>{{
          t("game.rematchIncomingSub", {
            name: youMoveFirst ? opponentName : t("game.you"),
          })
        }}</small>
      </div>
    </div>
    <div
      ref="actionsEl"
      class="result-actions"
      :class="{ 'is-stacked': stacked }"
    >
      <button
        v-for="action in result.actions"
        :key="action"
        class="btn"
        :class="{
          primary: action !== 'leave',
          secondary: action === 'leave',
          'is-waiting': action === 'waiting',
        }"
        type="button"
        :disabled="action === 'waiting'"
        @click="emit('action', action)"
      >
        <AppIcon v-if="icon(action)" :name="icon(action)!" />
        <span>{{ label(action) }}</span>
      </button>
    </div>
  </div>
</template>
