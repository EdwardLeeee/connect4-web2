<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { useGameStore } from "../stores/game";
import AppIcon from "./AppIcon.vue";

const store = useGameStore();
const { t } = useI18n();
</script>

<template>
  <section class="center-screen">
    <div class="center-card other-tab-card">
      <span class="big-icon"><AppIcon name="tabs" /></span>
      <h1>{{ t("game.otherTab") }}</h1>
      <p class="lead">{{ t("game.otherTabBody") }}</p>
      <button class="btn primary big" type="button" @click="store.reclaim()">
        <span>{{ t("game.continueHere") }}</span>
      </button>
    </div>
  </section>
</template>
