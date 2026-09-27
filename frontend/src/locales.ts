// The languages the game speaks (3.3.0 adds Thai). The server's LOCALES in
// backend/connect4_app/sessions.py hold the same three.
export const LOCALES = ["zh-TW", "en", "th"] as const;

export type Locale = (typeof LOCALES)[number];

export function isLocale(value: unknown): value is Locale {
  return (LOCALES as readonly unknown[]).includes(value);
}

/** `<html lang>` for each language: screen readers and line breaking use it. */
export const HTML_LANG: Record<Locale, string> = {
  "zh-TW": "zh-Hant",
  en: "en",
  th: "th",
};

/**
 * The language a first visit starts in: the first of the device's or the
 * browser's languages that the game speaks, as browsers negotiate
 * Accept-Language. Any Chinese is Traditional Chinese; none of the three is
 * English.
 */
export function detectLocale(languages: readonly string[]): Locale {
  for (const tag of languages) {
    const language = tag.toLowerCase().split(/[-_]/)[0];
    if (language === "zh") return "zh-TW";
    if (language === "th") return "th";
    if (language === "en") return "en";
  }
  return "en";
}

/** The browser's languages; an old WebView may give only `language`. */
export function deviceLanguages(): readonly string[] {
  if (typeof navigator === "undefined") return [];
  if (navigator.languages?.length) return navigator.languages;
  return navigator.language ? [navigator.language] : [];
}
