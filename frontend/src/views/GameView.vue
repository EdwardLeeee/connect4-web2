<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import BoardHead from "../components/BoardHead.vue";
import ConnectBoard from "../components/ConnectBoard.vue";
import EndingScene from "../components/EndingScene.vue";
import MatchCard from "../components/MatchCard.vue";
import ResultCard from "../components/ResultCard.vue";
import SearchingScreen from "../components/SearchingScreen.vue";
import WaitingScreen from "../components/WaitingScreen.vue";
import { useCountdown } from "../composables/useCountdown";
import { useDropQueue } from "../composables/useDropQueue";
import { useEnding } from "../composables/useEnding";
import { useMedia } from "../composables/useMedia";
import { useGameStore } from "../stores/game";
import type { Color } from "../types";
import { endingFor } from "../utils/ending";
import {
  landingRow,
  lastMove,
  movesSince,
  opponentOf,
  resultPanel,
  statusHead,
  withToken,
  type ResultAction,
  type RoomMode,
} from "../utils/presentation";

const store = useGameStore();
const { t } = useI18n();

const online = computed(() => store.shownConnection === "online");
const mode = computed<RoomMode>(() => store.room?.mode ?? "ai");
const opponent = computed<Color>(() => opponentOf(store.game?.you ?? "green"));
const opponentName = computed(
  () => store.game?.players[opponent.value]?.nickname ?? "",
);
const last = computed(() => (store.game ? lastMove(store.game) : null));

// A05: one countdown per player, from the server's per-player deadline.
const clockOffset = computed(() => store.clockOffset);
const deadline = (colour: Color) =>
  computed(() =>
    store.game?.status === "paused"
      ? (store.game.players[colour]?.grace_deadline ?? null)
      : null,
  );
const greenCountdown = useCountdown(deadline("green"), clockOffset);
const pinkCountdown = useCountdown(deadline("pink"), clockOffset);
const opponentCountdown = computed(() =>
  opponent.value === "green" ? greenCountdown : pinkCountdown,
);

// Changes seen live on this connection animate; the state a connection starts
// with (first load, reconnect) is shown as it is (A01, A03).
const reducedMotion = useMedia("(prefers-reduced-motion: reduce)");
const drops = useDropQueue(reducedMotion);
// Round 7 endings start once the last token has landed; until the panel's
// turn it keeps its place but stays hidden.
const ending = useEnding(reducedMotion);
const reconnectedName = ref<string | null>(null);
const announcement = ref("");
let reconnectedTimer: number | null = null;

// A1: your move drops as you let go. The server's snapshot then confirms it,
// and the drop carries on, or refuses it and the token is taken back.
let dropped: { index: number; row: number; column: number } | null = null;
const board = computed(() => {
  const game = store.game;
  if (!game) return [];
  const pending = store.pendingMove;
  return pending ? withToken(game.board, pending.column, game.you) : game.board;
});

function onMove(column: number) {
  const game = store.game;
  if (!game) return;
  const row = landingRow(game.board, column);
  if (row < 0 || !store.move(column)) return;
  dropped = { index: game.history.length, row, column };
  drops.enqueue([{ row, column }]);
}

watch(
  () => store.pendingMove,
  (pending) => {
    if (pending || !dropped) return;
    // Confirmed: the history watcher sees the move and lets it drop on.
    if ((store.game?.history.length ?? 0) > dropped.index) return;
    drops.remove(dropped);
    dropped = null;
  },
);

watch(
  () =>
    [
      store.game?.history ?? null,
      store.game?.status ?? null,
      store.room?.id ?? null,
      store.connectionEpoch,
    ] as const,
  ([history, status], [oldHistory, oldStatus, oldRoom, oldEpoch]) => {
    const game = store.game;
    const live =
      store.room?.id === oldRoom && store.connectionEpoch === oldEpoch;
    if (!game || !live) {
      drops.reset();
      ending.cancel();
      dropped = null;
      return;
    }

    if (
      history !== null &&
      oldHistory !== null &&
      history.length > oldHistory.length &&
      history.startsWith(oldHistory)
    ) {
      // Every new move drops in turn, even when several arrive together;
      // yours has been dropping since you let go.
      const moves = movesSince(game, oldHistory.length);
      drops.enqueue(
        moves.filter((_, i) => oldHistory.length + i !== dropped?.index),
      );
      dropped = null;
      announcement.value = moves
        .map(({ column, colour }) =>
          colour === game.you
            ? t("game.youDropped", { column: column + 1 })
            : t("game.opponentDropped", { column: column + 1 }),
        )
        .join(" ");
    } else if (history !== oldHistory) {
      drops.reset();
      dropped = null;
    }

    // A forfeit ends a paused game, so a live finish can come from "paused".
    const wasLive =
      oldStatus === "playing" ||
      oldStatus === "thinking" ||
      oldStatus === "paused";
    if ((status === "finished" || status === "error") && wasLive) {
      // A solver error has no ending of its own; its panel just comes in.
      ending.start(endingFor(game, opponentName.value), drops.idleIn());
    } else if (status !== oldStatus) {
      ending.cancel();
    }

    if (oldStatus === "paused" && status === "playing") {
      reconnectedName.value = opponentName.value;
      if (reconnectedTimer !== null) window.clearTimeout(reconnectedTimer);
      reconnectedTimer = window.setTimeout(() => {
        reconnectedName.value = null;
      }, 2000);
    } else if (status !== "playing") {
      reconnectedName.value = null;
    }
  },
);

