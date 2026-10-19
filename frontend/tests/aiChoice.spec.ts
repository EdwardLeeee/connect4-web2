import { afterEach, describe, expect, it, vi } from "vitest";
import { aiChoiceMemory } from "../src/native";
import {
  DEFAULT_CHOICE,
  keptChoice,
  readChoice,
  startPayload,
  warnsSuperFirst,
  type AiChoice,
} from "../src/utils/aiChoice";

const NORMAL_PINK: AiChoice = {
  difficulty: "normal",
  aiFirst: true,
  colour: "pink",
};

describe("the AI sheet's choice (R29 01, 03, 04)", () => {
  it("starts everyone on Super AI, you first, green", () => {
    expect(readChoice(null)).toEqual({
      difficulty: "super",
      aiFirst: false,
      colour: "green",
    });
  });

  it("reads back what it kept", () => {
    expect(readChoice(keptChoice(NORMAL_PINK))).toEqual(NORMAL_PINK);
  });

  it.each([
    ["not JSON", "{"],
    [
      "an unknown level",
      '{"difficulty":"hard","aiFirst":false,"colour":"green"}',
    ],
    [
      "a string for who starts",
      '{"difficulty":"easy","aiFirst":"true","colour":"green"}',
    ],
    [
      "an unknown colour",
      '{"difficulty":"easy","aiFirst":false,"colour":"blue"}',
    ],
    ["nothing", "null"],
  ])("falls back to the default on %s", (_, raw) => {
    expect(readChoice(raw)).toEqual(DEFAULT_CHOICE);
  });

  it("does not hand out the default itself", () => {
    readChoice(null).difficulty = "easy";
    expect(DEFAULT_CHOICE.difficulty).toBe("super");
  });

  it("sends all three of game.ai.start's options", () => {
    expect(startPayload(NORMAL_PINK)).toEqual({
      difficulty: "normal",
      ai_first: true,
      player_color: "pink",
    });
    expect(startPayload(DEFAULT_CHOICE)).toEqual({
      difficulty: "super",
      ai_first: false,
      player_color: "green",
    });
  });

  it.each([
    [{ ...DEFAULT_CHOICE, aiFirst: true }, true],
    [DEFAULT_CHOICE, false],
    [NORMAL_PINK, false],
    [{ ...NORMAL_PINK, difficulty: "easy" }, false],
  ] as const)(
    "warns only for a Super AI that starts (05-A): %j",
    (c, warns) => {
      expect(warnsSuperFirst(c)).toBe(warns);
    },
  );
});

describe("where the website keeps it", () => {
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("keeps it in this browser", async () => {
    await aiChoiceMemory.keep(NORMAL_PINK);
    expect(JSON.parse(localStorage.getItem("connect4.ai-choice")!)).toEqual(
      NORMAL_PINK,
    );
    expect(await aiChoiceMemory.load()).toEqual(NORMAL_PINK);
  });

  it("opens on the default when storage fails", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    await expect(aiChoiceMemory.keep(NORMAL_PINK)).resolves.toBeUndefined();
    expect(await aiChoiceMemory.load()).toEqual(DEFAULT_CHOICE);
  });
});
