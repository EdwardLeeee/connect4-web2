import { afterEach, describe, expect, it, vi } from "vitest";
import { shownKey } from "../src/appText";
import { i18n } from "../src/i18n";
import { LOCALES } from "../src/locales";

const native = vi.hoisted(() => ({ app: false }));
vi.mock("../src/native", () => ({ isNative: () => native.app }));

// Every key the app words differently (3.3.2, Apple 2.1).
const WEB_KEYS = [
  "common.brand",
  "common.home",
  "common.shareTitle",
  "common.shareText",
  "lobby.matchmakingBody",
  "game.drawSub",
];
const TRADEMARK = /connect ?4|connect four/i;

function shown(key: string, locale: (typeof LOCALES)[number]) {
  return i18n.global.t(shownKey(key), { code: "LAN427" }, { locale });
}

afterEach(() => {
  native.app = false;
});

describe("the app's own name (3.3.2)", () => {
  it.each(LOCALES)("never says Connect 4 in the app, in %s", (locale) => {
    native.app = true;
    for (const key of WEB_KEYS) {
      expect(shown(key, locale), key).not.toMatch(TRADEMARK);
    }
  });

  it("names the app as its home screen does", () => {
    native.app = true;
    expect(LOCALES.map((locale) => shown("common.brand", locale))).toEqual([
      "四子棋",
      "Four In A Row",
      "เรียงสี่",
    ]);
    expect(shown("common.shareText", "en")).toBe(
      "Play Four In A Row with me! Room LAN427",
    );
    expect(shown("game.drawSub", "en")).toBe(
      "All 42 slots are full and nobody got four in a row.",
    );
  });

  it("leaves the website's words as they were", () => {
    for (const key of WEB_KEYS) expect(shownKey(key)).toBe(key);
    expect(shown("common.brand", "en")).toBe("CONNECT 4");
    expect(shown("common.shareText", "zh-TW")).toBe(
      "來 Connect 4 跟我下一局！房號 LAN427",
    );
  });

  it("changes nothing else in the app", () => {
    native.app = true;
    expect(shownKey("game.win")).toBe("game.win");
    expect(shownKey("lobby.aiTitle")).toBe("lobby.aiTitle");
  });
});
