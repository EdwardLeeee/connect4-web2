<script setup lang="ts">
// L12/L13: an invite link lands here. The guest fills in the nickname their
// friend will see, and joining takes a tap; if the room cannot be joined, the
// reason replaces the invitation on the same page.
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";
import { useInviteGone } from "../composables/useInviteGone";
import { isNative } from "../native";
import { ProfileError, useGameStore } from "../stores/game";
import AppIcon from "./AppIcon.vue";

const props = defineProps<{ code: string }>();
const store = useGameStore();
const router = useRouter();
const { t } = useI18n();

const REASONS: Record<string, string> = {
  room_not_found: "lobby.inviteGoneBody",
  room_full: "lobby.inviteFullBody",
  host_disconnected: "lobby.inviteHostOffBody",
};
const joining = ref(false);
const failure = ref<string | null>(null);
// R28: the website's app banner then opens the app without this room.
const gone = useInviteGone();
// The server, not the on-device game (which always shows online): joining
// ends that game, so it must not happen while the room is out of reach.
const online = computed(() => store.serverConnection === "online");

// L12 v2 (round 7): prefilled with this device's nickname, focused on entry.
// iPhone Safari keeps its keyboard down until the field is tapped. The app's
// web view would raise it over the field and both buttons, so the app leaves
// the field unfocused and a tap brings the keyboard, as in Safari (2026-10-19).
const nicknameEl = ref<HTMLInputElement | null>(null);
const nickname = ref(store.shownSession?.nickname ?? "");
const edited = ref(false);
const saveError = ref<string | null>(null);
const nicknameEmpty = computed(() => nickname.value.trim() === "");
const fieldError = computed(() =>
  nicknameEmpty.value
    ? t("profile.errNicknameEmpty")
    : saveError.value && t(`errors.${saveError.value}`, t("errors.generic")),
);

// The session can arrive after the page; fill it in unless the guest typed.
watch(
  () => store.shownSession?.nickname,
  (name) => {
    if (name && !edited.value) nickname.value = name;
  },
);

onMounted(() => {
  if (!isNative()) void nextTick(() => nicknameEl.value?.focus());
});

function onInput() {
  edited.value = true;
  saveError.value = null;
}

watch(
  () => store.errorCode,
  (code) => {
    if (!joining.value || !code) return;
    joining.value = false;
    if (code in REASONS) {
      failure.value = REASONS[code];
      gone.value = props.code;
      store.clearError();
    }
  },
  // Synchronous, so the reason replaces the toast before it ever renders.
  { flush: "sync" },
);

async function join() {
  if (!online.value || nicknameEmpty.value || joining.value) return;
  joining.value = true;
  saveError.value = null;
  // Save a changed nickname first, so the friend sees it from the first
  // snapshot of the game; a failed save keeps the guest on this page.
  if (nickname.value.trim() !== store.shownSession?.nickname) {
    try {
      await store.saveProfile(nickname.value, store.shownLocale);
    } catch (error) {
      joining.value = false;
      saveError.value = error instanceof ProfileError ? error.code : "generic";
      return;
    }
  }
  // Invite first (2026-10-16): an on-device AI game ends as the friend's room
  // is joined, as leaving it would, and before: while it runs, the server's
  // room would be left again (leaveServerState).
  if (onDeviceGame()) store.send("game.leave");
  store.send("room.join", { code: props.code });
}

function onDeviceGame(): boolean {
  return store.source === "local" && Boolean(store.game);
}

/** Not now: back to an on-device AI game left waiting, else the lobby. */
function toLobby() {
  void router.replace({ path: onDeviceGame() ? "/play" : "/" });
}
</script>

<template>
  <section class="center-screen">
    <div class="center-card invite-card" :class="{ 'is-gone': failure }">
      <span class="big-icon">
        <AppIcon :name="failure ? 'warn' : 'friends'" />
      </span>
      <p class="eyebrow">{{ t("lobby.inviteEyebrow") }}</p>
      <template v-if="failure">
        <h1>{{ t("lobby.inviteGone") }}</h1>
        <p class="lead">{{ t(failure, { code }) }}</p>
        <button class="btn primary big" type="button" @click="toLobby">
          <AppIcon name="back" />
          <span>{{ t("common.backToLobby") }}</span>
        </button>
      </template>
      <template v-else>
        <h1>{{ t("lobby.inviteTitle") }}</h1>
        <p class="lead">{{ t("lobby.inviteBodyName") }}</p>
        <div class="room-code-block">
          <span>{{ t("lobby.inviteRoom") }}</span>
          <strong>{{ code }}</strong>
        </div>
        <label class="invite-name">
          <span class="field-label">{{ t("lobby.inviteNameLabel") }}</span>
          <input
            ref="nicknameEl"
            v-model="nickname"
            :class="{ 'has-error': fieldError }"
            maxlength="18"
            autocomplete="nickname"
            enterkeyhint="go"
            :aria-invalid="Boolean(fieldError)"
            aria-describedby="invite-name-msg"
            @input="onInput"
            @keydown.enter.prevent="join"
          />
        </label>
        <p
          v-if="fieldError"
          id="invite-name-msg"
          class="form-error invite-name-msg"
          role="alert"
        >
          <AppIcon name="warn" />
          {{ fieldError }}
        </p>
        <p v-else id="invite-name-msg" class="invite-name-msg hint">
          {{ t("lobby.inviteNameHint") }}
        </p>
        <button
          class="btn primary big"
          type="button"
          :disabled="!online || nicknameEmpty"
          @click="join"
        >
          <AppIcon name="arrow" />
          <span>{{ t("lobby.joinRoom") }}</span>
        </button>
        <!-- R28 06-B: it names the AI game it returns to. -->
        <button class="btn ghost" type="button" @click="toLobby">
          <span>{{
            t(onDeviceGame() ? "lobby.notNowToGame" : "lobby.notNow")
          }}</span>
        </button>
      </template>
    </div>
  </section>
</template>
