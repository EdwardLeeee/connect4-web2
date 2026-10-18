<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch, watchEffect } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute, useRouter } from "vue-router";
import AppBanner from "./components/AppBanner.vue";
import AppIcon from "./components/AppIcon.vue";
import OtherTabScreen from "./components/OtherTabScreen.vue";
import ProfileSheet from "./components/ProfileSheet.vue";
import { useInviteGone } from "./composables/useInviteGone";
import { useMedia } from "./composables/useMedia";
import { useProfileSheet } from "./composables/useProfileSheet";
import { shownKey } from "./appText";
import { isNative, usesLocalAi } from "./native";
import { useGameStore } from "./stores/game";
import { activityRoute } from "./utils/activityRoute";
import {
  bannerDismissed,
  bannerRoute,
  bannerShown,
  dismissBanner,
} from "./utils/appBanner";
import { listenForInviteLinks } from "./utils/deepLink";
import { roomCodeFrom } from "./utils/invite";
import { initial } from "./utils/presentation";

const store = useGameStore();
const router = useRouter();
const route = useRoute();
const { t } = useI18n();
const profileOpen = useProfileSheet();
// 3.3.2: the app is named for itself (see appText.ts), its window title too.
const app = isNative();
watchEffect(() => {
  if (app) document.title = t("app.brand");
});

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

// R28 B: "open in the app" on an iPhone's website (bannerShown has where).
// ✕ keeps it closed in this browser.
const bannerWay = bannerRoute(navigator.userAgent, {
  native: app,
  standalone: (navigator as { standalone?: boolean }).standalone === true,
});
const bannerClosed = ref(bannerDismissed());
const inviteGone = useInviteGone();
const banner = computed(() =>
  bannerShown(bannerWay, {
    closed: bannerClosed.value,
    path: route.path,
    view: view.value,
    room: roomCodeFrom(route.query.room),
    gone: inviteGone.value,
  }),
);

function closeBanner() {
  bannerClosed.value = true;
  dismissBanner();
}

watch(
  () => store.hasActivity,
  (active) => {
    const target = activityRoute(active, route.path, {
      invite: Boolean(roomCodeFrom(route.query.room)),
      onDevice: store.source === "local",
    });
    if (target) void router.replace(target);
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
  // An invite link the app was opened with goes to that room's invite page,
  // as /?room=CODE does on the website.
  if (app) {
    void listenForInviteLinks((room) => {
      void router.replace({ path: "/", query: { room } });
    }).catch(() => {});
  }
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
        'is-app': app,
        'has-sheet': profileOpen,
        'has-connection': connectionLabel && !lobbyOffline,
        'has-connection-short': lobbyOffline,
      },
    ]"
  >
    <AppBanner
      v-if="banner"
      :route="banner.route"
      :room="banner.room"
      @close="closeBanner"
    />
    <header class="topbar">
      <RouterLink class="brand" to="/" :aria-label="t(shownKey('common.home'))">
        <span class="brand-mark" aria-hidden="true">
          <i class="token green mini" />
          <i class="token pink mini" />
        </span>
        <span class="brand-text">{{ t(shownKey("common.brand")) }}</span>
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
            initial(store.shownSession?.nickname ?? "") || "?"
          }}</span>
          <span class="profile-name">{{
            store.shownSession?.nickname || "…"
          }}</span>
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
