<script setup lang="ts">
// R28 B "App 資訊條": ✕, the app's icon and name over 「在 App 中打開」, and a
// mint 打開. App.vue decides where it shows and how 打開 reaches the app.
import { computed, onUnmounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import appIcon from "../assets/app-icon-132.png";
import { bannerHref, goToAppStore, storeFallback } from "../utils/appBanner";

const props = defineProps<{ route: "link" | "scheme"; room: string }>();
const emit = defineEmits<{ close: [] }>();
const { t } = useI18n();

const href = computed(() => bannerHref(props.route, props.room));
// While the in-app browser waits for the app: 開啟中… and a dimmed 打開.
const opening = ref(false);
let cancel: (() => void) | null = null;

// Safari's 打開 is a plain link with no handler at all: iOS hands a tapped
// link to the app, never one a script follows. Only the scheme waits here.
const onOpen = computed(() =>
  props.route === "scheme" ? { click: openWithFallback } : {},
);

function openWithFallback() {
  cancel?.();
  opening.value = true;
  cancel = storeFallback(goToAppStore, () => {
    opening.value = false;
    cancel = null;
  });
}

onUnmounted(() => cancel?.());
</script>

<template>
  <aside class="app-banner" aria-labelledby="app-banner-name">
    <button
      class="app-banner-close"
      type="button"
      :aria-label="t('banner.close')"
      @click="emit('close')"
    >
      <span aria-hidden="true">✕</span>
    </button>
    <img class="app-banner-icon" :src="appIcon" alt="" width="44" height="44" />
    <span class="app-banner-copy">
      <span id="app-banner-name" class="app-banner-name">{{
        t("banner.name")
      }}</span>
      <span class="app-banner-text">{{
        t(opening ? "banner.opening" : "banner.openInApp")
      }}</span>
    </span>
    <a
      class="app-banner-open"
      :class="{ 'is-busy': opening }"
      :href="href"
      v-on="onOpen"
      >{{ t("banner.open") }}</a
    >
  </aside>
</template>
