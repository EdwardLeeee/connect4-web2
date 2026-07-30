<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute, useRouter } from "vue-router";
import { useGameStore } from "./stores/game";

const store = useGameStore();
const router = useRouter();
const route = useRoute();
const { t } = useI18n();
const profileOpen = ref(false);
const nickname = ref("");
const locale = ref<"zh-TW" | "en">("zh-TW");
const profileError = ref(false);

const connectionLabel = computed(() =>
  store.connection === "online" ? "" : t(`connection.${store.connection}`),
);

watch(
  () => store.hasActivity,
  (active) => {
    if (active && route.path !== "/play") void router.replace("/play");
    if (!active && route.path !== "/") void router.replace("/");
  },
);

watch(
  () => store.session,
  (session) => {
    if (!session) return;
    nickname.value = session.nickname;
    locale.value = session.locale;
  },
  { immediate: true },
);

onMounted(async () => {
  try {
    await store.initialise();
  } catch {
    store.connection = "offline";
  }
});

async function saveProfile() {
  profileError.value = false;
  try {
    await store.saveProfile(nickname.value, locale.value);
    profileOpen.value = false;
  } catch {
    profileError.value = true;
  }
}
</script>

<template>
  <div class="app-shell" :class="{ 'game-active': store.hasActivity }">
    <header class="topbar">
      <RouterLink class="brand" to="/" aria-label="Connect 4 home">
        <span class="brand-mark" aria-hidden="true">
          <i class="mini-token green" />
          <i class="mini-token pink" />
        </span>
        {{ t("common.brand") }}
      </RouterLink>
      <div class="topbar-actions">
        <span v-if="connectionLabel" class="connection-pill" role="status">
          <span class="status-dot" />
          {{ connectionLabel }}
        </span>
        <button
          class="profile-button"
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
      <RouterView />
    </main>

    <Transition name="fade">
      <div v-if="store.errorCode" class="toast" role="alert">
        <span>{{ t(`errors.${store.errorCode}`, t("errors.generic")) }}</span>
        <button type="button" aria-label="Close" @click="store.clearError">
          ×
        </button>
      </div>
    </Transition>

    <Transition name="sheet">
      <div
        v-if="profileOpen"
        class="modal-backdrop"
        role="presentation"
        @click.self="profileOpen = false"
      >
        <form
          class="profile-sheet"
          aria-modal="true"
          role="dialog"
          @submit.prevent="saveProfile"
        >
          <div class="sheet-handle" aria-hidden="true" />
          <h2>{{ t("profile.title") }}</h2>
          <label>
            <span class="field-label">{{ t("profile.nickname") }}</span>
            <input
              v-model="nickname"
              maxlength="18"
              autocomplete="nickname"
              required
            />
          </label>
          <label>
            <span class="field-label">{{ t("profile.language") }}</span>
            <span class="select-field">
              <select v-model="locale">
                <option value="zh-TW">{{ t("profile.chinese") }}</option>
                <option value="en">{{ t("profile.english") }}</option>
              </select>
            </span>
          </label>
          <p v-if="profileError" class="form-error">
            {{ t("errors.invalid_payload") }}
          </p>
          <div class="button-row">
            <button
              class="button secondary"
              type="button"
              @click="profileOpen = false"
            >
              {{ t("common.cancel") }}
            </button>
            <button class="button primary" type="submit">
              {{ t("common.save") }}
            </button>
          </div>
        </form>
      </div>
    </Transition>
  </div>
</template>
