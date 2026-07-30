import { defineStore } from "pinia";
import { i18n } from "../i18n";
import type { Snapshot } from "../types";

type ConnectionState = "connecting" | "online" | "offline";

export const useGameStore = defineStore("game", {
  state: () => ({
    snapshot: null as Snapshot | null,
    connection: "connecting" as ConnectionState,
    errorCode: null as string | null,
    socket: null as WebSocket | null,
    retryTimer: null as number | null,
    retryCount: 0,
    deliberatelyClosed: false,
  }),

  getters: {
    game: (state) => state.snapshot?.game ?? null,
    room: (state) => state.snapshot?.room ?? null,
    searching: (state) => state.snapshot?.queue.searching ?? false,
    session: (state) => state.snapshot?.session ?? null,
    hasActivity(): boolean {
      return Boolean(this.game || this.searching);
    },
    canMove(): boolean {
      return Boolean(
        this.game &&
        this.game.status === "playing" &&
        this.game.turn === this.game.you &&
        this.connection === "online",
      );
    },
  },

  actions: {
    async refreshSession() {
      const response = await fetch("/api/session", {
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Unable to create session");
      const session = (await response.json()) as Snapshot["session"];
      if (this.snapshot) this.snapshot.session = session;
      i18n.global.locale.value = session.locale;
    },

    async initialise() {
      await this.refreshSession();
      this.connect();
    },

    connect() {
      if (
        this.socket &&
        (this.socket.readyState === WebSocket.CONNECTING ||
          this.socket.readyState === WebSocket.OPEN)
      ) {
        return;
      }
      this.deliberatelyClosed = false;
      this.connection = this.retryCount ? "offline" : "connecting";
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const socket = new WebSocket(`${protocol}//${window.location.host}/ws`);
      this.socket = socket;

      socket.addEventListener("open", () => {
        this.connection = "online";
        this.retryCount = 0;
        this.retryTimer = null;
      });
      socket.addEventListener("message", (event) => {
        const message = JSON.parse(String(event.data));
        if (message.type === "state.snapshot") {
          this.snapshot = message.payload as Snapshot;
          i18n.global.locale.value = this.snapshot.session.locale;
          this.errorCode = null;
        } else if (message.type === "error") {
          this.errorCode = String(message.payload?.code ?? "generic");
        }
      });
      socket.addEventListener("close", () => {
        if (this.socket === socket) this.socket = null;
        if (this.deliberatelyClosed) return;
        this.connection = "offline";
        const delay = Math.min(500 * 2 ** this.retryCount, 5000);
        this.retryCount += 1;
        this.retryTimer = window.setTimeout(() => {
          this.retryTimer = null;
          void this.recoverConnection();
        }, delay);
      });
    },

    async recoverConnection() {
      try {
        // The server keeps sessions in memory. Refreshing the HTTP session first
        // replaces a stale cookie after a restart before opening a new WebSocket.
        await this.refreshSession();
      } catch {
        // The WebSocket attempt below schedules the next backoff while offline.
      }
      if (!this.deliberatelyClosed) this.connect();
    },

    send(type: string, payload: Record<string, unknown> = {}) {
      if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
        this.errorCode = "generic";
        return;
      }
      this.socket.send(JSON.stringify({ type, payload }));
    },

    async saveProfile(nickname: string, locale: "zh-TW" | "en") {
      const response = await fetch("/api/session", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname, locale }),
      });
      if (!response.ok) throw new Error("invalid_profile");
      if (this.snapshot) {
        this.snapshot.session = await response.json();
      }
      i18n.global.locale.value = locale;
      this.send("state.request");
    },

    clearError() {
      this.errorCode = null;
    },
  },
});
