import { defineConfig } from "@playwright/test";

const iphone = (
  name: string,
  width: number,
  height: number,
): { name: string; use: Record<string, unknown> } => ({
  name,
  use: {
    browserName: "webkit",
    viewport: { width, height },
    deviceScaleFactor: 3,
    hasTouch: true,
    isMobile: true,
  },
});

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://127.0.0.1:5173",
    locale: "zh-TW",
    colorScheme: "light",
    reducedMotion: "reduce",
  },
  expect: {
    toHaveScreenshot: {
      animations: "disabled",
      maxDiffPixelRatio: 0.005,
      threshold: 0.05,
    },
  },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    iphone("iphone-16e-17e", 390, 844),
    iphone("iphone-15-15pro-16", 393, 852),
    iphone("iphone-16pro-17-17pro", 402, 874),
    iphone("iphone-air", 420, 912),
    iphone("iphone-14promax-15plus-15promax-16plus", 430, 932),
    iphone("iphone-16promax-17promax", 440, 956),
    {
      name: "galaxy-s26-ultra",
      use: {
        browserName: "chromium",
        viewport: { width: 412, height: 892 },
        deviceScaleFactor: 3.5,
        hasTouch: true,
        isMobile: true,
      },
    },
    {
      name: "galaxy-s26-ultra-landscape",
      use: {
        browserName: "chromium",
        viewport: { width: 892, height: 412 },
        deviceScaleFactor: 3.5,
        hasTouch: true,
        isMobile: true,
      },
    },
    {
      name: "desktop-1366x768",
      use: {
        browserName: "chromium",
        viewport: { width: 1366, height: 768 },
      },
    },
    {
      name: "desktop-1440x900",
      use: {
        browserName: "chromium",
        viewport: { width: 1440, height: 900 },
      },
    },
  ],
});
