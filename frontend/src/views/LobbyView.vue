<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import { useGameStore } from "../stores/game";

const store = useGameStore();
const { t } = useI18n();
const roomCode = ref("");
const expandedPanel = ref<"friends" | "matchmaking" | null>(null);

function togglePanel(panel: "friends" | "matchmaking") {
  expandedPanel.value = expandedPanel.value === panel ? null : panel;
}

function joinRoom() {
  const code = roomCode.value.trim().toUpperCase();
  if (code) store.send("room.join", { code });
}
</script>

<template>
  <section class="lobby">
    <div class="lobby-grid">
      <article class="mode-card featured-card">
        <div class="mode-card-heading">
          <div class="card-icon ai-icon" aria-hidden="true">✦</div>
          <div class="mode-copy">
            <h2>{{ t("lobby.aiTitle") }}</h2>
            <p>{{ t("lobby.aiBody") }}</p>
          </div>
        </div>
        <button
          class="button primary full-width"
          type="button"
          :disabled="store.connection !== 'online'"
          @click="store.send('game.ai.start')"
        >
          {{ t("lobby.aiAction") }}
          <span aria-hidden="true">→</span>
        </button>
      </article>

      <article
        class="mode-card friend-card collapsible-card"
        :class="{ 'is-expanded': expandedPanel === 'friends' }"
      >
        <div class="mode-card-heading">
          <div class="card-icon friends-icon" aria-hidden="true">••</div>
          <div class="mode-copy">
            <h2 id="friends-mode-title">{{ t("lobby.friendTitle") }}</h2>
            <p>{{ t("lobby.friendBody") }}</p>
          </div>
          <button
            class="mode-card-toggle"
            type="button"
            aria-labelledby="friends-mode-title"
            aria-controls="friends-mode-panel"
            :aria-expanded="expandedPanel === 'friends'"
            @click="togglePanel('friends')"
          >
            <span class="toggle-chevron" aria-hidden="true" />
          </button>
        </div>
        <div id="friends-mode-panel" class="mode-card-panel">
          <div class="mode-card-panel-inner">
            <button
              class="button secondary full-width"
              type="button"
              :disabled="store.connection !== 'online'"
              @click="store.send('room.create')"
            >
              {{ t("lobby.createRoom") }}
            </button>
            <form class="join-row" @submit.prevent="joinRoom">
              <label class="sr-only" for="room-code">{{
                t("lobby.roomCode")
              }}</label>
              <input
                id="room-code"
                v-model="roomCode"
                inputmode="text"
                maxlength="6"
                :placeholder="t('lobby.roomCode')"
                autocomplete="off"
                @input="roomCode = roomCode.toUpperCase()"
              />
              <button
                class="button dark"
                type="submit"
                :disabled="store.connection !== 'online'"
              >
                {{ t("lobby.joinRoom") }}
              </button>
            </form>
          </div>
        </div>
      </article>

      <article
        class="mode-card matchmaking-card collapsible-card"
        :class="{ 'is-expanded': expandedPanel === 'matchmaking' }"
      >
        <div class="mode-card-heading">
          <div class="card-icon match-icon" aria-hidden="true">↝</div>
          <div class="mode-copy">
            <h2 id="matchmaking-mode-title">
              {{ t("lobby.matchmakingTitle") }}
            </h2>
            <p>{{ t("lobby.matchmakingBody") }}</p>
          </div>
          <button
            class="mode-card-toggle"
            type="button"
            aria-labelledby="matchmaking-mode-title"
            aria-controls="matchmaking-mode-panel"
            :aria-expanded="expandedPanel === 'matchmaking'"
            @click="togglePanel('matchmaking')"
          >
            <span class="toggle-chevron" aria-hidden="true" />
          </button>
        </div>
        <div id="matchmaking-mode-panel" class="mode-card-panel">
          <div class="mode-card-panel-inner">
            <button
              class="button secondary full-width"
              type="button"
              :disabled="store.connection !== 'online'"
              @click="store.send('queue.join')"
            >
              {{ t("lobby.matchmakingAction") }}
            </button>
          </div>
        </div>
      </article>
    </div>
  </section>
</template>
