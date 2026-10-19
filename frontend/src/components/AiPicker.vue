<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import type { Color } from "../types";
import { LEVELS, warnsSuperFirst, type AiChoice } from "../utils/aiChoice";

// R29 01-B: 立即對戰 asks the level, who starts and your colour first. A
// sheet on phones and a centred dialog above 900px; it opens on `choice`.
const props = defineProps<{
  choice: AiChoice;
  /** The website cannot start while offline (立即對戰 is disabled too). */
  canStart: boolean;
}>();
const emit = defineEmits<{ start: [choice: AiChoice]; close: [] }>();
const { t } = useI18n();

const difficulty = ref(props.choice.difficulty);
const aiFirst = ref(props.choice.aiFirst);
const colour = ref<Color>(props.choice.colour);
const picked = computed<AiChoice>(() => ({
  difficulty: difficulty.value,
  aiFirst: aiFirst.value,
  colour: colour.value,
}));
const colours: Color[] = ["green", "pink"];
const dialog = ref<HTMLFormElement | null>(null);

function start() {
  if (props.canStart) emit("start", picked.value);
}

function onKey(event: KeyboardEvent) {
  if (event.key === "Escape") emit("close");
}

onMounted(() => {
  dialog.value?.focus();
  window.addEventListener("keydown", onKey);
});

onUnmounted(() => window.removeEventListener("keydown", onKey));
</script>

<template>
  <Teleport to="body">
    <div class="picker-scrim" role="presentation" @click.self="emit('close')">
      <form
        ref="dialog"
        class="ai-picker"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-picker-title"
        tabindex="-1"
        @submit.prevent="start"
      >
        <h2 id="ai-picker-title">{{ t("aiPicker.title") }}</h2>
        <div
          class="picker-levels"
          role="radiogroup"
          aria-labelledby="ai-picker-title"
        >
          <label
            v-for="level in LEVELS"
            :key="level"
            class="picker-level"
            :class="{ 'is-on': difficulty === level }"
          >
            <input
              v-model="difficulty"
              class="sr-only"
              type="radio"
              name="ai-level"
              :value="level"
            />
            <i class="picker-dot" aria-hidden="true" />
            <b>{{ t(`game.level.${level}`) }}</b>
            <small>{{ t(`aiPicker.${level}Body`) }}</small>
          </label>
        </div>
        <div class="picker-row">
          <span id="ai-picker-who" class="picker-label">{{
            t("aiPicker.who")
          }}</span>
          <div
            class="picker-seg"
            role="radiogroup"
            aria-labelledby="ai-picker-who"
          >
            <label
              v-for="first in [false, true]"
              :key="String(first)"
              :class="{ 'is-on': aiFirst === first }"
            >
              <input
                v-model="aiFirst"
                class="sr-only"
                type="radio"
                name="ai-first"
                :value="first"
              />
              {{ t(first ? "aiPicker.aiFirst" : "aiPicker.youFirst") }}
            </label>
          </div>
          <p v-if="warnsSuperFirst(picked)" class="picker-warn">
            {{ t("aiPicker.superFirst") }}
          </p>
        </div>
        <div class="picker-row">
          <span id="ai-picker-colour" class="picker-label">{{
            t("aiPicker.colour")
          }}</span>
          <div
            class="picker-seg"
            role="radiogroup"
            aria-labelledby="ai-picker-colour"
          >
            <label
              v-for="option in colours"
              :key="option"
              :class="{ 'is-on': colour === option }"
            >
              <input
                v-model="colour"
                class="sr-only"
                type="radio"
                name="ai-colour"
                :value="option"
              />
              <i
                class="token picker-swatch"
                :class="option"
                aria-hidden="true"
              />
              {{ t(`aiPicker.${option}`) }}
            </label>
          </div>
        </div>
        <button class="btn primary big" type="submit" :disabled="!canStart">
          <span>{{ t("aiPicker.start") }}</span>
        </button>
        <button class="btn ghost" type="button" @click="emit('close')">
          <span>{{ t("common.cancel") }}</span>
        </button>
      </form>
    </div>
  </Teleport>
</template>
