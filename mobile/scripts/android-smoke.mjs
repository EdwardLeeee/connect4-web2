// Play one whole game against the AI in the installed debug app on an Android
// emulator, talking to the production server. Run inside the emulator job:
//   node mobile/scripts/android-smoke.mjs <screenshot dir>
// Playwright comes from frontend/node_modules (its Android support is experimental).
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(new URL("../../frontend/package.json", import.meta.url));
const { _android } = require("@playwright/test");

const PKG = "com.oraclelee.connect4";
const PRIVACY_URL = "https://github.com/EdwardLeeee/connect4-web2/blob/main/PRIVACY.md";
const out = path.resolve(process.argv[2] ?? "smoke");
await mkdir(out, { recursive: true });

const [device] = await _android.devices();
if (!device) throw new Error("no Android device is connected");
const shot = (name) => device.screenshot({ path: path.join(out, `${name}.png`) });

await device.shell(`am start -W -n ${PKG}/.MainActivity`);
const webview = await device.webView({ pkg: PKG });
const page = await webview.page();
console.log(`app page: ${page.url()}`);

const start = page.locator(".ai-card button.btn.primary");
await start.waitFor({ state: "visible", timeout: 60_000 });
await shot("01-lobby");
await start.click();
await page.locator(".col-target").first().waitFor({ state: "attached", timeout: 30_000 });
await shot("02-game");

// Our move whenever a column is open; the solver answers after at least a second.
const finished = page.locator(".result-actions .btn").first();
const deadline = Date.now() + 5 * 60_000;
let moves = 0;
while (!(await finished.isVisible())) {
  if (Date.now() > deadline) {
    await shot("99-timeout");
    throw new Error(`the game did not finish within 5 minutes (${moves} moves played)`);
  }
  const open = page.locator('.col-target[aria-disabled="false"]');
  const count = await open.count();
  if (count > 0) {
    await open.nth(Math.floor(count / 2)).click();
    moves += 1;
  }
  await page.waitForTimeout(700);
}
await shot("03-result");
console.log(`game finished after ${moves} moves`);
if (moves < 4) throw new Error(`only ${moves} moves were played; a game needs at least 4`);

// A new-window link must leave the app for the system browser and keep the game page.
const before = page.url();
await page.evaluate((url) => window.open(url, "_blank"), PRIVACY_URL);
await page.waitForTimeout(4000);
const resumed = (await device.shell("dumpsys activity activities"))
  .toString()
  .split("\n")
  .find((line) => /mResumedActivity|topResumedActivity/.test(line));
console.log(`resumed after window.open: ${resumed?.trim() ?? "unknown"}`);
await shot("04-after-window-open");
if (page.url() !== before) throw new Error(`window.open navigated the app to ${page.url()}`);

await device.close();
