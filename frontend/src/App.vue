<script setup lang="ts">
import { computed, onMounted, onUnmounted, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute, useRouter } from "vue-router";
import AppIcon from "./components/AppIcon.vue";
import OtherTabScreen from "./components/OtherTabScreen.vue";
import ProfileSheet from "./components/ProfileSheet.vue";
import { useMedia } from "./composables/useMedia";
import { useProfileSheet } from "./composables/useProfileSheet";
import { usesLocalAi } from "./native";
import { useGameStore } from "./stores/game";
import { roomCodeFrom } from "./utils/invite";

const store = useGameStore();
const router = useRouter();
const route = useRoute();
const { t } = useI18n();
const profileOpen = useProfileSheet();

// Pill in the top bar while connecting or reconnecting; a replaced tab shows
// its own screen instead (P15). A quick reconnect shows nothing.
// Narrow screens (320–389px, spec 01): phones use the short "offline" text.
const phone = useMedia("(max-width: 620px)");
// 3.2.0 app 離線 04a: offline in the app's lobby, where the AI still works,
// the pill just says 「離線」 and the brand text stays from 360px up.
const lobbyOffline = computed(
  () =>
    usesLocalAi() &&
    store.shownConnection === "offline" &&
    view.value === "lobby",
);
const connectionLabel = computed(() => {
  if (store.shownConnection === "connecting") return t("connection.connecting");
  if (store.shownConnection === "offline") {
    if (lobbyOffline.value) return t("connection.offlineApp");
    return t(phone.value ? "connection.offlineShort" : "connection.offline");
  }
  return "";
});

const view = computed(() => {
  if (store.connection === "replaced") return "otherTab";
  if (route.path !== "/play") {
    return roomCodeFrom(route.query.room) ? "invite" : "lobby";
  }
  if (store.searching && !store.game) return "searching";
  if (store.game?.status === "waiting") return "waiting";
  return store.game ? "game" : "lobby";
});

watch(
  () => store.hasActivity,
  (active) => {
    if (active && route.path !== "/play") void router.replace("/play");
    if (!active && route.path !== "/") void router.replace("/");
  },
);

// A phone suspends a page in the background and drops its socket: coming
// back reconnects at once rather than after the retry backoff.
function onVisibilityChange() {
  if (document.visibilityState === "hidden") store.suspend();
  else store.resume();
}

function onPageShow(event: PageTransitionEvent) {
  if (event.persisted) store.resume();
}

function onOnline() {
  store.reconnectNow();
}

onMounted(async () => {
  document.addEventListener("visibilitychange", onVisibilityChange);
  window.addEventListener("pageshow", onPageShow);
  window.addEventListener("online", onOnline);
  try {
    await store.initialise();
  } catch {
    store.connection = "offline";
  }
});

onUnmounted(() => {
  document.removeEventListener("visibilitychange", onVisibilityChange);
  window.removeEventListener("pageshow", onPageShow);
  window.removeEventListener("online", onOnline);
});
</script>

<template>
  <div
    class="app"
    :class="[
      `view-${view}`,
      {
        'has-sheet': profileOpen,
        'has-connection': connectionLabel && !lobbyOffline,
        'has-connection-short': lobbyOffline,
      },
    ]"
  >
    <header class="topbar">
      <RouterLink class="brand" to="/" aria-label="Connect 4 home">
        <span class="brand-mark" aria-hidden="true">
          <i class="token green mini" />
          <i class="token pink mini" />
        </span>
        <span class="brand-text">{{ t("common.brand") }}</span>
      </RouterLink>
      <div class="topbar-actions">
        <span
          v-if="connectionLabel"
          class="connection-pill"
          :class="store.shownConnection"
          role="status"
        >
          <span class="status-dot" />
          {{ connectionLabel }}
        </span>
        <button
          class="profile"
          type="button"
          :aria-expanded="profileOpen"
          @click="profileOpen = true"
        >
          <span class="avatar">{{
            store.session?.nickname.slice(0, 1) || "?"
          }}</span>
          <span class="profile-name">{{ store.session?.nickname || "…" }}</span>
        </button>
      </div>
    </header>

    <main>
      <OtherTabScreen v-if="store.connection === 'replaced'" />
      <RouterView v-else v-slot="{ Component }">
        <Transition
          mode="out-in"
          enter-active-class="view-enter"
          leave-active-class="view-leave"
        >
          <component :is="Component" />
        </Transition>
      </RouterView>
    </main>

    <Transition name="fade">
      <div v-if="store.errorCode" class="toast" role="alert">
        <span class="toast-icon" aria-hidden="true">!</span>
        <span>{{ t(`errors.${store.errorCode}`, t("errors.generic")) }}</span>
        <button
          type="button"
          :aria-label="t('common.close')"
          @click="store.clearError"
        >
          <AppIcon name="close" />
        </button>
      </div>
    </Transition>

    <Transition name="fade">
      <ProfileSheet v-if="profileOpen" @close="profileOpen = false" />
    </Transition>
  </div>
</template>
