import { createRouter, createWebHistory } from "vue-router";
import GameView from "./views/GameView.vue";
import LobbyView from "./views/LobbyView.vue";

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", component: LobbyView },
    { path: "/play", component: GameView },
    { path: "/:pathMatch(.*)*", redirect: "/" },
  ],
});
