import { defineStore } from "pinia";
import { markRaw } from "vue";
import { i18n } from "../i18n";
import { isNative, tokenStore } from "../native";
import type { Snapshot } from "../types";
import { apiUrl, socketUrl } from "../utils/origin";

type ConnectionState = "connecting" | "online" | "offline" | "replaced";

// The server closes an older socket with this code when the same session opens
// a newer one (manager.py CLOSE_REPLACED). Reconnecting would evict the newer tab.
const CLOSE_REPLACED = 4001;

const PROFILE_ERRORS = new Set(["invalid_nickname", "invalid_locale"]);

// After a working connection drops, the screen stays as it was this long
// before it says so: a quick reconnect, as when a phone comes back from the
// background, shows nothing.
const QUIET_MS = 2000;
// Back after this long, an open socket may have died with the page suspended
// and no close event: it must answer a state request within PROBE_MS.
const PROBE_AFTER_MS = 10_000;
const PROBE_MS = 3000;

// A move is chosen against the board on screen, and a new connection starts
// with a snapshot: neither waits for a reconnect.
const NEVER_HELD = new Set(["game.move", "state.request"]);
const LOBBY_ACTIONS = new Set([
  "game.ai.start",
  "room.create",
  "room.join",
  "queue.join",
]);

interface Message {
  type: string;
  payload: Record<string, unknown>;
}

/** Whether a message held while reconnecting fits the state it came back to. */
function stillApplies(type: string, snapshot: Snapshot): boolean {
  const searching = snapshot.queue.searching && !snapshot.game;
  if (type === "queue.leave") return searching;
  if (LOBBY_ACTIONS.has(type)) return !snapshot.game && !searching;
  return Boolean(snapshot.game);
}

export class ProfileError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

// App only (docs/protocol.md "App 連線"): the session token, kept out of the
// reactive state. The website relies on its same-origin cookie instead.
let token: string | null = null;

/** GET or PATCH /api/session: the cookie on the website, the token in the app. */
async function sessionRequest(init: RequestInit): Promise<Response> {
  if (!isNative()) {
    return fetch(apiUrl("/api/session"), {
      ...init,
      credentials: "same-origin",
    });
  }
  token ??= await tokenStore.get();
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(apiUrl("/api/session"), {
    ...init,
    headers,
    credentials: "omit",
  });
}

/** The session in a reply; in the app, its token replaces the stored one. */
async function sessionFrom(response: Response): Promise<Snapshot["session"]> {
  const body = await response.json();
  if (isNative() && typeof body.token === "string") {
    token = body.token;
    await tokenStore.set(body.token);
  }
  return { nickname: body.nickname, locale: body.locale };
}

