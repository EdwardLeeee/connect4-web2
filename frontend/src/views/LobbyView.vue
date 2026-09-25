<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute } from "vue-router";
import AppIcon from "../components/AppIcon.vue";
import InviteScreen from "../components/InviteScreen.vue";
import MiniBoardDemo from "../components/MiniBoardDemo.vue";
import { useGameStore } from "../stores/game";
import { roomCodeFrom } from "../utils/invite";

const store = useGameStore();
const route = useRoute();
const { t } = useI18n();

// L12: an invite link opens its own page instead of the lobby.
const invitedCode = computed(() => roomCodeFrom(route.query.room));
const roomCode = ref("");
const roomCodeInput = ref<HTMLInputElement | null>(null);
// L14: an empty code is caught here instead of going to the server.
const joinError = ref(false);
const expandedPanel = ref<"friends" | "matchmaking" | null>(null);

const offline = computed(() => store.shownConnection !== "online");

function togglePanel(panel: "friends" | "matchmaking") {
  expandedPanel.value = expandedPanel.value === panel ? null : panel;
}

function joinRoom() {
  const code = roomCode.value.trim().toUpperCase();
  if (!code) {
    joinError.value = true;
    roomCodeInput.value?.focus();
    return;
  }
  store.send("room.join", { code });
}

function onRoomCodeInput() {
  roomCode.value = roomCode.value.toUpperCase();
  joinError.value = false;
}
</script>

<template>
  <InviteScreen v-if="invitedCode" :code="invitedCode" />
  <section v-else class="lobby">
    <div
      v-if="store.shownConnection === 'offline'"
      class="notice-banner"
      role="status"
    >
      <AppIcon name="wifiOff" />
      <span>{{ t("lobby.offline") }}</span>
    </div>

    <div class="lobby-grid" :class="{ 'has-expanded': expandedPanel }">
      <article class="mode-card ai-card">
        <div class="card-head">
          <span class="card-icon ai"><AppIcon name="ai" /></span>
          <div class="card-copy">
            <h2>{{ t("lobby.aiTitle") }}</h2>
            <p>{{ t("lobby.aiBody") }}</p>
          </div>
        </div>
        <MiniBoardDemo />
        <button
          class="btn primary big with-arrow"
          type="button"
          :disabled="offline"
          @click="store.send('game.ai.start')"
        >
          <span>{{ t("lobby.aiAction") }}</span>
          <AppIcon name="arrow" />
        </button>
      </article>

      <article
        class="mode-card friend-card collapsible"
        :class="{ 'is-expanded': expandedPanel === 'friends' }"
      >
        <div class="card-head">
          <span class="card-icon friends"><AppIcon name="friends" /></span>
          <div class="card-copy">
            <h2 id="friends-title">{{ t("lobby.friendTitle") }}</h2>
            <p>{{ t("lobby.friendBody") }}</p>
          </div>
          <button
            class="card-toggle"
            type="button"
            aria-labelledby="friends-title"
            aria-controls="friends-panel"
            :aria-expanded="expandedPanel === 'friends'"
            @click="togglePanel('friends')"
          >
            <AppIcon name="chevron" />
          </button>
        </div>
        <div id="friends-panel" class="card-panel">
          <button
            class="btn secondary"
            type="button"
            :disabled="offline"
            @click="store.send('room.create')"
          >
            <span>{{ t("lobby.createRoom") }}</span>
          </button>
          <form class="join-row" @submit.prevent="joinRoom">
            <label class="sr-only" for="room-code">{{
              t("lobby.roomCode")
            }}</label>
            <input
              id="room-code"
              ref="roomCodeInput"
              v-model="roomCode"
              class="code-input"
              :class="{ filled: roomCode, 'has-error': joinError }"
              inputmode="text"
              maxlength="6"
              :placeholder="t('lobby.roomCode')"
              autocomplete="off"
              autocapitalize="characters"
              spellcheck="false"
              :aria-invalid="joinError"
              :aria-describedby="joinError ? 'join-error' : undefined"
              @input="onRoomCodeInput"
            />
            <button class="btn dark" type="submit" :disabled="offline">
              <span>{{ t("lobby.joinRoom") }}</span>
            </button>
          </form>
          <p
            v-if="joinError"
            id="join-error"
            class="form-error join-error"
            role="alert"
          >
            <AppIcon name="warn" />
            {{ t("lobby.errRoomCodeEmpty") }}
          </p>
        </div>
      </article>

      <article
        class="mode-card match-card-lobby collapsible"
        :class="{ 'is-expanded': expandedPanel === 'matchmaking' }"
      >
        <div class="card-head">
          <span class="card-icon match"><AppIcon name="match" /></span>
          <div class="card-copy">
            <h2 id="match-title">{{ t("lobby.matchmakingTitle") }}</h2>
            <p>{{ t("lobby.matchmakingBody") }}</p>
          </div>
          <button
            class="card-toggle"
            type="button"
            aria-labelledby="match-title"
            aria-controls="match-panel"
            :aria-expanded="expandedPanel === 'matchmaking'"
            @click="togglePanel('matchmaking')"
          >
            <AppIcon name="chevron" />
          </button>
        </div>
        <div id="match-panel" class="card-panel">
          <button
            class="btn secondary"
            type="button"
            :disabled="offline"
            @click="store.send('queue.join')"
          >
            <span>{{ t("lobby.matchmakingAction") }}</span>
          </button>
        </div>
      </article>
    </div>
  </section>
</template>
