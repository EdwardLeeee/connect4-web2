// node bench-browser.mjs <chromium|webkit> <throttle> <mode> <file>
import { createRequire } from "node:module";
const require = createRequire(new URL("../../../frontend/package.json", import.meta.url));
const pw = require("@playwright/test");
const [engine, throttle, mode, file] = process.argv.slice(2);
const browser = await pw[engine].launch();
const page = await browser.newPage();
await page.goto("http://127.0.0.1:8791/bench.html");
await page.waitForFunction(() => window.ready === true);
if (engine === "chromium" && Number(throttle) > 1) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: Number(throttle) });
}
const { results, wasmBytes } = await page.evaluate(([f, m]) => window.runPage(f, m), [file, mode]);
for (const r of results) {
  console.log([r.game, r.moves, r.ms.toFixed(3), r.best, "[" + r.scores.map((s) => (s ?? "null")).join(",") + "]"].join("\t"));
}
console.error(`${engine} throttle=${throttle} ${mode}: wasm memory ${wasmBytes} bytes, ua=${await page.evaluate(() => navigator.userAgent)}`);
await browser.close();
