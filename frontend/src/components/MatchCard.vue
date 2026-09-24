<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import type { Color, GameState } from "../types";
import type { RoomMode } from "../utils/presentation";

const props = defineProps<{
  game: GameState;
  mode: RoomMode;
  code: string | null;
  online: boolean;
  /** Grace countdown per colour, 1 → 0, for the ring around an away player. */
  rings: Partial<Record<Color, number | null>>;
}>();
const { t } = useI18n();

const colours: Color[] = ["green", "pink"];

const players = computed(() =>
  colours.map((colour) => {
    const player = props.game.players[colour];
    const isMe = colour === props.game.you;
    const seat =
      colour === props.game.first ? t("game.first") : t("game.second");
    const current =
      props.game.status === "playing" && props.game.turn === colour;
    const away = player ? !player.connected : false;
    let meta = seat;
    if (isMe) meta = `${t("game.you")} · ${seat}`;
    else if (player?.is_ai) meta = `${seat} · ${t("game.solver")}`;
    let tag: "turn" | "away" | "online" | null = null;
    if (current && isMe && props.online) tag = "turn";
    else if (away) tag = "away";
    else if (!isMe && player) tag = "online";
    const ring = props.rings[colour];
    return {
      colour,
      name: player?.nickname ?? "",
      meta,
      isMe,
      current,
      away,
      tag,
      ring:
        away && props.game.status === "paused" && ring != null ? ring : null,
    };
  }),
);
</script>

<template>
  <div class="card match-card">
    <p class="mode-label">
      <template v-if="mode === 'ai'">{{ t("game.modeAi") }}</template>
      <template v-else-if="mode === 'private'">
        {{ t("game.modePrivate") }} <b class="code">{{ code }}</b>
      </template>
      <template v-else>{{ t("game.modeMatch") }}</template>
    </p>
    <template v-for="(player, index) in players" :key="player.colour">
      <div v-if="index === 1" class="versus">
        <span>{{ t("game.versus") }}</span>
      </div>
      <div
        class="player"
        :class="{
          right: player.colour === 'pink',
          'is-current': player.current,
          'is-away': player.away,
          'is-me': player.isMe,
        }"
      >
        <span class="player-token-wrap">
          <i class="token player-token" :class="player.colour" />
          <i
            v-if="player.ring !== null"
            class="token-ring"
            :style="{ '--p': player.ring }"
          />
        </span>
        <span class="player-copy">
          <strong>{{ player.name }}</strong>
          <small>{{ player.meta }}</small>
        </span>
        <span v-if="player.tag === 'turn'" class="turn-tag">{{
          t("game.yourTurn")
        }}</span>
        <span v-else-if="player.tag === 'away'" class="presence-tag off">{{
          t("game.offline")
        }}</span>
        <span v-else-if="player.tag === 'online'" class="presence-tag">
          <i />{{ t("game.online") }}
        </span>
      </div>
    </template>
    <div v-if="mode !== 'ai'" class="series">
      <span>{{ t("game.series") }}</span>
      <b>{{ game.series.you }}</b>
      <i>:</i>
      <b>{{ game.series.opponent }}</b>
    </div>
  </div>
</template>
