// Offline smoke test of the installed debug app on an Android emulator, driven through the
// app's WebView with Playwright (its Android support is experimental). The app is built with an
// API origin that never resolves, so nothing here needs the production site, which Cloudflare
// blocks from the Ubuntu runners. Run by mobile/scripts/android-smoke.sh:
//   node mobile/scripts/android-smoke.mjs offline <screenshot dir>
//   node mobile/scripts/android-smoke.mjs language <screenshot dir> <play label> <nickname word>
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(new URL("../../frontend/package.json", import.meta.url));
const { _android } = require("@playwright/test");

const PKG = "com.oraclelee.connect4";
const NEW_NAME = "Smoke Tester";
// Generous while we learn how fast the emulator's WebView runs the on-device AI.
const AI_REPLY_MS = 60_000;

const [mode, outArg, play, nickname] = process.argv.slice(2);
const out = path.resolve(outArg ?? "smoke");
await mkdir(out, { recursive: true });

const [device] = await _android.devices();
if (!device) throw new Error("no Android device is connected");
const shot = (name) => device.screenshot({ path: path.join(out, `${name}.png`) });
const log = (line) => console.log(`SMOKE ${line}`);

async function launch() {
  await device.shell(`am start -W -n ${PKG}/.MainActivity`);
  const webview = await device.webView({ pkg: PKG }, { timeout: 60_000 });
  const page = await webview.page();
  await page.locator(".ai-card button.btn.primary").waitFor({ state: "visible", timeout: 60_000 });
  // Let the view's fade-in finish before any screenshot.
  await page.waitForTimeout(1000);
  return page;
}

async function relaunch() {
  await device.shell(`am force-stop ${PKG}`);
  return launch();
}

const avatar = (page) => page.locator("button.profile .avatar").innerText();

async function openProfile(page) {
  await page.locator("button.profile").click();
  const field = page.locator(".profile-sheet input").first();
  await field.waitFor({ state: "visible", timeout: 10_000 });
  return field;
}

async function expectDefaultNickname(page, word, tag) {
  const initial = await avatar(page);
  if (initial === "?") throw new Error(`${tag}: the avatar shows ? instead of a default nickname`);
  const field = await openProfile(page);
  const value = await field.inputValue();
  if (!new RegExp(`^${word} [0-9]{4}$`).test(value)) {
    throw new Error(`${tag}: the default nickname is "${value}", expected "${word} NNNN"`);
  }
  log(`${tag}: avatar "${initial}", nickname "${value}"`);
  return field;
}

// Plays the middle open column until the game ends or `maxMoves` of our moves are made.
async function playMoves(page, tag, maxMoves = Infinity) {
  const open = page.locator('.col-target[aria-disabled="false"]');
  const finished = page.locator(".result-actions .btn").first();
  const replies = [];
  let moves = 0;
  while (moves < maxMoves && !(await finished.isVisible())) {
    const count = await open.count();
    if (count === 0) {
      await page.waitForTimeout(300);
      continue;
    }
    await open.nth(Math.floor(count / 2)).click();
    moves += 1;
    const tapped = Date.now();
    await page.waitForTimeout(300);
    while ((await open.count()) === 0 && !(await finished.isVisible())) {
      if (Date.now() - tapped > AI_REPLY_MS) {
        await shot(`${tag}-timeout`);
        throw new Error(`${tag}: the AI did not answer move ${moves} within ${AI_REPLY_MS / 1000} s`);
      }
      await page.waitForTimeout(200);
    }
    const seconds = ((Date.now() - tapped) / 1000).toFixed(1);
    replies.push((await finished.isVisible()) ? `${seconds}(end)` : seconds);
  }
  log(`${tag}: ${moves} of our moves; seconds until our next turn: ${replies.join(" ")}`);
  return moves;
}

async function expectInMatchCard(page, name, when) {
  await page.locator(".match-card", { hasText: name }).waitFor({ timeout: 30_000 });
  log(`offline: AI game shows "${name}" ${when}`);
}

if (mode === "offline") {
  let page = await launch();
  await page.locator(".notice-banner").waitFor({ timeout: 30_000 });
  await shot("01-offline-lobby");

  // 3.3.1: renaming works offline and shows at once.
  const field = await expectDefaultNickname(page, "Player", "offline");
  await field.fill(NEW_NAME);
  await page.locator(".profile-sheet .sheet-actions .btn.primary").click();
  await page.locator(".profile-sheet").waitFor({ state: "detached", timeout: 10_000 });
  if ((await avatar(page)) !== "S") throw new Error("the avatar did not change after renaming");
  log('offline: avatar "S" after renaming offline');

  await page.locator(".ai-card button.btn.primary").click();
  await expectInMatchCard(page, NEW_NAME, "after renaming offline");
  await playMoves(page, "offline", 2);
  const chip = page.locator(".move-chip");
  await chip.waitFor({ timeout: 30_000 });
  const before = (await chip.innerText()).trim();
  await shot("02-before-restart");

  page = await relaunch();
  await page.locator(".move-chip", { hasText: before }).waitFor({ timeout: 60_000 });
  log(`offline: restored at "${before}" after relaunch`);
  await expectInMatchCard(page, NEW_NAME, "after relaunch");
  await shot("03-restored");
  const moves = await playMoves(page, "offline-after-restore");
  if (moves < 2) throw new Error("the restored game did not continue");
  if ((await avatar(page)) !== "S") throw new Error("the avatar lost the new name after relaunch");
  log('offline: avatar "S" after relaunch');
  await shot("04-result");
} else if (mode === "language") {
  const page = await launch();
  const label = (await page.locator(".ai-card button.btn.primary").innerText()).trim();
  if (!label.includes(play)) throw new Error(`the first screen shows "${label}", expected "${play}"`);
  await shot("01-lobby");
  await expectDefaultNickname(page, nickname, `first screen "${label}"`);
  await shot("02-profile");
} else {
  throw new Error(`unknown mode "${mode}"; use offline or language`);
}

await device.close();
