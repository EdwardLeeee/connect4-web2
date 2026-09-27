<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { clauses } from "../utils/presentation";

// A notice that wraps only between its clauses (see clauses()). With
// thai-only, Chinese and English stay plain text as before, and a Thai
// sentence breaks only between its phrases (3.3.0).
const props = defineProps<{ text: string; thaiOnly?: boolean }>();
const { locale } = useI18n();
const parts = computed(() =>
  props.thaiOnly && locale.value !== "th" ? null : clauses(props.text),
);
</script>

<template>
  <template v-if="!parts">{{ text }}</template>
  <span v-else class="clauses">
    <template v-for="(part, index) in parts" :key="index">
      <template v-if="part === ' '">{{ " " }}</template>
      <span v-else>{{ part }}</span>
    </template>
  </span>
</template>
