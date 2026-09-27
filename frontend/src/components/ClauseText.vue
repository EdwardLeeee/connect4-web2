<script setup lang="ts">
import { clauses } from "../utils/presentation";

// A notice that wraps only between its clauses (see clauses()).
defineProps<{ text: string }>();
</script>

<template>
  <span class="clauses">
    <template v-for="(part, index) in clauses(text)" :key="index">
      <template v-if="part === ' '">{{ " " }}</template>
      <span v-else>{{ part }}</span>
    </template>
  </span>
</template>
