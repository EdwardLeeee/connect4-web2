<script setup lang="ts">
import { useI18n } from "vue-i18n";
import type { Color, Player } from "../types";

defineProps<{
  you: Color;
  turn: Color;
  players: Partial<Record<Color, Player>>;
  active: boolean;
}>();
const { t } = useI18n();
</script>

<template>
  <div class="player-strip">
    <div class="player-side" :class="{ current: active && turn === 'green' }">
      <span class="player-token green" aria-hidden="true" />
      <span>
        <small>{{ you === "green" ? t("game.you") : t("common.green") }}</small>
        <strong>{{ players.green?.nickname }}</strong>
      </span>
    </div>
    <span class="versus">{{ t("game.versus") }}</span>
    <div
      class="player-side right"
      :class="{ current: active && turn === 'pink' }"
    >
      <span>
        <small>{{ you === "pink" ? t("game.you") : t("common.pink") }}</small>
        <strong>{{ players.pink?.nickname }}</strong>
      </span>
      <span class="player-token pink" aria-hidden="true" />
    </div>
  </div>
</template>
