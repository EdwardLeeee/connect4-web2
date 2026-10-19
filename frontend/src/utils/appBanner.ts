// The website's "open in the app" banner (R28 B, 3.4.0). On an iPhone's
// website only, never in the app; App.vue shows it on the lobby and the
// invite page. Nothing here is in native.ts, which the app's tests replace.
import { APP_LINK_ORIGIN } from "./origin";

export const APP_STORE_URL = "https://apps.apple.com/app/id6816204087";

/**
 * How 打開 reaches the app, or "none" where the banner is not shown.
 * - "link": Safari and the other browsers follow a link on APP_LINK_ORIGIN,
 *   which iOS hands to the app when installed; its server sends everyone
 *   else to the App Store. Anything we cannot place ends up here: at worst,
 *   the App Store page, which offers 打開 to those who have the app.
 * - "scheme": in-app browsers (IG, FB, Messenger, LINE, and any web view
 *   that does not call itself Safari) and a website added to the home screen
 *   use oraclelee-fourinarow://, with storeFallback() for those without it.
 */
export type BannerRoute = "none" | "link" | "scheme";

const IN_APP_BROWSER = /Instagram|FBAN\/|FBAV\/|\bLine\//;

export function bannerRoute(
  userAgent: string,
  { native, standalone }: { native: boolean; standalone: boolean },
): BannerRoute {
  // The app's own web view reports an iPhone too; an iPad reports a Mac.
  if (native || !/\biPhone\b/.test(userAgent)) return "none";
  if (standalone || IN_APP_BROWSER.test(userAgent)) return "scheme";
  return /\bSafari\//.test(userAgent) ? "link" : "scheme";
}

/**
 * The banner App.vue shows, or null: on the lobby and the invite page only.
 * /play never shows it, also while its view is "lobby" for a moment before
 * activityRoute leaves. A room the invite page could not join (gone) is not
 * passed on: 打開 then only opens the app.
 */
export function bannerShown(
  route: BannerRoute,
  {
    closed,
    path,
    view,
    room,
    gone,
  }: {
    closed: boolean;
    path: string;
    view: string;
    room: string;
    gone: string;
  },
): { route: "link" | "scheme"; room: string } | null {
  if (route === "none" || closed || path === "/play") return null;
  if (view === "lobby") return { route, room: "" };
  if (view === "invite") return { route, room: room === gone ? "" : room };
  return null;
}

/** Where 打開 goes: the invite's room, or the app as it is (lobby, room gone). */
export function bannerHref(route: "link" | "scheme", room: string): string {
  const path = room ? `r/${encodeURIComponent(room)}` : "open";
  return route === "link"
    ? `${APP_LINK_ORIGIN}/${path}`
    : `oraclelee-fourinarow://${path}`;
}

// ✕ keeps it closed in this browser; storage that fails keeps nothing.
const DISMISSED_KEY = "connect4.app-banner-dismissed";

export function bannerDismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

export function dismissBanner(): void {
  try {
    window.localStorage.setItem(DISMISSED_KEY, "1");
  } catch {
    // Closed for this page only.
  }
}

export function goToAppStore(): void {
  window.location.assign(APP_STORE_URL);
}

/** Still on the page this long after 打開: no app took the link. */
export const FALLBACK_MS = 2500;
/** After a prompt closes, the page must stay shown this long. */
export const FOCUS_SETTLE_MS = 300;

/**
 * The App Store fallback after an oraclelee-fourinarow:// link (ceo,
 * 2026-10-19). The page going away (hidden, pagehide) means the app opened:
 * nothing more happens, also when the guest comes back. A prompt ("open in
 * …?" or "cannot open") blurs the page and pauses the wait; once it closes
 * and the page is still shown, the App Store follows. Returns a cancel.
 */
export function storeFallback(
  leave: () => void,
  ended: () => void = () => {},
): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let prompted = false;
  let done = false;
  const wait = (ms: number) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      stop();
      leave();
    }, ms);
  };
  const onBlur = () => {
    prompted = true;
    clearTimeout(timer);
  };
  const onFocus = () => {
    if (prompted && document.visibilityState === "visible") {
      wait(FOCUS_SETTLE_MS);
    }
  };
  const onVisibility = () => {
    if (document.visibilityState === "hidden") stop();
  };
  function stop() {
    if (done) return;
    done = true;
    clearTimeout(timer);
    window.removeEventListener("blur", onBlur);
    window.removeEventListener("focus", onFocus);
    window.removeEventListener("pagehide", stop);
    document.removeEventListener("visibilitychange", onVisibility);
    ended();
  }
  window.addEventListener("blur", onBlur);
  window.addEventListener("focus", onFocus);
  window.addEventListener("pagehide", stop);
  document.addEventListener("visibilitychange", onVisibility);
  wait(FALLBACK_MS);
  return stop;
}
