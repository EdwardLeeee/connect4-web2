// Round-7 capture: labelled stills, storyboards and GIFs. Usage:
//   PLAYWRIGHT_BROWSERS_PATH=.playwright node design/tools/r7-capture.mjs <base-url> <out-dir> <jobs.json>
// job: { url, name, tag, sub, width, height, mobile?,
//        still?: true                       -> <name>.png (DPR 2)
//        frames?: [[ms, caption], ...]      -> <name>-分鏡.png (storyboard sheet)
//        gif?: { to, step, scale }          -> <name>-動畫.gif }
// Every image carries the same top-left tag (item + option + one line).
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { chromium } from "../../frontend/node_modules/playwright/index.mjs";

const [base, outDir, jobFile] = process.argv.slice(2);
const jobs = JSON.parse(readFileSync(jobFile, "utf8"));
const FONT = "Noto-Sans-CJK-TC-Bold";
const FONT_BLACK = "Noto-Sans-CJK-TC-Black";
const browser = await chromium.launch();

async function open(job, dpr) {
  const context = await browser.newContext({
    viewport: { width: job.width, height: job.height },
    deviceScaleFactor: dpr,
    isMobile: Boolean(job.mobile),
    hasTouch: Boolean(job.mobile),
    locale: "zh-TW",
  });
  const page = await context.newPage();
  await page.goto(new URL(job.url, base).href);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(150);
  const small = job.width < 700;
  // phones: the tag goes in a strip above the image so it covers nothing
  if (small) return { context, page };
  await page.evaluate(
    ([tag, sub, small]) => {
      const d = document.createElement("div");
      d.setAttribute(
        "style",
        `position:fixed;z-index:1000;top:${small ? 64 : 12}px;left:12px;max-width:${small ? 92 : 62}%;` +
          "padding:8px 14px;border:3px solid #1b1b1f;border-radius:12px;background:#ffd23f;" +
          "box-shadow:4px 4px 0 #1b1b1f;color:#1b1b1f;font-family:'Noto Sans CJK TC',sans-serif;" +
          `font-size:${small ? 17 : 22}px;font-weight:900;line-height:1.3`,
      );
      d.innerHTML = `${tag}<small style="display:block;font-size:${small ? 13 : 15}px;font-weight:700">${sub}</small>`;
      document.body.append(d);
    },
    [job.tag, job.sub, small],
  );
  return { context, page };
}

async function at(page, ms) {
  await page.evaluate((t) => {
    for (const a of document.getAnimations()) {
      a.pause();
      a.currentTime = t;
    }
    window.r7Frame?.(t);
  }, ms);
}

for (const job of jobs) {
  if (job.still) {
    const { context, page } = await open(job, 2);
    await at(page, job.freezeAt ?? 360);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    const out = join(outDir, `${job.name}.png`);
    await page.screenshot({ path: out });
    if (job.width < 700) {
      const dir = mkdtempSync(join(tmpdir(), "r7tag-"));
      const header = join(dir, "h.png");
      execFileSync("convert", [
        "-size", `${job.width * 2 - 40}x`, "-background", "#ffd23f", "-fill", "#1b1b1f",
        "(", "-font", FONT_BLACK, "-pointsize", "30", `caption:${job.tag}`, ")",
        "(", "-font", FONT, "-pointsize", "22", `caption:${job.sub}`, ")",
        "-append", "-bordercolor", "#ffd23f", "-border", "14x10",
        "-bordercolor", "#1b1b1f", "-border", "3", header,
      ]);
      execFileSync("convert", [
        "-background", "#fff4dc", header, "-gravity", "northwest", "-splice", "14x14",
        out, "-append", "+repage", out,
      ]);
      rmSync(dir, { recursive: true });
    }
    console.log(`${job.name}.png  overflow=${overflow}`);
    await context.close();
  }
  if (job.frames) {
    const dir = mkdtempSync(join(tmpdir(), "r7sb-"));
    const { context, page } = await open(job, 1);
    const args = [];
    for (const [i, [ms, caption]] of job.frames.entries()) {
      await at(page, ms);
      const file = join(dir, `f${String(i).padStart(2, "0")}.png`);
      await page.screenshot({ path: file });
      args.push("-label", `${(ms / 1000).toFixed(2)} 秒｜${caption}`, file);
    }
    await context.close();
    const grid = join(dir, "grid.png");
    execFileSync("montage", [
      "-font", FONT, "-pointsize", "20", "-background", "#fff4dc",
      ...args, "-tile", `${job.cols ?? 3}x`, "-geometry", `${job.cell ?? "600x375"}+14+14`, grid,
    ]);
    const header = join(dir, "header.png");
    execFileSync("convert", [
      "-background", "#ffd23f", "-fill", "#1b1b1f",
      "(", "-font", FONT_BLACK, "-pointsize", "34", `label:${job.tag}`, ")",
      "(", "-font", FONT, "-pointsize", "22", `label:${job.sub}`, ")",
      "-gravity", "west", "-append",
      "-bordercolor", "#ffd23f", "-border", "16x10",
      "-bordercolor", "#1b1b1f", "-border", "3",
      header,
    ]);
    const out = join(outDir, `${job.name}-分鏡.png`);
    execFileSync("convert", [
      "-background", "#fff4dc", header, "-gravity", "northwest",
      "-splice", "20x20", grid, "-append", "-bordercolor", "#fff4dc", "-border", "10", out,
    ]);
    rmSync(dir, { recursive: true });
    console.log(`${job.name}-分鏡.png  ${job.frames.length} frames`);
  }
  if (job.gif) {
    const dir = mkdtempSync(join(tmpdir(), "r7gif-"));
    const { context, page } = await open(job, 1);
    const { to, step = 50, scale = 66.67, from = 0 } = job.gif;
    let n = 0;
    for (let t = from; t <= to; t += step) {
      await at(page, t);
      await page.screenshot({ path: join(dir, `f${String(n++).padStart(4, "0")}.png`) });
    }
    await context.close();
    if (job.width < 700) {
      const header = join(dir, "header.png");
      execFileSync("convert", [
        "-size", `${job.width - 20}x`, "-background", "#ffd23f", "-fill", "#1b1b1f",
        "(", "-font", FONT_BLACK, "-pointsize", "17", `caption:${job.tag}`, ")",
        "(", "-font", FONT, "-pointsize", "12", `caption:${job.sub}`, ")",
        "-append", "-bordercolor", "#ffd23f", "-border", "8x6",
        "-bordercolor", "#1b1b1f", "-border", "2", "+repage", header,
      ]);
      for (let i = 0; i < n; i += 1) {
        const f = join(dir, `f${String(i).padStart(4, "0")}.png`);
        // +repage: otherwise the GIF keeps the header's small virtual canvas
        execFileSync("convert", ["-background", "#fff4dc", header, f, "-gravity", "center", "-append", "+repage", f]);
      }
    }
    const last = join(dir, `f${String(n - 1).padStart(4, "0")}.png`);
    const out = join(outDir, `${job.name}-動畫.gif`);
    execFileSync("convert", [
      "-delay", String(step / 10), join(dir, "f*.png"), "-delay", "180", last,
      "-resize", `${job.width < 700 ? 100 : scale}%`, "-loop", "0", "-layers", "Optimize", out,
    ]);
    rmSync(dir, { recursive: true });
    console.log(`${job.name}-動畫.gif  ${n} frames`);
  }
}
await browser.close();
