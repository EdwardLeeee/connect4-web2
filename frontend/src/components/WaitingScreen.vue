<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useMedia } from "../composables/useMedia";
import { isNative } from "../native";
import { useGameStore } from "../stores/game";
import { copyText } from "../utils/clipboard";
import { canShare, inviteUrl, shareInvite } from "../utils/invite";
import { qrPath } from "../utils/qr";
import AppIcon from "./AppIcon.vue";

const props = defineProps<{ code: string }>();
const store = useGameStore();
const { t } = useI18n();
// P02: one invite button. Phones share through the system sheet; desktops,
// and phones without it, copy the link. The app always shares.
const phone = useMedia("(max-width: 620px)");
const sharing = computed(() => isNative() || (phone.value && canShare()));
const qr = computed(() => qrPath(inviteUrl(props.code)));
// A06: once copied, the button keeps saying so until this screen closes.
const copied = ref(false);

async function copyLink() {
  if (await copyText(inviteUrl(props.code))) {
    copied.value = true;
  } else {
    store.errorCode = "copy_failed";
  }
}

async function share() {
  const result = await shareInvite(
    props.code,
    t("common.shareTitle"),
    t("common.shareText", { code: props.code }),
  );
  if (result === "copied") copied.value = true;
  if (result === "failed") store.errorCode = "copy_failed";
}
</script>

<template>
  <section class="center-screen">
    <div class="center-card waiting-card">
      <div class="waiting-main">
        <p class="eyebrow">{{ t("common.waiting") }}</p>
        <h1>{{ t("game.waitingFriend") }}</h1>
        <p class="lead">{{ t("game.waitingFriendBody") }}</p>
        <div class="room-code-block">
          <span>{{ t("lobby.roomCode") }}</span>
          <strong>{{ code }}</strong>
        </div>
        <div class="waiting-actions single">
          <button
            v-if="sharing && !copied"
            class="btn primary"
            type="button"
            @click="share"
          >
            <AppIcon name="share" />
            <span>{{ t("common.shareInvite") }}</span>
          </button>
          <button
            v-else
            class="btn primary"
            :class="{ 'is-done': copied }"
            type="button"
            @click="copyLink"
          >
            <AppIcon :name="copied ? 'check' : 'link'" />
            <span>{{
              copied ? t("common.copiedLink") : t("common.copyLink")
            }}</span>
          </button>
          <button
            class="btn ghost"
            type="button"
            @click="store.send('game.leave')"
          >
            <span>{{ t("common.leave") }}</span>
          </button>
        </div>
      </div>
      <figure class="qr-card">
        <svg
          class="qr"
          :viewBox="`0 0 ${qr.size} ${qr.size}`"
          role="img"
          :aria-label="t('game.qrAlt', { code })"
          shape-rendering="crispEdges"
        >
          <path :d="qr.d" />
        </svg>
        <figcaption>{{ t("game.scanToJoin") }}</figcaption>
      </figure>
    </div>
  </section>
</template>
