<script setup lang="ts">
// 24px grid, 2.5px strokes; paths follow design/mockups/round2/render.js.
export type IconName =
  | "ai"
  | "friends"
  | "match"
  | "share"
  | "link"
  | "copy"
  | "check"
  | "warn"
  | "wifiOff"
  | "tabs"
  | "close"
  | "arrow"
  | "chevron"
  | "back"
  | "restart"
  | "trophy"
  | "flag"
  | "equal"
  | "user";

defineProps<{ name: IconName }>();
</script>

<template>
  <svg
    class="icon"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2.5"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <template v-if="name === 'ai'">
      <rect x="5" y="5" width="14" height="14" rx="3" />
      <path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3" />
      <path
        d="M12 8.5l1 2.5 2.5 1-2.5 1-1 2.5-1-2.5-2.5-1 2.5-1z"
        fill="currentColor"
        stroke-width="1.2"
      />
    </template>
    <template v-else-if="name === 'friends'">
      <circle cx="8.5" cy="12" r="5.5" />
      <circle cx="15.5" cy="12" r="5.5" />
    </template>
    <template v-else-if="name === 'match'">
      <path d="M3 7h4.5c2 0 3.2 1 4.5 3l1 2c1.3 2 2.5 3 4.5 3H21" />
      <path d="M18 12l3 3-3 3" />
      <path d="M3 17h4.5c1.5 0 2.5-.5 3.4-1.6" />
      <path d="M13.1 8.6C14 7.5 15 7 16.5 7H21" />
      <path d="M18 4l3 3-3 3" />
    </template>
    <template v-else-if="name === 'share'">
      <path d="M12 15V3M7.5 7.5L12 3l4.5 4.5" />
      <path d="M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
    </template>
    <template v-else-if="name === 'link'">
      <path d="M10 14a4.5 4.5 0 006.4 0l3-3a4.5 4.5 0 00-6.4-6.4l-1 1" />
      <path d="M14 10a4.5 4.5 0 00-6.4 0l-3 3a4.5 4.5 0 006.4 6.4l1-1" />
    </template>
    <template v-else-if="name === 'copy'">
      <rect x="8" y="8" width="12" height="12" rx="2.5" />
      <path d="M16 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h2" />
    </template>
    <path v-else-if="name === 'check'" d="M4.5 12.5l5 5 10-11" />
    <template v-else-if="name === 'warn'">
      <path d="M12 3l10 18H2z" />
      <path d="M12 10v4.5M12 17.6v.2" />
    </template>
    <template v-else-if="name === 'wifiOff'">
      <path
        d="M2 8.5a15 15 0 0120 0M5.5 12a10 10 0 0113 0M9 15.5a5 5 0 016 0"
      />
      <path d="M12 19.5v.1" />
      <path d="M3 3l18 18" />
    </template>
    <template v-else-if="name === 'tabs'">
      <rect x="3" y="7" width="13" height="12" rx="2" />
      <path d="M8 7V5a2 2 0 012-2h9a2 2 0 012 2v8a2 2 0 01-2 2h-3" />
    </template>
    <path v-else-if="name === 'close'" d="M6 6l12 12M18 6L6 18" />
    <path v-else-if="name === 'arrow'" d="M4 12h15M13 6l6 6-6 6" />
    <path v-else-if="name === 'chevron'" d="M6 9l6 6 6-6" />
    <path v-else-if="name === 'back'" d="M20 12H5M11 6l-6 6 6 6" />
    <template v-else-if="name === 'restart'">
      <path d="M4 12a8 8 0 1 0 2.4-5.7" />
      <path d="M4 4v5h5" />
    </template>
    <template v-else-if="name === 'trophy'">
      <path d="M8 4h8v5a4 4 0 01-8 0z" />
      <path d="M8 6H5a3 3 0 003 4M16 6h3a3 3 0 01-3 4" />
      <path d="M12 13v4M8.5 20h7M9.5 17h5" />
    </template>
    <template v-else-if="name === 'flag'">
      <path d="M5 21V4" />
      <path d="M5 4h11l-2 4 2 4H5" />
    </template>
    <path v-else-if="name === 'equal'" d="M6 9.5h12M6 14.5h12" />
    <template v-else-if="name === 'user'">
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 20a7.5 7.5 0 0115 0" />
    </template>
  </svg>
</template>
