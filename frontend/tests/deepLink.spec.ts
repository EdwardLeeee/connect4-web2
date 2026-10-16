import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { listenForInviteLinks, roomFromLink } from "../src/utils/deepLink";

const app = vi.hoisted(() => ({
  launchUrl: undefined as string | undefined,
  listeners: [] as ((event: { url: string }) => void)[],
}));
vi.mock("@capacitor/app", () => ({
  App: {
    addListener: async (
      event: string,
      listener: (event: { url: string }) => void,
    ) => {
      if (event === "appUrlOpen") app.listeners.push(listener);
      return { remove: async () => {} };
    },
    getLaunchUrl: async () =>
      app.launchUrl ? { url: app.launchUrl } : undefined,
  },
}));

const SITE = "https://connect4.oraclelee.com";

beforeEach(() => {
  vi.stubEnv("VITE_SITE_ORIGIN", SITE);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
  app.launchUrl = undefined;
  app.listeners = [];
});

describe("the room an invite link opens (2026-10-16)", () => {
  it.each([
    [`${SITE}/r/LAN427`, "LAN427"],
    [`${SITE}/r/lan427`, "LAN427"],
    [`${SITE}/r/LAN427/`, "LAN427"],
    [`${SITE}/r/LAN427?openExternalBrowser=1`, "LAN427"],
    [`${SITE}/?room=LAN427`, "LAN427"],
    [`${SITE}/?room=lan427&openExternalBrowser=1`, "LAN427"],
    ["oraclelee-fourinarow://r/LAN427", "LAN427"],
    ["oraclelee-fourinarow://r/lan427/", "LAN427"],
    ["ORACLELEE-FOURINAROW://r/LAN427?from=button", "LAN427"],
  ])("opens %s", (link, room) => {
    expect(roomFromLink(link)).toBe(room);
  });

  it.each([
    "https://example.com/r/LAN427",
    "http://connect4.oraclelee.com/r/LAN427",
    `${SITE}/play?room=LAN427`,
    `${SITE}/r/LAN427/extra`,
    `${SITE}/r/LAN42`,
    `${SITE}/r/%E0%A4%A`,
    `${SITE}/?room=LAN427X`,
    "oraclelee-fourinarow://x/LAN427",
    "oraclelee-fourinarow://r/LAN427/extra",
    "other-scheme://r/LAN427",
    "not a link",
  ])("leaves %s alone", (link) => {
    expect(roomFromLink(link)).toBe("");
  });
});

describe("links handed to the app", () => {
  it("opens the link the app was launched with (Android's cold start)", async () => {
    app.launchUrl = `${SITE}/r/LAN427`;
    const open = vi.fn();
    await listenForInviteLinks(open);
    expect(open.mock.calls).toEqual([["LAN427"]]);
  });

  it("opens each link once when launch and appUrlOpen both report it (iOS)", async () => {
    vi.useFakeTimers();
    app.launchUrl = `${SITE}/r/LAN427`;
    const open = vi.fn();
    await listenForInviteLinks(open);
    app.listeners[0]({ url: `${SITE}/r/LAN427` });
    expect(open).toHaveBeenCalledTimes(1);

    // Another link at once, and the same one again later, both open.
    app.listeners[0]({ url: "oraclelee-fourinarow://r/ABC123" });
    vi.advanceTimersByTime(2000);
    app.listeners[0]({ url: `${SITE}/r/LAN427` });
    expect(open.mock.calls).toEqual([["LAN427"], ["ABC123"], ["LAN427"]]);
  });

  it("ignores links that are not invites", async () => {
    const open = vi.fn();
    await listenForInviteLinks(open);
    app.listeners[0]({ url: "https://example.com/r/LAN427" });
    expect(open).not.toHaveBeenCalled();
  });
});
