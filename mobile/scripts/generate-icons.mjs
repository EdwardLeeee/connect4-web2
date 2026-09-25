// Render every app icon and launch image straight from the vector sources in
// design/app-icon/, at each target size (never by scaling a bitmap).
// Usage: npm --prefix mobile run icons
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const mobile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const design = path.resolve(mobile, "../design/app-icon");
const res = path.join(mobile, "android/app/src/main/res");
const xcassets = path.join(mobile, "ios/App/App/Assets.xcassets");

const iosSvg = await readFile(path.join(design, "app-icon-ios.svg"));
const fgSvg = await readFile(path.join(design, "app-icon-android-fg.svg"));
const bgSvg = (await readFile(path.join(design, "app-icon-android-bg.svg"), "utf8")).trim();

// The adaptive background is a single flat rectangle; use its colour directly.
const bgMatch = bgSvg.match(/^<svg [^>]*viewBox="0 0 1024 1024"><rect width="1024" height="1024" fill="(#[0-9a-fA-F]{6})"\/><\/svg>$/);
if (!bgMatch) throw new Error("app-icon-android-bg.svg is no longer one flat rectangle; update this script");
const paper = bgMatch[1].toLowerCase();

// The sources are 1024-unit viewBoxes; librsvg renders them at 72 dpi, so this density
// makes the vector render at exactly `size` pixels.
const render = (svg, size) =>
  sharp(svg, { density: (72 * size) / 1024 }).resize(size, size, { fit: "fill" });

async function save(image, file) {
  await mkdir(path.dirname(file), { recursive: true });
  await image.png({ compressionLevel: 9 }).toFile(file);
}

async function expectPng(file, width, height, channels) {
  const meta = await sharp(file).metadata();
  if (meta.width !== width || meta.height !== height || meta.channels !== channels) {
    throw new Error(`${file}: got ${meta.width}x${meta.height}x${meta.channels}, want ${width}x${height}x${channels}`);
  }
}

// iOS: one 1024 image; the App Store rejects icons with an alpha channel.
const iosIcon = path.join(xcassets, "AppIcon.appiconset/AppIcon-512@2x.png");
await save(render(iosSvg, 1024).flatten({ background: paper }).removeAlpha(), iosIcon);
await expectPng(iosIcon, 1024, 1024, 3);

// Google Play listing icon: 512 x 512, 32-bit PNG. Not bundled into the app.
const playIcon = path.join(mobile, "store/play-icon-512.png");
await save(render(iosSvg, 512).flatten({ background: paper }).ensureAlpha(), playIcon);
await expectPng(playIcon, 512, 512, 4);

// Android launcher icons per density (dp -> px): adaptive foreground on a 108 dp
// canvas, legacy square and round icons (48 dp) for API 24-25.
const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
for (const [name, scale] of Object.entries(densities)) {
  const dir = path.join(res, `mipmap-${name}`);
  const fgSize = Math.round(108 * scale);
  await save(render(fgSvg, fgSize), path.join(dir, "ic_launcher_foreground.png"));

  // The launcher shows the middle 72 dp of the 108 dp canvas; crop that for legacy icons.
  const legacy = Math.round(48 * scale);
  const full = Math.round(legacy * 1.5);
  const composed = await sharp({ create: { width: full, height: full, channels: 4, background: paper } })
    .composite([{ input: await render(fgSvg, full).png().toBuffer() }])
    .png()
    .toBuffer();
  const inset = Math.round((full - legacy) / 2);
  const cropped = await sharp(composed)
    .extract({ left: inset, top: inset, width: legacy, height: legacy })
    .png()
    .toBuffer();
  const mask = (shape) =>
    Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${legacy}" height="${legacy}">${shape}</svg>`,
    );
  const r = legacy / 2;
  await save(
    sharp(cropped).composite([
      { input: mask(`<rect width="${legacy}" height="${legacy}" rx="${legacy * 0.16}"/>`), blend: "dest-in" },
    ]),
    path.join(dir, "ic_launcher.png"),
  );
  await save(
    sharp(cropped).composite([{ input: mask(`<circle cx="${r}" cy="${r}" r="${r}"/>`), blend: "dest-in" }]),
    path.join(dir, "ic_launcher_round.png"),
  );
}

await writeFile(
  path.join(res, "values/ic_launcher_background.xml"),
  `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${paper.toUpperCase()}</color>\n</resources>\n`,
);

// Launch images: the board centred on paper. Android 12+ draws its own splash from
// the launcher icon; these cover Android 7-11 and the iOS launch storyboard.
async function splash(file, width, height, artSize) {
  const art = await render(fgSvg, artSize).png().toBuffer();
  const composed = await sharp({ create: { width, height, channels: 3, background: paper } })
    .composite([{ input: art, gravity: "centre" }])
    .png()
    .toBuffer();
  await save(sharp(composed).removeAlpha(), file);
  await expectPng(file, width, height, 3);
}

const androidSplash = {
  drawable: [480, 320],
  "drawable-land-mdpi": [480, 320],
  "drawable-land-hdpi": [800, 480],
  "drawable-land-xhdpi": [1280, 720],
  "drawable-land-xxhdpi": [1600, 960],
  "drawable-land-xxxhdpi": [1920, 1280],
  "drawable-port-mdpi": [320, 480],
  "drawable-port-hdpi": [480, 800],
  "drawable-port-xhdpi": [720, 1280],
  "drawable-port-xxhdpi": [960, 1600],
  "drawable-port-xxxhdpi": [1280, 1920],
};
for (const [dir, [width, height]] of Object.entries(androidSplash)) {
  await splash(path.join(res, dir, "splash.png"), width, height, Math.round(Math.min(width, height) * 0.6));
}

// iOS fills the screen with this square (scaleAspectFill), so only its middle shows.
for (const name of ["splash-2732x2732.png", "splash-2732x2732-1.png", "splash-2732x2732-2.png"]) {
  await splash(path.join(xcassets, "Splash.imageset", name), 2732, 2732, 956);
}

console.log(`icons and launch images rendered from ${path.relative(process.cwd(), design)}`);
