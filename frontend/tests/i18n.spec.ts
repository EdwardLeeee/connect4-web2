import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { i18n } from "../src/i18n";

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
  const locales = ["zh-TW", "en"] as const;

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

  it("offers the same messages in both languages", () => {
    const [chinese, english] = locales.map((locale) =>
      flatKeys(i18n.global.getLocaleMessage(locale)).sort(),
    );
    expect(chinese).toEqual(english);
  });
});
