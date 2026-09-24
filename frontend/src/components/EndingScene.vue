<script setup lang="ts">
// The full-screen layer of the round 7 endings, ported from
// design/mockups/round2/r7.js: C5 win (sticker, rays, confetti cannons),
// F5 loss (storm, rain-cloud sticker, lightning on the board) and T5 draw
// (full-screen tug of war whose rope snaps, then a sticker). The board's own
// part of each ending lives in ConnectBoard; timing lives in styles.css.
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import type { Ending } from "../utils/ending";
import AppIcon from "./AppIcon.vue";

const props = defineProps<{ ending: Ending }>();
const emit = defineEmits<{ skip: [] }>();
const { t } = useI18n();

const COLOURS = ["var(--mint)", "var(--pink)", "var(--sun)", "var(--white)"];
const SHAPES = ["", "round", "strip"];
const height = window.innerHeight;

// Fixed offsets, so every ending looks the same (as in the drafts).
const shots = computed(() =>
  (["left", "right"] as const).flatMap((side) =>
    Array.from({ length: 32 }, (_, i) => {
      const dir = side === "left" ? 1 : -1;
      return {
        side,
        shape: SHAPES[i % 3],
        style: {
          "--dx": `${dir * (260 + ((i * 53) % 420))}px`,
          "--up": `${-(420 + ((i * 71) % 380))}px`,
          "--r": `${((i * 97) % 900) - 450}deg`,
          "--d": `${750 + ((i * 29) % 260)}ms`,
          "--dur": `${1800 + ((i * 61) % 600)}ms`,
          "--c": COLOURS[i % 4],
        },
      };
    }),
  ),
);

const streaks = Array.from({ length: 90 }, (_, i) => ({
  left: `${(i * 37) % 100}%`,
  "--d": `${900 + ((i * 53) % 700)}ms`,
  "--dur": `${520 + ((i * 29) % 260)}ms`,
}));

const drawRain = Array.from({ length: 60 }, (_, i) => ({
  shape: SHAPES[i % 3],
  style: {
    "--x": `${(i * 37) % 100}%`,
    "--dx": `${((i * 53) % 120) - 60}px`,
    "--r": `${((i * 97) % 720) - 360}deg`,
    "--d": `${1800 + ((i * 131) % 1100)}ms`,
    "--dur": `${2300 + ((i * 71) % 600)}ms`,
    "--fall-h": `${height + 60}px`,
    "--c": i % 2 ? "var(--pink)" : "var(--mint)",
  },
}));

// The sticker flies into the result panel; the second bolt strikes the board.
const flyStyle = ref<Record<string, string>>({});
const strikeStyle = ref<Record<string, string>>({});

function onKey(event: KeyboardEvent) {
  if (event.key === "Escape" && props.ending.skippable) emit("skip");
}

onMounted(() => {
  const card = document.querySelector(".result-card")?.getBoundingClientRect();
  if (card) {
    flyStyle.value = {
      "--fly-x": `${card.x + card.width / 2 - window.innerWidth / 2}px`,
      "--fly-y": `${card.y + 50 - window.innerHeight / 2}px`,
    };
  }
  const board = document.querySelector(".board")?.getBoundingClientRect();
  if (board) {
    strikeStyle.value = {
      left: `${board.x + board.width * 0.42}px`,
      top: `${board.y - 150}px`,
    };
  }
  window.addEventListener("keydown", onKey);
});

onUnmounted(() => window.removeEventListener("keydown", onKey));
</script>

