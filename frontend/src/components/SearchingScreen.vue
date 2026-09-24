<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { formatClock } from "../composables/useCountdown";
import { useGameStore } from "../stores/game";

const store = useGameStore();
const { t } = useI18n();
// A06: time since this screen opened; the server keeps no queue timestamp.
const started = Date.now();
const waited = ref(0);
let timer: number | null = null;

onMounted(() => {
  timer = window.setInterval(() => {
    waited.value = Math.floor((Date.now() - started) / 1000);
  }, 1000);
});
onUnmounted(() => {
  if (timer !== null) window.clearInterval(timer);
});
</script>

<template>
  <section class="center-screen">
    <div class="center-card">
      <div class="searching-anim" aria-hidden="true">
        <span class="lane">
          <i class="token green" />
          <i class="token pink" />
          <i class="token green" />
        </span>
      </div>
      <p class="eyebrow">{{ t("common.waiting") }}</p>
      <h1>{{ t("game.searching") }}</h1>
      <p class="lead">{{ t("game.searchingBody") }}</p>
      <p class="meta-row">
        <span class="meta-chip">{{
          t("game.waitedFor", { t: formatClock(waited) })
        }}</span>
      </p>
      <button
        class="btn secondary"
        type="button"
        @click="store.send('queue.leave')"
      >
        <span>{{ t("game.cancelSearch") }}</span>
      </button>
    </div>
  </section>
</template>
