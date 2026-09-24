<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { ProfileError, useGameStore } from "../stores/game";
import AppIcon from "./AppIcon.vue";

const emit = defineEmits<{ close: [] }>();
const store = useGameStore();
const { t } = useI18n();
const nickname = ref(store.session?.nickname ?? "");
const locale = ref<"zh-TW" | "en">(store.session?.locale ?? "zh-TW");
const errorCode = ref<string | null>(null);
// L10: an empty nickname is caught while typing, before anything is sent.
const nicknameEmpty = computed(() => nickname.value.trim() === "");
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
          :class="{
            'has-error': nicknameEmpty || errorCode === 'invalid_nickname',
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
      <div class="sheet-actions">
        <button class="btn secondary" type="button" @click="emit('close')">
          <span>{{ t("common.cancel") }}</span>
        </button>
        <button class="btn primary" type="submit" :disabled="nicknameEmpty">
          <span>{{ t("common.save") }}</span>
        </button>
      </div>
    </form>
  </div>
</template>
