import { createRouter, createWebHistory } from "vue-router";
import GameView from "./views/GameView.vue";
import LobbyView from "./views/LobbyView.vue";

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", component: LobbyView },
    { path: "/play", component: GameView },
    // An invite link, /r/CODE (Universal Links match this path), lands on
    // the invite page that the older /?room=CODE links still open.
    {
      path: "/r/:code",
      redirect: (to) => ({
        path: "/",
        query: { ...to.query, room: String(to.params.code) },
      }),
    },
    { path: "/:pathMatch(.*)*", redirect: "/" },
  ],
});

// LINE reads openExternalBrowser=1 as the link opens (see shareUrl); the
// page then drops it from the address bar.
router.beforeEach((to) => {
  if (!("openExternalBrowser" in to.query)) return true;
  const { openExternalBrowser: _, ...query } = to.query;
  return { path: to.path, query, hash: to.hash, replace: true };
});
