import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  APP_STORE_URL,
  FALLBACK_MS,
  FOCUS_SETTLE_MS,
  bannerDismissed,
  bannerHref,
  bannerRoute,
  bannerShown,
  dismissBanner,
  storeFallback,
} from "../src/utils/appBanner";

const IOS = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X)";
const WEBKIT = "AppleWebKit/605.1.15 (KHTML, like Gecko)";
const UA = {
  safari: `${IOS} ${WEBKIT} Version/18.6 Mobile/15E148 Safari/604.1`,
  chrome: `${IOS} ${WEBKIT} CriOS/141.0.7390.41 Mobile/15E148 Safari/604.1`,
  firefox: `${IOS} ${WEBKIT} FxiOS/143.0 Mobile/15E148 Safari/605.1.15`,
  instagram: `${IOS} ${WEBKIT} Mobile/15E148 Instagram 400.0.0.27.81 (iPhone15,3; iOS 18_6; zh_TW; zh-Hant; scale=3.00; 1290x2796; 811355427)`,
  facebook: `${IOS} ${WEBKIT} Mobile/15E148 [FBAN/FBIOS;FBAV/520.0.0.38.101;FBBV/1;FBDV/iPhone15,3;FBMD/iPhone;FBSN/iOS;FBSV/18.6;FBSS/3;FBID/phone;FBLC/zh_TW;FBOP/5]`,
  messenger: `${IOS} ${WEBKIT} Mobile/15E148 [FBAN/MessengerForiOS;FBAV/520.0.0.30.106;FBBV/1;FBDV/iPhone15,3;FBMD/iPhone;FBSN/iOS;FBSV/18.6]`,
  line: `${IOS} ${WEBKIT} Mobile/15E148 Safari Line/15.16.0`,
  lineFull: `${IOS} ${WEBKIT} Version/18.6 Mobile/15E148 Safari/604.1 Line/15.16.0`,
  webView: `${IOS} ${WEBKIT} Mobile/15E148`,
  lookalike: `${IOS} ${WEBKIT} Version/18.6 Mobile/15E148 Safari/604.1 OnLine/2.0`,
  ipad: `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ${WEBKIT} Version/18.6 Safari/605.1.15`,
  android:
    "Mozilla/5.0 (Linux; Android 15; SM-S938B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36",
  desktop:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
};
const web = { native: false, standalone: false };

describe("which way 打開 reaches the app (R28 08)", () => {
  it.each([
    ["Safari", UA.safari],
    ["Chrome", UA.chrome],
    ["Firefox", UA.firefox],
    ["an app whose name ends in Line/", UA.lookalike],
  ])("%s follows the subdomain's link", (_, ua) => {
    expect(bannerRoute(ua, web)).toBe("link");
  });

  it.each([
    ["Instagram", UA.instagram],
    ["Facebook", UA.facebook],
    ["Messenger", UA.messenger],
    ["LINE", UA.line],
    ["LINE with a full Safari tail", UA.lineFull],
    ["any web view that is not Safari", UA.webView],
  ])("%s uses the app's own scheme", (_, ua) => {
    expect(bannerRoute(ua, web)).toBe("scheme");
  });

  it("uses the scheme from the home screen too", () => {
    expect(bannerRoute(UA.safari, { native: false, standalone: true })).toBe(
      "scheme",
    );
  });

  it.each([
    ["an iPad", UA.ipad],
    ["Android", UA.android],
    ["a desktop", UA.desktop],
  ])("is not shown on %s", (_, ua) => {
    expect(bannerRoute(ua, web)).toBe("none");
  });

  it("is never shown in the app, whose web view says iPhone too", () => {
    expect(bannerRoute(UA.webView, { native: true, standalone: false })).toBe(
      "none",
    );
  });
});

describe("where 打開 goes", () => {
  it.each([
    ["link", "LAN427", "https://connect4-app.oraclelee.com/r/LAN427"],
    ["link", "", "https://connect4-app.oraclelee.com/open"],
    ["scheme", "LAN427", "oraclelee-fourinarow://r/LAN427"],
    ["scheme", "", "oraclelee-fourinarow://open"],
  ] as const)("%s with room %j: %s", (route, room, href) => {
    expect(bannerHref(route, room)).toBe(href);
  });
});

