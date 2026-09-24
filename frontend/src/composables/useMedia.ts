import { onUnmounted, ref } from "vue";

export function useMedia(query: string) {
  const list = window.matchMedia?.(query);
  const matches = ref(list?.matches ?? false);
  const update = (event: MediaQueryListEvent) => {
    matches.value = event.matches;
  };
  list?.addEventListener("change", update);
  onUnmounted(() => list?.removeEventListener("change", update));
  return matches;
}
