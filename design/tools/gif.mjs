// Render a storyboard scene as an animated GIF so the timing can be felt in
// eog. Usage:
//   PLAYWRIGHT_BROWSERS_PATH=.playwright node design/tools/gif.mjs <base-url> <story-id> <out.gif> [ms=3400] [step=50]
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { chromium } from "../../frontend/node_modules/playwright/index.mjs";

const [base, id, out, total = "3400", step = "50"] = process.argv.slice(2);
const dir = mkdtempSync(join(tmpdir(), "c4gif-"));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
await page.goto(new URL(`mockups/round2/story.html?id=${id}&solo`, base).href);
await page.waitForSelector("body[data-ready='1']");
const scene = page.locator(".frame .scene").first();
let n = 0;
for (let t = 0; t <= Number(total); t += Number(step)) {
  await page.evaluate((ms) => {
    for (const a of document.getAnimations()) {
      a.pause();
      a.currentTime = ms;
    }
  }, t);
  const box = await scene.boundingBox();
  await page.screenshot({
    path: join(dir, `f${String(n++).padStart(4, "0")}.png`),
    clip: { x: box.x - 20, y: box.y - 20, width: box.width + 40, height: box.height + 40 },
  });
}
await browser.close();
// hold the last frame for 1.5 s before looping
execFileSync("convert", ["-delay", String(Number(step) / 10), join(dir, "f*.png"), "-delay", "150", join(dir, `f${String(n - 1).padStart(4, "0")}.png`), "-loop", "0", "-layers", "Optimize", out]);
rmSync(dir, { recursive: true });
console.log(`${out}: ${n} frames`);
