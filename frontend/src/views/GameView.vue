<script setup lang="ts">
import { computed, onUnmounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import ConnectBoard from "../components/ConnectBoard.vue";
import PlayerStrip from "../components/PlayerStrip.vue";
import { useGameStore } from "../stores/game";
import { copyText } from "../utils/clipboard";
import { gameOutcome, type GameOutcome } from "../utils/outcome";

const store = useGameStore();
const { t } = useI18n();
const copied = ref(false);
let copiedTimer: number | null = null;

// Outcomes without approved wording yet reuse the closest existing message.
const outcomeMessage: Record<GameOutcome, string> = {
  win: "game.win",
  lose: "game.lose",
  draw: "game.draw",
  forfeitWin: "game.forfeitWin",
  forfeitLose: "game.lose",
  leftWin: "game.win",
};

const statusTitle = computed(() => {
  const game = store.game;
  if (!game) return "";
  if (game.status === "thinking") return t("game.aiThinking");
  if (game.status === "paused") return t("game.paused");
  if (game.status === "error") return t("game.solverError");
  const outcome = gameOutcome(game);
  if (outcome) return t(outcomeMessage[outcome]);
  return store.canMove ? t("game.yourTurn") : t("game.opponentTurn");
});

const statusTone = computed(() => {
  if (store.game?.status === "finished") {
    if (!store.game.winner) return "neutral";
    return store.game.winner === store.game.you ? "success" : "pink";
  }
  if (store.canMove) return "success";
  return "neutral";
});

async function copyCode() {
  const code = store.room?.code;
  if (!code) return;
  const success = await copyText(code);
  if (!success) {
    copied.value = false;
    store.errorCode = "copy_failed";
    return;
  }
  copied.value = true;
  if (copiedTimer !== null) window.clearTimeout(copiedTimer);
  copiedTimer = window.setTimeout(() => {
    copied.value = false;
    copiedTimer = null;
  }, 1400);
}

onUnmounted(() => {
  if (copiedTimer !== null) window.clearTimeout(copiedTimer);
});
</script>

<template>
  <section v-if="store.searching && !store.game" class="waiting-screen">
    <div class="radar" aria-hidden="true"><span /></div>
    <p class="eyebrow">{{ t("common.waiting") }}</p>
    <h1>{{ t("game.searching") }}</h1>
    <p>{{ t("game.searchingBody") }}</p>
    <button
      class="button secondary"
      type="button"
      @click="store.send('queue.leave')"
    >
      {{ t("game.cancelSearch") }}
    </button>
  </section>

  <section v-else-if="store.game?.status === 'waiting'" class="waiting-screen">
    <div class="room-code-block">
      <span>{{ t("lobby.roomCode") }}</span>
      <strong>{{ store.room?.code }}</strong>
    </div>
    <h1>{{ t("game.waitingFriend") }}</h1>
    <p>{{ t("game.waitingFriendBody") }}</p>
    <div class="button-row waiting-actions">
      <button class="button primary" type="button" @click="copyCode">
        {{ copied ? t("common.copied") : t("common.copy") }}
      </button>
      <button
        class="button secondary"
        type="button"
        @click="store.send('game.leave')"
      >
        {{ t("common.leave") }}
      </button>
    </div>
  </section>

  <section v-else-if="store.game" class="game-screen">
    <div class="game-main">
      <div
        class="turn-card"
        :class="statusTone"
        role="status"
        aria-live="polite"
      >
        <span class="turn-token" :class="store.game.turn" aria-hidden="true" />
        <span>
          <strong>{{ statusTitle }}</strong>
          <small v-if="store.game.status === 'error'">{{
            t("game.solverErrorBody")
          }}</small>
        </span>
      </div>

      <ConnectBoard
        :board="store.game.board"
        :disabled="!store.canMove"
        :winning-cells="store.game.winning_cells"
        @move="store.send('game.move', { column: $event })"
      />
    </div>

    <aside class="game-sidebar">
      <PlayerStrip
        :you="store.game.you"
        :turn="store.game.turn"
        :players="store.game.players"
        :active="store.game.status === 'playing'"
      />

      <div v-if="store.room?.code" class="compact-code">
        <span>{{ t("lobby.roomCode") }}</span>
        <button type="button" @click="copyCode">
          <strong>{{ store.room.code }}</strong>
          <small>{{ copied ? t("common.copied") : t("common.copy") }}</small>
        </button>
      </div>

      <div class="game-actions">
        <button
          class="button secondary"
          type="button"
          @click="store.send('game.leave')"
        >
          {{ t("common.leave") }}
        </button>
        <button
          v-if="store.game.status === 'finished'"
          class="button primary"
          type="button"
          :disabled="store.game.rematch_requested"
          @click="
            store.send(
              store.room?.mode === 'ai' ? 'game.ai.retry' : 'game.rematch',
            )
          "
        >
          {{
            store.game.rematch_requested
              ? t("game.rematchWaiting")
              : store.room?.mode === "ai"
                ? t("common.retry")
                : t("common.rematch")
          }}
        </button>
        <button
          v-if="store.game.status === 'error' && store.room?.mode === 'ai'"
          class="button primary"
          type="button"
          @click="store.send('game.ai.retry')"
        >
          {{ t("common.retry") }}
        </button>
      </div>
    </aside>
  </section>
</template>