onUnmounted(() => {
  if (reconnectedTimer !== null) window.clearTimeout(reconnectedTimer);
});

const head = computed(() =>
  store.game
    ? statusHead({
        game: store.game,
        opponentName: opponentName.value,
        online: online.value,
        reconnectedName: reconnectedName.value,
        countdownSeconds: opponentCountdown.value.seconds.value,
      })
    : null,
);
const result = computed(() =>
  store.game ? resultPanel(store.game, mode.value, opponentName.value) : null,
);
const rings = computed(() => ({
  green: greenCountdown.fraction.value,
  pink: pinkCountdown.fraction.value,
}));
const overlay = computed(() => {
  if (!online.value) return "offline" as const;
  if (store.game?.status === "error") return "error" as const;
  return null;
});

function onAction(action: ResultAction) {
  if (action === "again") {
    store.send(mode.value === "ai" ? "game.ai.retry" : "game.rematch");
  } else if (action === "accept") {
    store.send("game.rematch");
  } else if (action === "leave" || action === "lobby") {
    store.send("game.leave");
  }
}
</script>

<template>
  <SearchingScreen v-if="store.searching && !store.game" />

  <WaitingScreen
    v-else-if="store.game?.status === 'waiting'"
    :code="store.room?.code ?? ''"
  />

  <section
    v-else-if="store.game"
    class="game"
    :class="[
      `status-${store.game.status}`,
      `you-${store.game.you}`,
      {
        'is-finished': store.game.status === 'finished',
        'is-offline': !online,
        'has-result': result,
      },
    ]"
  >
    <div class="board-unit">
      <BoardHead
        :head="head"
        place="in-unit"
        :countdown-seconds="opponentCountdown.seconds.value"
        :countdown-fraction="opponentCountdown.fraction.value"
        :late="store.game.status === 'thinking'"
      />
      <ConnectBoard
        :board="board"
        :you="store.game.you"
        :interactive="store.canMove"
        :winning-cells="store.game.winning_cells"
        :last="last"
        :drops="drops.states.value"
        :ending="ending.ending.value"
        :skipped="ending.skipped.value"
        :finished="store.game.status === 'finished'"
        :overlay="overlay"
        @move="onMove"
        @announce="announcement = $event"
      />
    </div>

    <aside class="side">
      <BoardHead
        :head="head"
        place="in-side"
        :countdown-seconds="opponentCountdown.seconds.value"
        :countdown-fraction="opponentCountdown.fraction.value"
        :late="store.game.status === 'thinking'"
      />
      <ResultCard
        v-if="result"
        :result="result"
        :mode="mode"
        :opponent="opponent"
        :opponent-name="opponentName"
        :you-move-first="store.game.you === store.game.first"
        :entering="ending.panelEntering.value"
        :held="ending.panelHeld.value"
        @action="onAction"
      />
      <MatchCard
        :game="store.game"
        :mode="mode"
        :code="store.room?.code ?? null"
        :online="online"
        :rings="rings"
      />
      <div class="card info-card">
        <div>
          <small>{{ t("game.first") }}</small>
          <strong>{{
            store.game.you === store.game.first
              ? t("game.you")
              : (store.game.players[store.game.first]?.nickname ?? "")
          }}</strong>
        </div>
        <div>
          <small>{{ t("game.lastMove") }}</small>
          <strong>
            <template v-if="last">
              <i class="token stat-token" :class="last.colour" />
              {{ t("game.column", { column: last.column + 1 }) }}
            </template>
            <template v-else>—</template>
          </strong>
        </div>
      </div>
      <div v-if="!result" class="actions">
        <button
          class="btn secondary"
          type="button"
          @click="store.send('game.leave')"
        >
          <span>{{ t("common.leave") }}</span>
        </button>
      </div>
      <p v-if="store.canMove" class="kbd-hint">
        <kbd>←</kbd><kbd>→</kbd> {{ t("game.kbdPick") }} <kbd>Enter</kbd>
        {{ t("game.kbdDrop") }}
      </p>
    </aside>
    <p class="sr-only" aria-live="polite">{{ announcement }}</p>
    <EndingScene
      v-if="ending.stage.value === 'playing' && ending.ending.value"
      :ending="ending.ending.value"
      @skip="ending.skip"
    />
  </section>
</template>
