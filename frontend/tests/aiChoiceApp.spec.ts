import { describe, expect, it, vi } from "vitest";

// The app keeps the AI sheet's choice on the phone (R29 04), in Preferences.
const kept = vi.hoisted(() => new Map<string, string>());
vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => true },
}));
vi.mock("@capacitor/preferences", () => ({
  Preferences: {
    get: async ({ key }: { key: string }) => ({ value: kept.get(key) ?? null }),
    set: async ({ key, value }: { key: string; value: string }) => {
      kept.set(key, value);
    },
    remove: async ({ key }: { key: string }) => {
      kept.delete(key);
    },
  },
}));

describe("where the app keeps the AI sheet's choice", () => {
  it("keeps it on the phone, not in the web view's storage", async () => {
    const { aiChoiceMemory } = await import("../src/native");
    const choice = {
      difficulty: "easy",
      aiFirst: true,
      colour: "pink",
    } as const;
    await aiChoiceMemory.keep(choice);
    expect(JSON.parse(kept.get("ai-choice")!)).toEqual(choice);
    expect(localStorage.getItem("connect4.ai-choice")).toBeNull();
    expect(await aiChoiceMemory.load()).toEqual(choice);
  });
});