describe("where the banner shows (R28 07, 09)", () => {
  const at = {
    closed: false,
    path: "/",
    view: "lobby",
    room: "",
    gone: "",
  };

  it("shows on the lobby, opening the app alone", () => {
    expect(bannerShown("link", at)).toEqual({ route: "link", room: "" });
  });

  it("shows on the invite page with its room", () => {
    expect(
      bannerShown("scheme", { ...at, view: "invite", room: "LAN427" }),
    ).toEqual({ route: "scheme", room: "LAN427" });
  });

  it("drops a room that turned out full or gone (08)", () => {
    const invite = { ...at, view: "invite", room: "LAN427" };
    expect(bannerShown("link", { ...invite, gone: "LAN427" })).toEqual({
      route: "link",
      room: "",
    });
    expect(bannerShown("link", { ...invite, gone: "ABC123" })).toEqual({
      route: "link",
      room: "LAN427",
    });
  });

  it.each(["game", "waiting", "searching", "otherTab"])(
    "is not shown on %s",
    (view) => {
      expect(bannerShown("link", { ...at, path: "/play", view })).toBeNull();
    },
  );

  it("is not shown on /play while it still reads as the lobby", () => {
    expect(bannerShown("link", { ...at, path: "/play" })).toBeNull();
  });

  it("is not shown once closed, nor where it never applies", () => {
    expect(bannerShown("link", { ...at, closed: true })).toBeNull();
    expect(bannerShown("none", at)).toBeNull();
  });
});

describe("✕ keeps it closed in this browser", () => {
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("remembers it", () => {
    expect(bannerDismissed()).toBe(false);
    dismissBanner();
    expect(bannerDismissed()).toBe(true);
  });

  it("shows it, and closes quietly, when storage fails", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(bannerDismissed()).toBe(false);
    expect(() => dismissBanner()).not.toThrow();
  });
});

describe("the App Store after the scheme (in-app browsers)", () => {
  let visibility: DocumentVisibilityState;
  const leave = vi.fn();
  const ended = vi.fn();
  // Each test's wait, stopped afterwards so no listener outlives it.
  const running: (() => void)[] = [];
  const start = () => {
    const cancel = storeFallback(leave, ended);
    running.push(cancel);
    return cancel;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    visibility = "visible";
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => visibility,
    });
  });

  afterEach(() => {
    running.splice(0).forEach((cancel) => cancel());
    vi.useRealTimers();
    leave.mockReset();
    ended.mockReset();
  });

  const hide = () => {
    visibility = "hidden";
    document.dispatchEvent(new Event("visibilitychange"));
  };
  const show = () => {
    visibility = "visible";
    document.dispatchEvent(new Event("visibilitychange"));
  };

  it("goes to the App Store when no app takes the link", () => {
    start();
    vi.advanceTimersByTime(FALLBACK_MS - 1);
    expect(leave).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(leave).toHaveBeenCalledTimes(1);
    expect(ended).toHaveBeenCalledTimes(1);
    expect(APP_STORE_URL).toBe("https://apps.apple.com/app/id6816204087");
  });

  it("stays when the app opened, also after coming back", () => {
    start();
    window.dispatchEvent(new Event("blur"));
    hide();
    vi.advanceTimersByTime(FALLBACK_MS * 4);
    show();
    window.dispatchEvent(new Event("focus"));
    vi.advanceTimersByTime(FALLBACK_MS * 4);
    expect(leave).not.toHaveBeenCalled();
    expect(ended).toHaveBeenCalledTimes(1);
  });

  it("stays when the page is left (pagehide)", () => {
    start();
    window.dispatchEvent(new Event("pagehide"));
    vi.advanceTimersByTime(FALLBACK_MS * 4);
    expect(leave).not.toHaveBeenCalled();
    expect(ended).toHaveBeenCalledTimes(1);
  });

  it("waits while a prompt is up, however long", () => {
    start();
    vi.advanceTimersByTime(1000);
    window.dispatchEvent(new Event("blur"));
    vi.advanceTimersByTime(FALLBACK_MS * 10);
    expect(leave).not.toHaveBeenCalled();
  });

  it("goes as soon as a closed prompt leaves the page shown", () => {
    start();
    window.dispatchEvent(new Event("blur"));
    vi.advanceTimersByTime(5000);
    window.dispatchEvent(new Event("focus"));
    vi.advanceTimersByTime(FOCUS_SETTLE_MS - 1);
    expect(leave).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(leave).toHaveBeenCalledTimes(1);
  });

  it("stays when the page hides just after the prompt closes", () => {
    start();
    window.dispatchEvent(new Event("blur"));
    window.dispatchEvent(new Event("focus"));
    vi.advanceTimersByTime(FOCUS_SETTLE_MS - 100);
    hide();
    vi.advanceTimersByTime(FALLBACK_MS * 4);
    expect(leave).not.toHaveBeenCalled();
  });

  it("does not hurry on a focus without a prompt", () => {
    start();
    window.dispatchEvent(new Event("focus"));
    vi.advanceTimersByTime(FALLBACK_MS - 1);
    expect(leave).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(leave).toHaveBeenCalledTimes(1);
  });

  it("stops for good when cancelled", () => {
    const cancel = start();
    cancel();
    cancel();
    window.dispatchEvent(new Event("blur"));
    window.dispatchEvent(new Event("focus"));
    vi.advanceTimersByTime(FALLBACK_MS * 4);
    expect(leave).not.toHaveBeenCalled();
    expect(ended).toHaveBeenCalledTimes(1);
  });
});