export const useGameStore = defineStore("game", {
  state: () => ({
    snapshot: null as Snapshot | null,
    connection: "connecting" as ConnectionState,
    errorCode: null as string | null,
    socket: null as WebSocket | null,
    retryTimer: null as number | null,
    retryCount: 0,
    recovering: false,
    deliberatelyClosed: false,
    // True from a drop until QUIET_MS pass or the connection is back.
    quiet: false,
    quietTimer: null as number | null,
    probeTimer: null as number | null,
    hiddenAt: null as number | null,
    // The last message sent while reconnecting, sent once the connection is back.
    held: null as Message | null,
    // A1: your move, on the board from the moment you let go until the
    // server's snapshot has it (index = its place in history).
    pendingMove: null as { column: number; index: number } | null,
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
    /** The connection the screen shows: a drop stays quiet for QUIET_MS. */
    shownConnection: (state): ConnectionState =>
      state.quiet ? "online" : state.connection,
    hasActivity(): boolean {
      return Boolean(this.game || this.searching);
    },
    canMove(): boolean {
      return Boolean(
        this.game &&
        this.game.status === "playing" &&
        this.game.turn === this.game.you &&
        this.connection === "online" &&
        !this.pendingMove,
      );
    },
  },

  actions: {
    async refreshSession() {
      const response = await sessionRequest({ cache: "no-store" });
      if (!response.ok) throw new Error("Unable to create session");
      const session = await sessionFrom(response);
      if (this.snapshot) this.snapshot.session = session;
      i18n.global.locale.value = session.locale;
    },

    async initialise() {
      this.recovering = true;
      try {
        await this.refreshSession();
      } finally {
        this.recovering = false;
      }
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
      // A reconnect stays "offline" even when coming back resets the backoff.
      if (this.connection !== "offline") {
        this.connection = this.retryCount ? "offline" : "connecting";
      }
      // The app's token rides in a subprotocol: WebSockets take no headers.
      // Raw, so this.socket stays comparable with the socket each handler holds.
      const socket = markRaw(
        isNative()
          ? new WebSocket(socketUrl(), [
              "connect4.v1",
              ...(token ? [`connect4.token.${token}`] : []),
            ])
          : new WebSocket(socketUrl()),
      );
      this.socket = socket;
      let connected = false;

      socket.addEventListener("message", (event) => {
        // A socket given up on (see probe) may still deliver late messages.
        if (this.socket !== socket) return;
        this.clearProbe();
        const message = JSON.parse(String(event.data));
        if (message.type === "state.snapshot") {
          // The first snapshot, not "open", means the connection works: the
          // server accepts an app whose token expired and then closes with
          // 4401, which must not reset the backoff or flash "online".
          const first = !connected;
          if (first) {
            connected = true;
            this.connection = "online";
            this.retryCount = 0;
            this.connectionEpoch += 1;
            this.endQuiet();
          }
          this.snapshot = message.payload as Snapshot;
          this.settleMove();
          if (typeof this.snapshot.server_time === "number") {
            this.clockOffset = this.snapshot.server_time - Date.now() / 1000;
          }
          i18n.global.locale.value = this.snapshot.session.locale;
          this.errorCode = null;
          if (first) this.sendHeld();
        } else if (message.type === "error") {
          this.errorCode = String(message.payload?.code ?? "generic");
          this.pendingMove = null;
        }
      });
      socket.addEventListener("close", (event) => {
        if (this.socket !== socket) return;
        this.socket = null;
        this.pendingMove = null;
        this.clearProbe();
        if (this.deliberatelyClosed) return;
        if (event.code === CLOSE_REPLACED) {
          this.deliberatelyClosed = true;
          this.connection = "replaced";
          if (this.retryTimer !== null) window.clearTimeout(this.retryTimer);
          this.retryTimer = null;
          this.endQuiet();
          this.held = null;
          return;
        }
        if (connected) this.beginQuiet();
        this.connection = "offline";
        const delay = Math.min(500 * 2 ** this.retryCount, 5000);
        this.retryCount += 1;
        this.retryTimer = window.setTimeout(() => {
          this.retryTimer = null;
          void this.recoverConnection();
        }, delay);
      });
    },

    /** The page went into the background. */
    suspend() {
      this.hiddenAt = Date.now();
    },

    /**
     * The page is visible again. A phone suspends a background page and drops
     * its socket, so reconnect now instead of waiting out the backoff.
     */
    resume() {
      const away = this.hiddenAt === null ? 0 : Date.now() - this.hiddenAt;
      this.hiddenAt = null;
      if (this.deliberatelyClosed) return;
      // Nobody saw a drop while hidden: its grace starts from coming back.
      if (this.quiet) this.beginQuiet();
      if (this.socket?.readyState === WebSocket.OPEN) {
        if (away >= PROBE_AFTER_MS) this.probe();
        return;
      }
      this.reconnectNow();
    },

    /**
     * Reconnects without waiting out the backoff, for example when the network
     * is back. A socket still connecting or a reconnect under way is left be.
     */
    reconnectNow() {
      if (this.deliberatelyClosed || this.recovering || this.socket) return;
      if (this.retryTimer !== null) window.clearTimeout(this.retryTimer);
      this.retryTimer = null;
      this.retryCount = 0;
      void this.recoverConnection();
    },

    /** Asks an open socket for the state and replaces it if it stays silent. */
    probe() {
      const socket = this.socket;
      if (!socket) return;
      this.clearProbe();
      socket.send(JSON.stringify({ type: "state.request", payload: {} }));
      this.probeTimer = window.setTimeout(() => {
        this.probeTimer = null;
        if (this.socket !== socket) return;
        // Its close event may never come; stop listening and start over.
        this.socket = null;
        this.pendingMove = null;
        socket.close();
        this.connection = "offline";
        this.beginQuiet();
        this.retryCount = 0;
        void this.recoverConnection();
      }, PROBE_MS);
    },

    clearProbe() {
      if (this.probeTimer !== null) window.clearTimeout(this.probeTimer);
      this.probeTimer = null;
    },

    beginQuiet() {
      this.quiet = true;
      if (this.quietTimer !== null) window.clearTimeout(this.quietTimer);
      this.quietTimer = window.setTimeout(() => {
        this.quietTimer = null;
        // A hidden page shows nothing; coming back starts a fresh grace.
        if (document.visibilityState !== "hidden") this.quiet = false;
      }, QUIET_MS);
    },

    endQuiet() {
      this.quiet = false;
      if (this.quietTimer !== null) window.clearTimeout(this.quietTimer);
      this.quietTimer = null;
    },

    sendHeld() {
      const held = this.held;
      this.held = null;
      if (held && this.snapshot && stillApplies(held.type, this.snapshot)) {
        this.send(held.type, held.payload);
      }
    },

    /**
     * Plays a column (A1): the token drops at once and the server's snapshot
     * confirms it, or a refusal takes it back. Returns whether it was sent.
     */
    move(column: number): boolean {
      const game = this.game;
      if (
        !game ||
        !this.canMove ||
        this.socket?.readyState !== WebSocket.OPEN
      ) {
        return false;
      }
      this.pendingMove = { column, index: game.history.length };
      this.send("game.move", { column });
      return true;
    },

    /** Ends a pending move once a snapshot has it or no longer allows it. */
    settleMove() {
      const pending = this.pendingMove;
      const game = this.game;
      const waiting =
        pending &&
        game?.status === "playing" &&
        game.turn === game.you &&
        game.history.length === pending.index;
      if (!waiting) this.pendingMove = null;
    },

    /** Takes the session back from the tab that replaced this one. */
    reclaim() {
      if (this.connection !== "replaced") return;
      this.retryCount = 0;
      this.connect();
    },

    async recoverConnection() {
      // One at a time: in the app, two session requests could each receive a
      // different token for the same socket.
      if (this.recovering) return;
      this.recovering = true;
      try {
        // The server keeps sessions in memory. Refreshing the HTTP session first
        // replaces a stale cookie after a restart before opening a new WebSocket.
        await this.refreshSession();
      } catch {
        // The WebSocket attempt below schedules the next backoff while offline.
      } finally {
        this.recovering = false;
      }
      if (!this.deliberatelyClosed) this.connect();
    },

    send(type: string, payload: Record<string, unknown> = {}) {
      if (this.socket?.readyState === WebSocket.OPEN) {
        this.socket.send(JSON.stringify({ type, payload }));
        return;
      }
      if (this.deliberatelyClosed) {
        this.errorCode = "generic";
        return;
      }
      // Reconnecting: the message waits for the connection (the last one wins),
      // so cancelling a search while the phone reconnects still cancels it.
      if (!NEVER_HELD.has(type)) this.held = { type, payload };
    },

    async saveProfile(nickname: string, locale: "zh-TW" | "en") {
      let response: Response;
      try {
        response = await sessionRequest({
          method: "PATCH",
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
      const session = await sessionFrom(response);
      if (this.snapshot) this.snapshot.session = session;
      i18n.global.locale.value = locale;
      this.send("state.request");
    },

    clearError() {
      this.errorCode = null;
    },
  },
});
