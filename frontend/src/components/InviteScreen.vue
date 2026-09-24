<script setup lang="ts">
// L12/L13: an invite link lands here. Joining takes a tap; if the room cannot
// be joined, the reason replaces the invitation on the same page.
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";
import { useProfileSheet } from "../composables/useProfileSheet";
import { useGameStore } from "../stores/game";
import AppIcon from "./AppIcon.vue";

const props = defineProps<{ code: string }>();
const store = useGameStore();
const router = useRouter();
const { t } = useI18n();
const profileOpen = useProfileSheet();

const REASONS: Record<string, string> = {
  room_not_found: "lobby.inviteGoneBody",
  room_full: "lobby.inviteFullBody",
  host_disconnected: "lobby.inviteHostOffBody",
};
const joining = ref(false);
const failure = ref<string | null>(null);
const online = computed(() => store.connection === "online");

watch(
  () => store.errorCode,
  (code) => {
    if (!joining.value || !code) return;
    joining.value = false;
    if (code in REASONS) {
      failure.value = REASONS[code];
      store.clearError();
    }
  },
  // Synchronous, so the reason replaces the toast before it ever renders.
  { flush: "sync" },
);

function join() {
  joining.value = true;
  store.send("room.join", { code: props.code });
}

function toLobby() {
  void router.replace({ path: "/" });
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
        <p class="lead">{{ t("lobby.inviteBody") }}</p>
        <div class="room-code-block">
          <span>{{ t("lobby.inviteRoom") }}</span>
          <strong>{{ code }}</strong>
        </div>
        <p class="invite-as">
          <AppIcon name="user" />
          <span>{{
            t("lobby.inviteAs", { name: store.session?.nickname ?? "…" })
          }}</span>
          <button class="link-btn" type="button" @click="profileOpen = true">
            {{ t("lobby.editName") }}
          </button>
        </p>
        <button
          class="btn primary big"
          type="button"
          :disabled="!online"
          @click="join"
        >
          <AppIcon name="arrow" />
          <span>{{ t("lobby.joinRoom") }}</span>
        </button>
        <button class="btn ghost" type="button" @click="toLobby">
          <span>{{ t("lobby.notNow") }}</span>
        </button>
      </template>
    </div>
  </section>
</template>
