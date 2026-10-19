import { ref } from "vue";

// The room an invite page could not join (full, gone, host away). The
// website's app banner then only opens the app, without that room (R28).
const gone = ref("");

export function useInviteGone() {
  return gone;
}
