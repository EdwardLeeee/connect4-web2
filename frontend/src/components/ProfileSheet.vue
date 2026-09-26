<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { isNative } from "../native";
import { ProfileError, useGameStore } from "../stores/game";
import { clauses } from "../utils/presentation";
import AppIcon from "./AppIcon.vue";

const emit = defineEmits<{ close: [] }>();
// The privacy policy and the version at the foot of the sheet, on the
// website and in the app alike (spec: 隱私權政策小字).
const PRIVACY_URL =
  "https://github.com/EdwardLeeee/connect4-web2/blob/main/PRIVACY.md";
const APP_VERSION = __APP_VERSION__;

function openPrivacy(event: MouseEvent) {
  // The website follows the link into a new tab; the app hands it to the
  // system browser, which Capacitor does for window.open(..., "_blank").
  if (!isNative()) return;
  event.preventDefault();
  window.open(PRIVACY_URL, "_blank");
}
const store = useGameStore();
const { t } = useI18n();
const nickname = ref(store.session?.nickname ?? "");
const locale = ref<"zh-TW" | "en">(store.shownLocale);
const errorCode = ref<string | null>(null);
// 3.2.0 app 離線 03: offline the nickname is locked and only the language
// changes, at once; an empty nickname is then no error either.
const offline = computed(() => store.serverConnection === "offline");
// L10: an empty nickname is caught while typing, before anything is sent.
const nicknameEmpty = computed(
  () => !offline.value && nickname.value.trim() === "",
);
const fieldError = computed(() =>
  nicknameEmpty.value
    ? "errNicknameEmpty"
    : errorCode.value && `errors.${errorCode.value}`,
);
// Height the on-screen keyboard covers, so the phone sheet sits above it (L10).
const keyboardInset = ref(0);

function measureKeyboard() {
  const viewport = window.visualViewport;
  if (!viewport) return;
  keyboardInset.value = Math.max(
    0,
    Math.round(window.innerHeight - viewport.height - viewport.offsetTop),
  );
}

onMounted(() => {
  window.visualViewport?.addEventListener("resize", measureKeyboard);
  window.visualViewport?.addEventListener("scroll", measureKeyboard);
});

onUnmounted(() => {
  window.visualViewport?.removeEventListener("resize", measureKeyboard);
  window.visualViewport?.removeEventListener("scroll", measureKeyboard);
});

async function save() {
  if (nicknameEmpty.value) return;
  errorCode.value = null;
  try {
    await store.saveProfile(nickname.value, locale.value);
    emit("close");
  } catch (error) {
    errorCode.value = error instanceof ProfileError ? error.code : "generic";
  }
}
</script>

<template>
  <div class="scrim" role="presentation" @click.self="emit('close')">
    <form
      class="profile-sheet"
      aria-modal="true"
      role="dialog"
      aria-labelledby="profile-title"
      :style="keyboardInset ? { marginBottom: `${keyboardInset}px` } : {}"
      @submit.prevent="save"
    >
      <div class="sheet-handle" aria-hidden="true" />
      <h2 id="profile-title">{{ t("profile.title") }}</h2>
      <label>
        <span class="field-label">{{ t("profile.nickname") }}</span>
        <input
          v-model="nickname"
          :disabled="offline"
          :class="{
            'has-error': nicknameEmpty || errorCode === 'invalid_nickname',
            'is-locked': offline,
          }"
          maxlength="18"
          autocomplete="nickname"
          :aria-invalid="nicknameEmpty || errorCode === 'invalid_nickname'"
          :aria-describedby="fieldError ? 'nickname-error' : undefined"
        />
      </label>
      <p v-if="fieldError" id="nickname-error" class="form-error" role="alert">
        <AppIcon name="warn" />
        {{
          nicknameEmpty
            ? t("profile.errNicknameEmpty")
            : t(fieldError, t("errors.generic"))
        }}
      </p>
      <label>
        <span class="field-label">{{ t("profile.language") }}</span>
        <span class="select-field">
          <select v-model="locale">
            <option value="zh-TW">{{ t("profile.chinese") }}</option>
            <option value="en">{{ t("profile.english") }}</option>
          </select>
          <AppIcon name="chevron" />
        </span>
      </label>
      <p v-if="offline" class="notice-banner sheet-note" role="status">
        <AppIcon name="wifiOff" />
        <span class="clauses">
          <span
            v-for="(part, index) in clauses(t('profile.offlineNote'))"
            :key="index"
            >{{ part }}</span
          >
        </span>
      </p>
      <div class="sheet-actions">
        <button class="btn secondary" type="button" @click="emit('close')">
          <span>{{ t("common.cancel") }}</span>
        </button>
        <button class="btn primary" type="submit" :disabled="nicknameEmpty">
          <span>{{ t("common.save") }}</span>
        </button>
      </div>
      <p class="privacy-line">
        <a
          class="privacy-link"
          :href="PRIVACY_URL"
          target="_blank"
          rel="noopener noreferrer"
          @click="openPrivacy"
          >{{ t("profile.privacyPolicy") }}</a
        >
        <span aria-hidden="true">·</span>
        <span>{{ t("profile.appVersion", { v: APP_VERSION }) }}</span>
      </p>
    </form>
  </div>
</template>
