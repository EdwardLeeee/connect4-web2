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

  it("keeps a change made offline until it is cleared (3.3.1)", async () => {
    const pending = { locale: "en", nickname: "曜宇" } as const;
    await profileMemory.setPendingProfile(pending);
    expect(await profileMemory.pendingProfile()).toEqual(pending);
    await profileMemory.setPendingProfile({ locale: "th", nickname: null });
    expect(await profileMemory.pendingProfile()).toEqual({
      locale: "th",
      nickname: null,
    });
    await profileMemory.setPendingProfile(null);
    expect(await profileMemory.pendingProfile()).toBeNull();
    expect(window.localStorage.getItem("connect4.pending-profile")).toBeNull();
  });

  it("reads a language 3.3.0 kept as a change of language only", async () => {
    window.localStorage.setItem("connect4.pending-locale", "th");
    expect(await profileMemory.pendingProfile()).toEqual({
      locale: "th",
      nickname: null,
    });
    // Replaced by the new record once anything is saved.
    await profileMemory.setPendingProfile({ locale: "en", nickname: "A" });
    expect(window.localStorage.getItem("connect4.pending-locale")).toBeNull();
    expect(await profileMemory.pendingProfile()).toEqual({
      locale: "en",
      nickname: "A",
    });
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
    expect(await profileMemory.pendingProfile()).toBeNull();
    window.localStorage.setItem("connect4.pending-profile", "{not json");
    expect(await profileMemory.pendingProfile()).toBeNull();
    window.localStorage.setItem(
      "connect4.pending-profile",
      JSON.stringify({ locale: "en", nickname: 7 }),
    );
    expect(await profileMemory.pendingProfile()).toBeNull();
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
    await expect(
      profileMemory.setPendingProfile({ locale: "en", nickname: "A" }),
    ).resolves.toBeUndefined();
    expect(await profileMemory.lastSession()).toBeNull();
    expect(await profileMemory.pendingProfile()).toBeNull();
  });
});
