import { defineStore } from "pinia";
import { i18n } from "../i18n";
import type { Snapshot } from "../types";
import { apiUrl, socketUrl } from "../utils/origin";

type ConnectionState = "connecting" | "online" | "offline" | "replaced";

// The server closes an older socket with this code when the same session opens
// a newer one (manager.py CLOSE_REPLACED). Reconnecting would evict the newer tab.
const CLOSE_REPLACED = 4001;

const PROFILE_ERRORS = new Set(["invalid_nickname", "invalid_locale"]);

export class ProfileError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

export const useGameStore = defineStore("game", {
  state: () => ({
    snapshot: null as Snapshot | null,
    connection: "connecting" as ConnectionState,
    errorCode: null as string | null,
    socket: null as WebSocket | null,
    retryTimer: null as number | null,
    retryCount: 0,
    deliberatelyClosed: false,
    // Increments on every successful connection, so views can tell a live
    // change apart from the state a fresh connection starts with.
    connectionEpoch: 0,
    // server_time minus the local clock, in seconds, from the latest snapshot.
    clockOffset: 0,
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
      const response = await fetch(apiUrl("/api/session"), {
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
      const socket = new WebSocket(socketUrl());
      this.socket = socket;

      socket.addEventListener("open", () => {
        this.connection = "online";
        this.retryCount = 0;
        this.retryTimer = null;
        this.connectionEpoch += 1;
      });
      socket.addEventListener("message", (event) => {
        const message = JSON.parse(String(event.data));
        if (message.type === "state.snapshot") {
          this.snapshot = message.payload as Snapshot;
          if (typeof this.snapshot.server_time === "number") {
            this.clockOffset = this.snapshot.server_time - Date.now() / 1000;
          }
          i18n.global.locale.value = this.snapshot.session.locale;
          this.errorCode = null;
        } else if (message.type === "error") {
          this.errorCode = String(message.payload?.code ?? "generic");
        }
      });
      socket.addEventListener("close", (event) => {
        if (this.socket === socket) this.socket = null;
        if (this.deliberatelyClosed) return;
        if (event.code === CLOSE_REPLACED) {
          this.deliberatelyClosed = true;
          this.connection = "replaced";
          if (this.retryTimer !== null) window.clearTimeout(this.retryTimer);
          this.retryTimer = null;
          return;
        }
        this.connection = "offline";
        const delay = Math.min(500 * 2 ** this.retryCount, 5000);
        this.retryCount += 1;
        this.retryTimer = window.setTimeout(() => {
          this.retryTimer = null;
          void this.recoverConnection();
        }, delay);
      });
    },

    /** Takes the session back from the tab that replaced this one. */
    reclaim() {
      if (this.connection !== "replaced") return;
      this.retryCount = 0;
      this.connect();
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
      let response: Response;
      try {
        response = await fetch(apiUrl("/api/session"), {
          method: "PATCH",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nickname, locale }),
        });
      } catch {
        throw new ProfileError("generic");
      }
      if (response.status === 422) {
        // Session rules reply {"detail": "<code>"}; request validation replies
        // with a list of issues, which has no user-facing code.
        const body = await response.json().catch(() => null);
        const detail: unknown = body?.detail;
        throw new ProfileError(
          typeof detail === "string" && PROFILE_ERRORS.has(detail)
            ? detail
            : "invalid_payload",
        );
      }
      if (!response.ok) throw new ProfileError("generic");
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
