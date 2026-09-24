<script setup lang="ts">
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
}>();
const emit = defineEmits<{ action: [action: ResultAction] }>();
const { t } = useI18n();

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
    :class="[result.tone, { 'is-entering': entering }]"
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
    <div class="result-actions">
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
