// Like the e2e runs (playwright.config.ts locale), unit tests start in a
// Traditional Chinese browser; tests that need another set their own.
Object.defineProperty(navigator, "languages", {
  configurable: true,
  get: () => ["zh-TW"],
});
