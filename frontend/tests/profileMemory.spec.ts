import { afterEach, describe, expect, it, vi } from "vitest";
import { profileMemory } from "../src/native";

// On the website the device keeps the last profile and a language chosen
// offline in localStorage (3.2.0); storage that fails keeps nothing.
afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("profile memory on the website", () => {
  it("keeps the last profile and reads it back", async () => {
    await profileMemory.rememberSession({
      nickname: "曜宇",
      locale: "zh-TW",
      default_number: null,
    });
    expect(window.localStorage.getItem("connect4.last-session")).toBe(
      JSON.stringify({
        nickname: "曜宇",
        locale: "zh-TW",
        default_number: null,
      }),
    );
    expect(await profileMemory.lastSession()).toEqual({
      nickname: "曜宇",
      locale: "zh-TW",
      default_number: null,
    });
  });

  it("keeps a default nickname's number (3.2.0 05)", async () => {
    await profileMemory.rememberSession({
      nickname: "玩家 4553",
      locale: "zh-TW",
      default_number: 4553,
    });
    expect(await profileMemory.lastSession()).toEqual({
      nickname: "玩家 4553",
      locale: "zh-TW",
      default_number: 4553,
    });
    // Saved before 3.2.0's number: read as a name of the player's own.
    window.localStorage.setItem(
      "connect4.last-session",
      JSON.stringify({ nickname: "A", locale: "en" }),
    );
    expect((await profileMemory.lastSession())?.default_number).toBeNull();
  });

  it("remembers whether the profile still has to go back", async () => {
    expect(await profileMemory.restorePending()).toBe(false);
    await profileMemory.setRestorePending(true);
    expect(await profileMemory.restorePending()).toBe(true);
    await profileMemory.setRestorePending(false);
    expect(window.localStorage.getItem("connect4.restore-pending")).toBeNull();
  });

  it("keeps a pending language until it is cleared", async () => {
    await profileMemory.setPendingLocale("en");
    expect(await profileMemory.pendingLocale()).toBe("en");
    await profileMemory.setPendingLocale(null);
    expect(await profileMemory.pendingLocale()).toBeNull();
    expect(window.localStorage.getItem("connect4.pending-locale")).toBeNull();
  });

  it("ignores what it cannot read", async () => {
    window.localStorage.setItem("connect4.last-session", "{not json");
    expect(await profileMemory.lastSession()).toBeNull();
    window.localStorage.setItem(
      "connect4.last-session",
      JSON.stringify({ nickname: "A", locale: "fr" }),
    );
    expect(await profileMemory.lastSession()).toBeNull();
    window.localStorage.setItem("connect4.pending-locale", "fr");
    expect(await profileMemory.pendingLocale()).toBeNull();
  });

  it("keeps nothing, and throws nothing, when storage fails", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    await expect(
      profileMemory.rememberSession({
        nickname: "A",
        locale: "en",
        default_number: null,
      }),
    ).resolves.toBeUndefined();
    await expect(profileMemory.setPendingLocale("en")).resolves.toBeUndefined();
    expect(await profileMemory.lastSession()).toBeNull();
    expect(await profileMemory.pendingLocale()).toBeNull();
  });
});
