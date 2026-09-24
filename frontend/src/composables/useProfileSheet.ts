import { ref } from "vue";

// The profile sheet lives in App.vue; the invite page's "Edit" opens it too.
const open = ref(false);

export function useProfileSheet() {
  return open;
}
