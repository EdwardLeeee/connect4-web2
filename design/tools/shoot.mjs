// Screenshot design mockups into artboards. Usage:
//   PLAYWRIGHT_BROWSERS_PATH=.playwright node design/tools/shoot.mjs <base-url> <out-dir> <job.json>
// job.json: [{ "url": "mockups/round1/p03.html?dir=a", "out": "R1-A1-....png",
//              "width": 1440, "height": 900, "mobile": false }]
// Unlike frontend/playwright.config.ts this keeps motion enabled (storyboards
// need mid-animation frames) and renders at DPR 2.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "../../frontend/node_modules/playwright/index.mjs";

const [base, outDir, jobFile] = process.argv.slice(2);
const jobs = JSON.parse(readFileSync(jobFile, "utf8"));
const browser = await chromium.launch();
for (const job of jobs) {
  const context = await browser.newContext({
    viewport: { width: job.width, height: job.height },
    deviceScaleFactor: job.dpr ?? 2,
    isMobile: Boolean(job.mobile),
    hasTouch: Boolean(job.mobile),
    locale: "zh-TW",
    colorScheme: "light",
  });
  const page = await context.newPage();
  await page.goto(new URL(job.url, base).href);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(150);
  // freeze looping animations at a representative frame so artboards are stable
  if (job.freezeAt !== false) {
    await page.evaluate((at) => {
      for (const a of document.getAnimations()) {
        a.pause();
        a.currentTime = at;
      }
    }, job.freezeAt ?? 360);
  } else {
    // storyboards freeze their own frames and flag when done
    await page.waitForSelector("body[data-ready='1']");
  }
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  await page.screenshot({ path: join(outDir, job.out), fullPage: Boolean(job.fullPage) });
  console.log(`${job.out}  overflow=${overflow}`);
  await context.close();
}
await browser.close();
