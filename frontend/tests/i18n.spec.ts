/// <reference types="node" />
// vitest 5 globals no longer bring in Node types; this test reads backend sources.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { nextTick } from "vue";
import { i18n } from "../src/i18n";
import { LOCALES } from "../src/locales";

const backendDir = join(__dirname, "../../backend/connect4_app");
const ERROR_PATTERNS = [
  /GameRuleError\("([a-z_]+)"\)/g,
  /send_error\([^,]+,\s*"([a-z_]+)"\)/g,
  /ValueError\("([a-z_]+)"\)/g,
];
// Raised by the browser rather than the server.
const CLIENT_ERRORS = ["copy_failed", "generic"];

function backendErrorCodes(): string[] {
  const codes = new Set<string>();
  for (const file of readdirSync(backendDir)) {
    if (!file.endsWith(".py")) continue;
    const source = readFileSync(join(backendDir, file), "utf8");
    for (const pattern of ERROR_PATTERNS) {
      for (const match of source.matchAll(pattern)) codes.add(match[1]);
    }
  }
  return [...codes].sort();
}

function flatKeys(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null) return [prefix];
  return Object.entries(value).flatMap(([key, child]) =>
    flatKeys(child, prefix ? `${prefix}.${key}` : key),
  );
}

describe("translations", () => {
  const locales = LOCALES;

  it("finds the backend error codes", () => {
    expect(backendErrorCodes()).toEqual(
      expect.arrayContaining(["room_not_found", "invalid_nickname"]),
    );
  });

  it.each(locales)("explains every error code in %s", (locale) => {
    const errors = i18n.global.getLocaleMessage(locale).errors as Record<
      string,
      string
    >;
    const missing = [...backendErrorCodes(), ...CLIENT_ERRORS].filter(
      (code) => !errors[code],
    );
    expect(missing).toEqual([]);
  });

  it("offers the same messages in every language", () => {
    const [chinese, ...others] = locales.map((locale) =>
      flatKeys(i18n.global.getLocaleMessage(locale)).sort(),
    );
    expect(others).toHaveLength(2);
    for (const keys of others) expect(keys).toEqual(chinese);
  });

  it("names a default nickname as the server does, in Thai too", () => {
    const named = (locale: (typeof LOCALES)[number]) =>
      i18n.global.t("session.defaultNickname", { n: 4553 }, { locale });
    expect(LOCALES.map(named)).toEqual([
      "玩家 4553",
      "Player 4553",
      "ผู้เล่น 4553",
    ]);
  });

  it("lists every language by its own name", () => {
    for (const locale of locales) {
      const profile = i18n.global.getLocaleMessage(locale).profile as Record<
        string,
        string
      >;
      expect([profile.chinese, profile.english, profile.thai]).toEqual([
        "繁體中文",
        "English",
        "ไทย",
      ]);
    }
  });
});

describe("the page's language", () => {
  it("follows the language shown, for screen readers and line breaks", async () => {
    const shown: string[] = [];
    for (const locale of ["th", "en", "zh-TW"] as const) {
      i18n.global.locale.value = locale;
      await nextTick();
      shown.push(document.documentElement.lang);
    }
    expect(shown).toEqual(["th", "en", "zh-Hant"]);
  });
});