<template>
  <Teleport to="body">
    <div class="ending-scene" :class="`ending-${ending.kind}`">
      <template v-if="ending.kind === 'win'">
        <div class="ending-scrim" aria-hidden="true" />
        <div class="ending-rays" aria-hidden="true" />
        <div class="ending-cannon" aria-hidden="true">
          <i
            v-for="(shot, index) in shots"
            :key="index"
            class="shot"
            :class="[shot.shape, shot.side]"
            :style="shot.style"
          />
        </div>
      </template>

      <div
        v-else-if="ending.kind === 'lose'"
        class="ending-storm"
        aria-hidden="true"
      >
        <div class="storm-dim" />
        <i
          v-for="(style, index) in streaks"
          :key="index"
          class="streak"
          :style="style"
        />
        <div class="storm-flash" />
        <svg class="bolt b1" viewBox="0 0 60 120">
          <path
            d="M34 2 L8 64 H28 L18 118 L54 46 H32 L44 2 Z"
            fill="#ffd23f"
            stroke="#1b1b1f"
            stroke-width="4"
            stroke-linejoin="round"
          />
        </svg>
        <svg class="bolt b2" viewBox="0 0 60 120" :style="strikeStyle">
          <path
            d="M34 2 L8 64 H28 L18 118 L54 46 H32 L44 2 Z"
            fill="#ffd23f"
            stroke="#1b1b1f"
            stroke-width="4"
            stroke-linejoin="round"
          />
        </svg>
      </div>

      <template v-else>
        <div class="ending-scrim" aria-hidden="true" />
        <div class="tug-stage" aria-hidden="true">
          <svg class="tug" viewBox="0 0 300 150">
            <line
              x1="8"
              y1="134"
              x2="292"
              y2="134"
              stroke="#1b1b1f"
              stroke-width="4"
              stroke-linecap="round"
            />
            <rect
              x="145"
              y="110"
              width="10"
              height="30"
              rx="2"
              fill="#ffd23f"
              stroke="#1b1b1f"
              stroke-width="3"
            />
            <g class="pull">
              <g class="rope-l">
                <line
                  x1="84"
                  y1="80"
                  x2="150"
                  y2="80"
                  stroke="#c98b2e"
                  stroke-width="9"
                  stroke-linecap="round"
                />
                <line
                  x1="84"
                  y1="80"
                  x2="150"
                  y2="80"
                  stroke="#1b1b1f"
                  stroke-width="2"
                  stroke-dasharray="3 7"
                />
              </g>
              <g class="rope-r">
                <line
                  x1="150"
                  y1="80"
                  x2="216"
                  y2="80"
                  stroke="#c98b2e"
                  stroke-width="9"
                  stroke-linecap="round"
                />
                <line
                  x1="150"
                  y1="80"
                  x2="216"
                  y2="80"
                  stroke="#1b1b1f"
                  stroke-width="2"
                  stroke-dasharray="3 7"
                />
              </g>
              <path
                class="snap-star"
                d="M150 50 l7 20 20 7 -20 7 -7 20 -7 -20 -20 -7 20 -7z"
                fill="#ffd23f"
                stroke="#1b1b1f"
                stroke-width="3.5"
              />
              <g
                v-for="side in ['l', 'r'] as const"
                :key="side"
                :class="`lean-${side}`"
              >
                <circle
                  :cx="side === 'l' ? 52 : 248"
                  cy="84"
                  r="32"
                  :fill="side === 'l' ? '#3ddc97' : '#ff5fa2'"
                  stroke="#1b1b1f"
                  stroke-width="5"
                />
                <!-- gritted teeth, squeezed eyes and a bead of sweat -->
                <path
                  :d="
                    side === 'l'
                      ? 'M36 70 l8 5 -8 5 M68 70 l-8 5 8 5'
                      : 'M232 70 l8 5 -8 5 M264 70 l-8 5 8 5'
                  "
                  fill="none"
                  stroke="#1b1b1f"
                  stroke-width="4"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
                <path
                  :d="side === 'l' ? 'M40 94 h24' : 'M236 94 h24'"
                  stroke="#1b1b1f"
                  stroke-width="4"
                  stroke-linecap="round"
                />
                <path
                  :d="
                    side === 'l'
                      ? 'M42 91 v6 M48 91 v6 M54 91 v6 M60 91 v6'
                      : 'M238 91 v6 M244 91 v6 M250 91 v6 M256 91 v6'
                  "
                  stroke="#1b1b1f"
                  stroke-width="2"
                />
                <path
                  class="sweat"
                  :d="
                    side === 'l'
                      ? 'M78 56 q-6 10 0 14 q6 -4 0 -14z'
                      : 'M274 56 q-6 10 0 14 q6 -4 0 -14z'
                  "
                  fill="#a8dcff"
                  stroke="#1b1b1f"
                  stroke-width="2.5"
                />
                <!-- a small hand gripping the rope -->
                <path
                  :d="side === 'l' ? 'M76 84 L90 80' : 'M224 84 L210 80'"
                  stroke="#1b1b1f"
                  stroke-width="7"
                  stroke-linecap="round"
                />
                <circle
                  :cx="side === 'l' ? 90 : 210"
                  cy="80"
                  r="6"
                  fill="#fff"
                  stroke="#1b1b1f"
                  stroke-width="3.5"
                />
              </g>
            </g>
          </svg>
        </div>
        <div class="ending-rain" aria-hidden="true">
          <i
            v-for="(piece, index) in drawRain"
            :key="index"
            class="confetti"
            :class="piece.shape"
            :style="piece.style"
          />
        </div>
      </template>

      <div
        class="ending-sticker"
        :class="`is-${ending.kind}`"
        :style="flyStyle"
        aria-hidden="true"
      >
        <span v-if="ending.kind === 'win'" class="big-trophy">
          <AppIcon name="trophy" />
        </span>
        <svg
          v-else-if="ending.kind === 'lose'"
          class="cloud"
          viewBox="0 0 160 150"
        >
          <g class="drops">
            <path class="drop d1" d="M44 104 q-6 11 0 15 q6 -4 0 -15z" />
            <path class="drop d2" d="M72 108 q-6 11 0 15 q6 -4 0 -15z" />
            <path class="drop d3" d="M100 104 q-6 11 0 15 q6 -4 0 -15z" />
            <path class="drop d4" d="M124 108 q-6 11 0 15 q6 -4 0 -15z" />
          </g>
          <path
            class="puff"
            d="M34 96 a24 24 0 0 1 4 -46 a34 34 0 0 1 62 -10 a26 26 0 0 1 30 56 z"
            stroke="#1b1b1f"
            stroke-width="6"
            stroke-linejoin="round"
          />
          <circle cx="68" cy="68" r="5" fill="#1b1b1f" />
          <circle cx="98" cy="68" r="5" fill="#1b1b1f" />
          <path
            d="M70 88 Q83 78 96 88"
            fill="none"
            stroke="#1b1b1f"
            stroke-width="5"
            stroke-linecap="round"
          />
        </svg>
        <strong>{{ t(ending.title.key, ending.title.args ?? {}) }}</strong>
        <span>{{ t(ending.sub.key, ending.sub.args ?? {}) }}</span>
        <small v-if="ending.skippable">{{ t("game.stickerSkip") }}</small>
      </div>

      <button
        v-if="ending.skippable"
        class="ending-skip"
        type="button"
        :aria-label="t('game.stickerSkip')"
        @click="emit('skip')"
      />
    </div>
  </Teleport>
</template>
