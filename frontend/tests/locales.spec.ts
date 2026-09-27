import { describe, expect, it } from "vitest";
import { detectLocale, isLocale } from "../src/locales";

describe("the language a first visit starts in (3.3.0)", () => {
  it.each([
    [["zh-TW"], "zh-TW"],
    [["zh-Hant-TW"], "zh-TW"],
    [["zh-Hans-CN"], "zh-TW"],
    [["ZH_hk"], "zh-TW"],
    [["th"], "th"],
    [["th-TH"], "th"],
    [["en-GB"], "en"],
    [["fr-FR"], "en"],
    [[], "en"],
  ] as const)("%j starts in %s", (languages, locale) => {
    expect(detectLocale(languages)).toBe(locale);
  });

  it("takes the first language the game speaks, as browsers negotiate", () => {
    expect(detectLocale(["fr-FR", "th-TH"])).toBe("th");
    expect(detectLocale(["ja", "en-US", "zh-TW"])).toBe("en");
    expect(detectLocale(["en-US", "zh-TW"])).toBe("en");
  });
});

it("knows the three languages", () => {
  expect(["zh-TW", "en", "th", "ja", "zh", null].map(isLocale)).toEqual([
    true,
    true,
    true,
    false,
    false,
    false,
  ]);
});
