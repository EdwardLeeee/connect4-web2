import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { dropDuration } from "../src/composables/useDropQueue";
import type { Snapshot } from "../src/types";
import { pageSnapshot, SERVER_TIME, type PageId } from "./states";

// Layout numbers come from design/spec.md §3 and §10 (approved 2026-09-24).
const ASSET_VERSION = "v=20260924";

type SocketRoute = Parameters<Parameters<Page["routeWebSocket"]>[1]>[0];

interface MockOptions {
  /** Called with every message the page sends. */
  onMessage?: (message: { type: string; payload: unknown }) => void;
  /** Close every connection after the first, so the page stays offline. */
  refuseReconnects?: boolean;
}

async function mockApp(
  page: Page,
  snapshot: Snapshot,
  options: MockOptions = {},
) {
  const sockets: SocketRoute[] = [];
  await page.route("**/api/session", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(snapshot.session),
    });
  });
  await page.routeWebSocket(/\/ws$/, (socket) => {
    sockets.push(socket);
    if (options.refuseReconnects && sockets.length > 1) {
      void socket.close({ code: 1011 });
      return;
    }
    socket.onMessage((data) => {
      options.onMessage?.(JSON.parse(String(data)));
    });
    socket.send(JSON.stringify({ type: "state.snapshot", payload: snapshot }));
  });
  return {
    sockets,
    send(payload: Snapshot) {
      sockets.at(-1)!.send(JSON.stringify({ type: "state.snapshot", payload }));
    },
  };
}

function snapshotFor(id: PageId, locale: "zh-TW" | "en" = "zh-TW") {
  return pageSnapshot(id, locale);
}

function kind(testInfo: TestInfo) {
  const name = testInfo.project.name;
  if (name.startsWith("desktop-")) return "desktop" as const;
  if (name.endsWith("-landscape")) return "landscape" as const;
  return "phone" as const;
}

async function forceLanCopyFallback(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(window, "isSecureContext", {
      configurable: true,
      value: false,
    });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: undefined,
    });
    document.addEventListener(
      "copy",
      () => {
        const textarea =
          document.activeElement instanceof HTMLTextAreaElement
            ? document.activeElement
            : null;
        (window as typeof window & { __copied?: string[] }).__copied = [
          ...((window as typeof window & { __copied?: string[] }).__copied ??
            []),
          textarea?.value ?? "",
        ];
      },
      { capture: true },
    );
  });
}

async function expectTouchSafe(page: Page, selector: string) {
  const targets = await page.locator(selector).evaluateAll((elements) =>
    elements.map((element) => {
      const box = element.getBoundingClientRect();
      return {
        name: element.textContent?.trim() || element.getAttribute("aria-label"),
        // Rotated stickers leave sub-pixel noise in the layout.
        width: Math.round(box.width),
        height: Math.round(box.height),
      };
    }),
  );
  for (const target of targets) {
    expect(target.width, JSON.stringify(target)).toBeGreaterThanOrEqual(44);
    expect(target.height, JSON.stringify(target)).toBeGreaterThanOrEqual(44);
  }
}

async function horizontalOverflow(page: Page) {
  return page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
}

async function expectAlignedLobby(
  page: Page,
  expectedHeadings: string[],
  testInfo: TestInfo,
  locale: "zh-TW" | "en",
) {
  const layoutKind = kind(testInfo);

  await expect(page.locator(".hero-copy")).toHaveCount(0);
  await expect(page.locator(".badge")).toHaveCount(0);
  await expect(page.locator(".brand")).toContainText("CONNECT 4");
  await expect(page.locator(".mode-card h2")).toHaveText(expectedHeadings);
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);

  const layout = await page.locator(".mode-card").evaluateAll((cards) => {
    const rects = cards.map((card) => card.getBoundingClientRect());
    const grid = document
      .querySelector<HTMLElement>(".lobby-grid")!
      .getBoundingClientRect();
    return {
      brandFontSize: Number.parseFloat(
        getComputedStyle(document.querySelector<HTMLElement>(".brand")!)
          .fontSize,
      ),
      brandFont: getComputedStyle(document.querySelector(".brand")!).fontFamily,
      cardTops: rects.map((card) => card.top),
      cardBottoms: rects.map((card) => card.bottom),
      cardLefts: rects.map((card) => card.left),
      cardHeights: rects.map((card) => card.height),
      gridLeft: grid.left,
      gridRight: grid.right,
      viewportWidth: window.innerWidth,
      cardOverflow: cards.map((card) => card.scrollWidth - card.clientWidth),
    };
  });

  expect(layout.brandFontSize).toBe(layoutKind === "phone" ? 20 : 22);
  expect(layout.brandFont).toContain("Space Grotesk");
  for (const overflow of layout.cardOverflow) {
    expect(overflow).toBeLessThanOrEqual(1);
  }

  const roomCode = page.locator("#room-code");
  const friendToggle = page.locator(".friend-card .card-toggle");
  const matchmakingToggle = page.locator(".match-card-lobby .card-toggle");
  const friendDescription = page.locator(".friend-card .card-copy p");
  const matchmakingDescription = page.locator(".match-card-lobby .card-copy p");
  const matchmakingAction = page.locator(".match-card-lobby .card-panel .btn");

  if (layoutKind === "desktop") {
    // D2: two columns, the AI card on the left spanning both rows.
    expect(layout.cardLefts[1]).toBeGreaterThan(layout.cardLefts[0]);
    expect(Math.abs(layout.cardLefts[1] - layout.cardLefts[2])).toBeLessThan(1);
    expect(
      Math.abs(layout.cardTops[0] - layout.cardTops[1]),
    ).toBeLessThanOrEqual(1);
  }

  if (layoutKind === "desktop") {
    await expect(page.locator(".card-toggle:visible")).toHaveCount(0);
    await expect(friendDescription).toBeVisible();
    await expect(matchmakingDescription).toBeVisible();
    await expect(roomCode).toBeVisible();
    if (locale === "zh-TW") {
      await roomCode.focus();
      await expect(roomCode).toBeInViewport();
    }
  } else {
    await expect(page.locator(".card-toggle:visible")).toHaveCount(2);
    await expect(friendToggle).toHaveAttribute("aria-expanded", "false");
    await expect(matchmakingToggle).toHaveAttribute("aria-expanded", "false");
    await expect(friendDescription).toBeHidden();
    await expect(matchmakingDescription).toBeHidden();
    await expect(roomCode).toBeHidden();
    await expect(matchmakingAction).toBeHidden();
  }
  await expectTouchSafe(page, ".lobby button:visible, .lobby input:visible");

  if (layoutKind === "phone") {
    expect(layout.gridLeft, JSON.stringify(layout)).toBeGreaterThanOrEqual(20);
    expect(
      Math.abs(layout.gridLeft - (layout.viewportWidth - layout.gridRight)),
      JSON.stringify(layout),
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs(layout.cardHeights[1] - layout.cardHeights[2]),
      JSON.stringify(layout),
    ).toBeLessThanOrEqual(1);
    expect(layout.cardHeights[0]).toBeGreaterThan(layout.cardHeights[1]);
    for (const gap of [
      layout.cardTops[1] - layout.cardBottoms[0],
      layout.cardTops[2] - layout.cardBottoms[1],
    ]) {
      expect(gap, JSON.stringify(layout)).toBeCloseTo(16, 0);
    }
  }

  await expect(page.locator('link[rel~="icon"]')).toHaveCount(3);
  expect(
    await page
      .locator('link[rel~="icon"]')
      .evaluateAll((links) => links.map((link) => link.getAttribute("href"))),
  ).toEqual([
    `/connect4-mark.svg?${ASSET_VERSION}`,
    `/connect4-mark-32.png?${ASSET_VERSION}`,
    `/favicon.ico?${ASSET_VERSION}`,
  ]);
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute(
    "href",
    `/apple-touch-icon.png?${ASSET_VERSION}`,
  );
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
    "href",
    `/site.webmanifest?${ASSET_VERSION}`,
  );
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute(
    "content",
    "#fff4dc",
  );
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    "https://connect4.oraclelee.com/",
  );
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
    "content",
    `https://connect4.oraclelee.com/connect4-preview.png?${ASSET_VERSION}`,
  );
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
    "content",
    "summary_large_image",
  );

  if (layoutKind !== "desktop") {
    await friendToggle.click();
    await expect(friendToggle).toHaveAttribute("aria-expanded", "true");
    await expect(matchmakingToggle).toHaveAttribute("aria-expanded", "false");
    await expect(friendDescription).toBeVisible();
    await expect(roomCode).toBeVisible();
    await roomCode.fill("lan427");
    await expect(roomCode).toHaveValue("LAN427");
    await expectTouchSafe(page, ".lobby button:visible, .lobby input:visible");

    await matchmakingToggle.click();
    await expect(friendToggle).toHaveAttribute("aria-expanded", "false");
    await expect(matchmakingToggle).toHaveAttribute("aria-expanded", "true");
    await expect(roomCode).toBeHidden();
    await expect(matchmakingDescription).toBeVisible();
    await expect(matchmakingAction).toBeVisible();

    await matchmakingToggle.click();
    await friendToggle.click();
    await expect(roomCode).toHaveValue("LAN427");
    await friendToggle.click();
    await expect(friendToggle).toHaveAttribute("aria-expanded", "false");
  }

  await expect(page).toHaveScreenshot(
    `${testInfo.project.name}-lobby-${locale}.png`,
    { fullPage: true },
  );
}

test("game board is touch-safe and visually stable", async ({
  page,
}, testInfo) => {
  const layoutKind = kind(testInfo);
  await mockApp(page, snapshotFor("P03"));
  await page.goto("/play");
  await expect(page.locator(".board")).toBeVisible();
  await expect(
    page.locator(".board-head.in-unit, .board-head.in-side"),
  ).toHaveCount(2);

  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);

  const layout = await page.evaluate(() => {
    const board = document.querySelector<HTMLElement>(".board")!;
    const cell = document.querySelector<HTMLElement>(".board .cell")!;
    const leave = document.querySelector<HTMLElement>(".actions .btn")!;
    const visibleHead = [
      ...document.querySelectorAll<HTMLElement>(".board-head"),
    ].find((head) => head.offsetParent !== null)!;
    const brandText = document.querySelector<HTMLElement>(".brand-text")!;
    return {
      // Rotated stickers leave sub-pixel noise in the layout.
      boardWidth: Math.round(board.getBoundingClientRect().width),
      slot: Math.round(cell.getBoundingClientRect().width),
      slotHeight: Math.round(cell.getBoundingClientRect().height),
      leaveHeight: Math.round(leave.getBoundingClientRect().height),
      headPlace: visibleHead.classList.contains("in-side") ? "side" : "unit",
      brandTextShown: brandText.offsetParent !== null,
      brandFontSize: Number.parseFloat(
        getComputedStyle(document.querySelector(".brand")!).fontSize,
      ),
      viewportHeight: window.innerHeight,
    };
  });

  // D7: round slots; §3 slot sizes per layout.
  expect(layout.slot).toBe(layout.slotHeight);
  if (layoutKind === "desktop") {
    const short = layout.viewportHeight <= 820;
    expect(layout.slot).toBe(short ? 68 : 84);
    if (!short) expect(layout.boardWidth).toBe(694);
    expect(layout.leaveHeight).toBe(56);
    expect(layout.brandFontSize).toBe(22);
    expect(layout.headPlace).toBe("unit");
  } else if (layoutKind === "landscape") {
    expect(layout.slot).toBe(56);
    expect(layout.headPlace).toBe("side");
    expect(layout.brandTextShown).toBe(false);
  } else {
    expect(layout.slot).toBe(48);
    expect(layout.leaveHeight).toBe(48);
    expect(layout.brandFontSize).toBe(20);
    expect(layout.headPlace).toBe("unit");
  }

  await expectTouchSafe(page, "button:visible");
  await expect(page).toHaveScreenshot(`${testInfo.project.name}-game.png`, {
    fullPage: true,
  });
});

test("Traditional Chinese lobby is aligned and touch-safe", async ({
  page,
}, testInfo) => {
  await mockApp(page, snapshotFor("L01"));
  await page.goto("/");
  await expectAlignedLobby(
    page,
    ["挑戰 AI", "和朋友一起玩", "隨機配對"],
    testInfo,
    "zh-TW",
  );
});

test("English lobby is localized, aligned, and touch-safe", async ({
  page,
}, testInfo) => {
  await mockApp(page, snapshotFor("L02", "en"));
  await page.goto("/");
  const input = page.getByLabel("Room Code");
  await expect(input).toHaveCount(1);
  await expect(input).toHaveAttribute("placeholder", "Room Code");
  await expectAlignedLobby(
    page,
    ["Challenge AI", "Play with friends", "Quick match"],
    testInfo,
    "en",
  );
});

test("portrait lobby accordion stays focused and breathable", async ({
  page,
}, testInfo) => {
  test.skip(kind(testInfo) !== "phone", "The accordion is phone-only.");

  await mockApp(page, snapshotFor("L05"));
  await page.goto("/");
  await page.locator(".friend-card .card-toggle").click();

  const roomCode = page.getByLabel("房間代碼");
  await expect(roomCode).toBeVisible();
  await expect(roomCode).toBeInViewport();
  await expect(page.getByRole("button", { name: "加入房間" })).toBeInViewport();
  // L05: the AI card folds its demo board while another card is open.
  await expect(page.locator(".ai-card .mini-board")).toBeHidden();

  const layout = await page.locator(".lobby-grid").evaluate((grid) => {
    const box = grid.getBoundingClientRect();
    return { left: box.left, right: box.right, viewportWidth: innerWidth };
  });
  expect(layout.left).toBeGreaterThanOrEqual(20);
  expect(layout.viewportWidth - layout.right).toBeGreaterThanOrEqual(20);
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);

  if (
    testInfo.project.name === "iphone-14promax-15plus-15promax-16plus" ||
    testInfo.project.name === "galaxy-s26-ultra"
  ) {
    await expect(page).toHaveScreenshot(
      `${testInfo.project.name}-lobby-friends-expanded.png`,
      { fullPage: true },
    );
  }
});

test("short portrait viewport keeps expanded cards safely scrollable", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "iphone-16e-17e",
    "One compact WebKit viewport is sufficient for overflow fallback coverage.",
  );

  await page.setViewportSize({ width: 390, height: 420 });
  await mockApp(page, snapshotFor("L05"));
  await page.goto("/");
  await page.locator(".friend-card .card-toggle").click();

  const joinButton = page.getByRole("button", { name: "加入房間" });
  await joinButton.scrollIntoViewIfNeeded();
  await expect(joinButton).toBeInViewport();
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(page.locator(".topbar")).toBeInViewport();
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
});

test("profile fields match and explain a rejected nickname", async ({
  page,
}, testInfo) => {
  await mockApp(page, snapshotFor("L10"));
  await page.route("**/api/session", async (route) => {
    if (route.request().method() === "PATCH") {
      await route.fulfill({
        status: 422,
        contentType: "application/json",
        body: JSON.stringify({ detail: "invalid_nickname" }),
      });
      return;
    }
    await route.fallback();
  });
  await page.goto("/");
  await page.locator(".profile").click();

  const nickname = page.locator(".profile-sheet input");
  const language = page.locator(".profile-sheet select");
  await expect(nickname).toBeVisible();
  await expect(language).toBeVisible();

  const controls = await page.locator(".profile-sheet").evaluate((sheet) => {
    const input = sheet.querySelector("input")!;
    const select = sheet.querySelector("select")!;
    const chevron = sheet.querySelector(".select-field .icon")!;
    return {
      input: {
        width: input.getBoundingClientRect().width,
        height: input.getBoundingClientRect().height,
        fontSize: Number.parseFloat(getComputedStyle(input).fontSize),
      },
      select: {
        width: select.getBoundingClientRect().width,
        height: select.getBoundingClientRect().height,
        fontSize: Number.parseFloat(getComputedStyle(select).fontSize),
        appearance: getComputedStyle(select).appearance,
      },
      chevronPointerEvents: getComputedStyle(chevron).pointerEvents,
    };
  });

  expect(controls.input.height).toBe(48);
  expect(controls.select.height).toBe(48);
  expect(
    Math.abs(controls.input.width - controls.select.width),
  ).toBeLessThanOrEqual(1);
  expect(controls.input.fontSize).toBeGreaterThanOrEqual(16);
  expect(controls.select.fontSize).toBeGreaterThanOrEqual(16);
  expect(controls.select.appearance).toBe("none");
  expect(controls.chevronPointerEvents).toBe("none");
  await expectTouchSafe(page, ".profile-sheet button");

  await language.selectOption("en");
  await expect(language).toHaveValue("en");
  await language.selectOption("zh-TW");

  if (
    testInfo.project.name === "iphone-14promax-15plus-15promax-16plus" ||
    testInfo.project.name === "galaxy-s26-ultra"
  ) {
    await expect(page).toHaveScreenshot(`${testInfo.project.name}-profile.png`);
  }

  // L10: an empty nickname is caught while typing and Save is disabled.
  const save = page.locator(".profile-sheet .btn.primary");
  await expect(page.locator(".form-error")).toHaveCount(0);
  await nickname.fill("   ");
  await expect(page.locator("#nickname-error")).toHaveText("請先輸入暱稱");
  await expect(nickname).toHaveClass(/has-error/);
  await expect(nickname).toHaveAttribute("aria-invalid", "true");
  await expect(nickname).toHaveAttribute("aria-describedby", "nickname-error");
  await expect(save).toBeDisabled();
  expect(
    await nickname.evaluate(
      (element) => getComputedStyle(element).outlineStyle,
    ),
  ).toBe("none");
  await nickname.press("Enter");
  await expect(page.locator(".profile-sheet")).toBeVisible();

  await nickname.fill("Ann");
  await expect(page.locator("#nickname-error")).toHaveCount(0);
  await expect(save).toBeEnabled();

  // The server's own rule still explains itself (422 invalid_nickname).
  await save.click();
  await expect(page.locator("#nickname-error")).toHaveText(
    "暱稱需為 1–18 個字。",
  );
  await expect(nickname).toHaveClass(/has-error/);
});

test("brand icons and install metadata contain the green-pink mark", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop-1366x768",
    "One desktop Chromium project is sufficient for asset decoding.",
  );

  await mockApp(page, snapshotFor("L01"));
  await page.goto("/");

  const inspection = await page.evaluate(async () => {
    const dimensions: Record<string, [number, number] | null> = {
      "/connect4-mark.svg": [64, 64],
      "/connect4-mark-32.png": [32, 32],
      "/favicon.ico": null,
      "/apple-touch-icon.png": [180, 180],
      "/connect4-icon-192.png": [192, 192],
      "/connect4-icon-512.png": [512, 512],
      "/connect4-preview.png": [1200, 630],
    };

    const assets = await Promise.all(
      Object.entries(dimensions).map(async ([url, expectedDimensions]) => {
        const response = await fetch(`${url}?qa=1`, { cache: "reload" });
        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        try {
          const image = new Image();
          image.src = objectUrl;
          await image.decode();
          const canvas = document.createElement("canvas");
          canvas.width = image.naturalWidth;
          canvas.height = image.naturalHeight;
          const context = canvas.getContext("2d")!;
          context.drawImage(image, 0, 0);
          const pixels = context.getImageData(
            0,
            0,
            canvas.width,
            canvas.height,
          ).data;
          let greenPixels = 0;
          let pinkPixels = 0;
          for (let index = 0; index < pixels.length; index += 4) {
            const red = pixels[index];
            const green = pixels[index + 1];
            const blue = pixels[index + 2];
            const alpha = pixels[index + 3];
            if (alpha > 128 && green > red + 30 && green > blue + 20) {
              greenPixels += 1;
            }
            if (alpha > 128 && red > green + 30 && red > blue + 25) {
              pinkPixels += 1;
            }
          }
          return {
            url,
            expectedDimensions,
            ok: response.ok,
            contentType: response.headers.get("content-type"),
            size: blob.size,
            width: image.naturalWidth,
            height: image.naturalHeight,
            greenPixels,
            pinkPixels,
          };
        } finally {
          URL.revokeObjectURL(objectUrl);
        }
      }),
    );

    const manifestResponse = await fetch("/site.webmanifest?qa=1", {
      cache: "reload",
    });
    return {
      assets,
      manifestOk: manifestResponse.ok,
      manifestContentType: manifestResponse.headers.get("content-type"),
      manifest: await manifestResponse.json(),
    };
  });

  for (const asset of inspection.assets) {
    expect(asset.ok, JSON.stringify(asset)).toBe(true);
    expect(asset.contentType, JSON.stringify(asset)).toMatch(/^image\//);
    expect(asset.size, JSON.stringify(asset)).toBeGreaterThan(100);
    if (asset.expectedDimensions) {
      expect([asset.width, asset.height], JSON.stringify(asset)).toEqual(
        asset.expectedDimensions,
      );
    } else {
      expect(asset.width, JSON.stringify(asset)).toBe(asset.height);
      expect(asset.width, JSON.stringify(asset)).toBeGreaterThanOrEqual(16);
    }
    expect(asset.greenPixels, JSON.stringify(asset)).toBeGreaterThan(0);
    expect(asset.pinkPixels, JSON.stringify(asset)).toBeGreaterThan(0);
  }

  expect(inspection.manifestOk).toBe(true);
  expect(inspection.manifestContentType).toMatch(
    /^application\/(manifest\+json|json)/,
  );
  expect(inspection.manifest).toMatchObject({
    id: "/",
    name: "Connect 4 四子棋",
    short_name: "Connect 4",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#fff4dc",
    theme_color: "#fff4dc",
    icons: [
      {
        src: "/connect4-icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/connect4-icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any maskable",
      },
    ],
  });
});

test("desktop private-game sidebar follows the match card spec", async ({
  page,
}, testInfo) => {
  test.skip(kind(testInfo) !== "desktop", "The sidebar is desktop-only.");

  await mockApp(page, snapshotFor("P07"));
  await page.goto("/play");
  await expect(page.getByRole("button", { name: "再來一局" })).toBeVisible();

  const layout = await page.locator(".side").evaluate((side) => {
    const players = [...side.querySelectorAll<HTMLElement>(".player")];
    const buttons = [
      ...side.querySelectorAll<HTMLElement>(".result-actions .btn"),
    ];
    return {
      playerHeights: players.map((row) => row.getBoundingClientRect().height),
      tokenWidth: side.querySelector(".player-token")!.getBoundingClientRect()
        .width,
      playerNameSize: Number.parseFloat(
        getComputedStyle(side.querySelector(".player-copy strong")!).fontSize,
      ),
      versusSize: Number.parseFloat(
        getComputedStyle(side.querySelector(".versus")!).fontSize,
      ),
      modeLabel: side.querySelector(".mode-label")!.textContent,
      compactCode: side.querySelectorAll(".compact-code").length,
      buttonHeights: buttons.map((button) =>
        Math.round(button.getBoundingClientRect().height),
      ),
      buttonSizes: buttons.map((button) =>
        Number.parseFloat(getComputedStyle(button).fontSize),
      ),
    };
  });

  // D4: one row per player, at least 76px; token 44, name 18, "對" 14.
  for (const height of layout.playerHeights) {
    expect(height).toBeGreaterThanOrEqual(75.5);
  }
  expect(layout.tokenWidth).toBe(44);
  expect(layout.playerNameSize).toBe(18);
  expect(layout.versusSize).toBe(14);
  // D3: the code lives on the mode label; no copyable block during a game.
  expect(layout.modeLabel).toContain("LAN427");
  expect(layout.compactCode).toBe(0);
  expect(layout.buttonHeights).toEqual([56, 56]);
  expect(layout.buttonSizes).toEqual([17, 17]);
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);

  await expect(page).toHaveScreenshot(
    `${testInfo.project.name}-private-finished.png`,
    { fullPage: true },
  );
});

test("waiting room has one invite button that stays copied", async ({
  page,
}) => {
  await forceLanCopyFallback(page);
  await mockApp(page, snapshotFor("P02"));
  await page.goto("/play");

  await expect(page.locator(".room-code-block strong")).toHaveText("LAN427");
  await expect(page.locator(".qr-card path")).toHaveAttribute("d", /^M/);
  // Round 3: a single primary button plus the leave link; no copy-code button.
  await expect(page.locator(".waiting-actions .btn.primary")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "複製房號" })).toHaveCount(0);
  await expectTouchSafe(page, ".waiting-actions button");

  // Without navigator.share even phones copy the link.
  const invite = page.locator(".waiting-actions .btn.primary");
  await expect(invite).toHaveText("複製邀請連結");
  await invite.click();
  await expect(invite).toHaveText("已複製邀請連結");
  await page.waitForTimeout(1600);
  await expect(invite).toHaveText("已複製邀請連結");
  const copied = await page.evaluate(
    () => (window as typeof window & { __copied?: string[] }).__copied,
  );
  expect(copied).toHaveLength(1);
  expect(copied?.[0]).toMatch(/\/\?room=LAN427$/);
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
});

test("phones share the invite through the system sheet", async ({
  page,
}, testInfo) => {
  test.skip(kind(testInfo) !== "phone", "Sharing replaces copy on phones.");
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async (data: ShareData) => {
        (window as typeof window & { __shared?: ShareData }).__shared = data;
      },
    });
  });
  await mockApp(page, snapshotFor("P02"));
  await page.goto("/play");
  await page.getByRole("button", { name: "分享邀請" }).click();
  const shared = await page.evaluate(
    () => (window as typeof window & { __shared?: ShareData }).__shared,
  );
  expect(shared?.url).toMatch(/\/\?room=LAN427$/);
  expect(shared?.text).toContain("LAN427");
});

test("an invite link asks for a nickname and joins only on a tap", async ({
  page,
}) => {
  // Saves and joins land in one list, so their order can be checked.
  const events: string[] = [];
  await mockApp(page, snapshotFor("L12"), {
    onMessage: (message) => {
      if (message.type === "room.join") {
        events.push(`join ${JSON.stringify(message.payload)}`);
      }
    },
  });
  await page.route("**/api/session", async (route) => {
    if (route.request().method() !== "PATCH") return route.fallback();
    const body = route.request().postDataJSON();
    events.push(`save ${body.nickname}`);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
  await page.goto("/?room=lan427");

  // L12 v2: prefilled with this device's nickname and focused.
  const card = page.locator(".invite-card");
  const nickname = card.getByRole("textbox", { name: "你的暱稱" });
  const join = card.getByRole("button", { name: "加入房間" });
  await expect(card.locator("h1")).toHaveText("朋友邀請你一起玩");
  await expect(card.locator(".lead")).toHaveText(
    "填好你的暱稱，按「加入房間」就開始對戰。",
  );
  await expect(card.locator(".room-code-block strong")).toHaveText("LAN427");
  await expect(nickname).toHaveValue("曜宇");
  await expect(nickname).toBeFocused();
  await expect(card.locator(".invite-name-msg")).toHaveText(
    "你的朋友會看到這個名字呦",
  );
  await expect(page.locator(".lobby")).toHaveCount(0);
  await expectTouchSafe(page, ".invite-card button");
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
  await page.waitForTimeout(300);
  expect(events).toEqual([]);

  // Empty: the L10 error, and joining is off, by button or Enter.
  await nickname.fill("  ");
  await expect(card.locator(".invite-name-msg")).toHaveText("請先輸入暱稱");
  await expect(nickname).toHaveClass(/has-error/);
  await expect(nickname).toHaveAttribute("aria-invalid", "true");
  await expect(join).toBeDisabled();
  await nickname.press("Enter");

  await nickname.fill("Ann");
  await expect(card.locator(".invite-name-msg")).toHaveText(
    "你的朋友會看到這個名字呦",
  );
  await expect(join).toBeEnabled();
  await join.click();
  // The new nickname is saved before the room is joined.
  await expect
    .poll(() => events)
    .toEqual(["save Ann", 'join {"code":"LAN427"}']);

  await card.getByRole("button", { name: "不加入，先去大廳" }).click();
  await expect(page.locator(".lobby")).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
});

test("a rejected nickname keeps the guest on the invite page", async ({
  page,
}) => {
  const joins: unknown[] = [];
  await mockApp(page, snapshotFor("L12"), {
    onMessage: (message) => {
      if (message.type === "room.join") joins.push(message.payload);
    },
  });
  await page.route("**/api/session", async (route) => {
    if (route.request().method() !== "PATCH") return route.fallback();
    await route.fulfill({
      status: 422,
      contentType: "application/json",
      body: JSON.stringify({ detail: "invalid_nickname" }),
    });
  });
  await page.goto("/?room=LAN427");

  const card = page.locator(".invite-card");
  const nickname = card.getByRole("textbox", { name: "你的暱稱" });
  await nickname.fill("Ann");
  await nickname.press("Enter");
  await expect(card.locator(".invite-name-msg")).toHaveText(
    "暱稱需為 1–18 個字。",
  );
  await expect(nickname).toHaveClass(/has-error/);
  await page.waitForTimeout(300);
  expect(joins).toEqual([]);

  // Typing again clears the server's message.
  await nickname.fill("Anne");
  await expect(card.locator(".invite-name-msg")).toHaveText(
    "你的朋友會看到這個名字呦",
  );
});

test("a room that cannot be joined is explained on the invite page", async ({
  page,
}) => {
  const app = await mockApp(page, snapshotFor("L13"), {
    onMessage: (message) => {
      if (message.type === "room.join") {
        app.sockets
          .at(-1)!
          .send(
            JSON.stringify({ type: "error", payload: { code: "room_full" } }),
          );
      }
    },
  });
  // An unchanged nickname joins without saving it again.
  const saves: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "PATCH") saves.push(request.url());
  });
  await page.goto("/?room=LAN427");
  // Count every toast that appears, even one that fades out again.
  await page.evaluate(() => {
    new MutationObserver(() => {
      if (document.querySelector(".toast")) {
        (window as typeof window & { __toasts?: number }).__toasts = 1;
      }
    }).observe(document.body, { childList: true, subtree: true });
  });
  await page.getByRole("button", { name: "加入房間" }).click();

  const card = page.locator(".invite-card.is-gone");
  await expect(card.locator("h1")).toHaveText("這個房間無法加入");
  await expect(card.locator(".lead")).toHaveText(
    "房間 LAN427 已經滿了，請朋友重新開一個房間。",
  );
  // The reason is shown on the page, not repeated as a toast.
  await expect(page.locator(".toast")).toHaveCount(0);
  expect(
    await page.evaluate(
      () => (window as typeof window & { __toasts?: number }).__toasts,
    ),
  ).toBeUndefined();
  expect(saves).toEqual([]);
  await card.getByRole("button", { name: "回到大廳" }).click();
  await expect(page.locator(".lobby")).toBeVisible();
});

test("joining with an empty code explains itself and sends nothing", async ({
  page,
}, testInfo) => {
  const sent: string[] = [];
  await mockApp(page, snapshotFor("L14"), {
    onMessage: (message) => sent.push(JSON.stringify(message)),
  });
  await page.goto("/");
  if (kind(testInfo) !== "desktop") {
    await page.locator(".friend-card .card-toggle").click();
  }
  const input = page.locator("#room-code");
  await input.fill("  ");
  await page.getByRole("button", { name: "加入房間" }).click();

  // L14: pink field, the reason below it, focus kept in the field.
  await expect(page.locator("#join-error")).toHaveText("請先輸入房號");
  await expect(input).toHaveClass(/has-error/);
  await expect(input).toHaveAttribute("aria-invalid", "true");
  await expect(input).toBeFocused();
  // The error state shows only the pink ring, no focus outline.
  expect(
    await input.evaluate((element) => getComputedStyle(element).outlineStyle),
  ).toBe("none");
  await page.waitForTimeout(300);
  expect(sent.filter((message) => message.includes("room.join"))).toEqual([]);

  await input.press("A");
  await expect(page.locator("#join-error")).toHaveCount(0);
  await expect(input).not.toHaveClass(/has-error/);
  // Typing normally, the field shows a black focus frame.
  await expect(input).toBeFocused();
  expect(
    await input.evaluate((element) => {
      const style = getComputedStyle(element);
      return `${style.outlineStyle} ${style.outlineColor}`;
    }),
  ).toBe("solid rgb(27, 27, 31)");
});

test("a replaced tab stops reconnecting until you continue here", async ({
  page,
}) => {
  const app = await mockApp(page, snapshotFor("P15"));
  await page.goto("/play");
  await expect(page.locator(".board")).toBeVisible();

  await app.sockets[0].close({ code: 4001 });
  await expect(
    page.getByRole("heading", { name: "已在其他分頁開啟" }),
  ).toBeVisible();
  await expect(page.locator(".connection-pill")).toHaveCount(0);
  await page.waitForTimeout(1500);
  expect(app.sockets).toHaveLength(1);

  await page.getByRole("button", { name: "在這裡繼續" }).click();
  await expect(page.locator(".board")).toBeVisible();
  expect(app.sockets).toHaveLength(2);
});

test("losing the connection pauses the board with an explanation", async ({
  page,
}) => {
  const app = await mockApp(page, snapshotFor("P14"), {
    refuseReconnects: true,
  });
  await page.goto("/play");
  await expect(page.locator(".board")).toBeVisible();
  await app.sockets[0].close({ code: 1011 });

  await expect(page.locator(".overlay-card")).toContainText(
    "連線中斷，正在重新連線…",
  );
  await expect(page.locator(".connection-pill")).toBeVisible();
  await expect(page.locator(".board")).toHaveClass(/is-disabled/);
});

test("the paused countdown follows the server deadline", async ({ page }) => {
  await page.clock.install({ time: SERVER_TIME * 1000 });
  await page.clock.pauseAt(SERVER_TIME * 1000 + 30_000);
  await mockApp(page, snapshotFor("P06"));
  await page.goto("/play");

  const chip = page.locator(".board-head:visible .move-chip.countdown");
  await expect(chip).toHaveText("0:18");
  await expect(page.locator(".board-head:visible")).toContainText(
    "小安 離線了",
  );
  await expect(page.locator(".token-ring")).toHaveCount(1);
  await page.clock.runFor(9_000);
  await expect(chip).toHaveText("0:09");
  await expect(chip).toHaveClass(/is-urgent/);
});

test("AI thinking is only announced after 300ms", async ({ page }) => {
  await page.clock.install({ time: SERVER_TIME * 1000 });
  await page.clock.pauseAt(SERVER_TIME * 1000 + 30_000);
  await mockApp(page, snapshotFor("P05"));
  await page.goto("/play");
  await expect(page.locator(".board")).toBeVisible();
  await expect(page.locator(".board-head:visible")).not.toContainText(
    "AI 正在思考",
  );
  await page.clock.runFor(400);
  await expect(page.locator(".board-head:visible")).toContainText(
    "AI 正在思考",
  );
});

/** Drops need motion and a clock the test controls (A01). */
async function playDrops(page: Page) {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.clock.install({ time: SERVER_TIME * 1000 });
  await page.clock.pauseAt(SERVER_TIME * 1000 + 30_000);
}

function cell(page: Page, row: number, column: number) {
  return page.locator(".grid .cell").nth(row * 7 + column);
}

/** P03 after your move in column 5 and, optionally, the AI's in column 2. */
function afterMoves(start: Snapshot, reply: boolean): Snapshot {
  const game = start.game!;
  const board = game.board.map((row) => [...row]);
  board[3][4] = "green";
  if (reply) board[5][1] = "pink";
  return {
    ...start,
    game: {
      ...game,
      revision: game.revision + (reply ? 2 : 1),
      status: reply ? "playing" : "thinking",
      turn: reply ? "green" : "pink",
      board,
      history: `${game.history}${reply ? "52" : "5"}`,
    },
  };
}

test("a live move drops in and is announced; the first snapshot is static", async ({
  page,
}) => {
  await playDrops(page);
  const start = snapshotFor("P03");
  const app = await mockApp(page, start);
  await page.goto("/play");
  await expect(page.locator(".board")).toBeVisible();
  await expect(page.locator(".token.is-dropping")).toHaveCount(0);
  await expect(page.locator(".cell.is-last")).toHaveCount(1);

  app.send(afterMoves(start, false));
  await expect(cell(page, 3, 4).locator(".token")).toHaveClass(/is-dropping/);
  await expect(page.locator(".game > .sr-only")).toHaveText("你在第 5 欄落子");
  // The last-move frame waits until the token has landed.
  await expect(page.locator(".cell.is-last")).toHaveCount(0);
  await page.clock.runFor(dropDuration(3) + 50);
  await expect(page.locator(".token.is-dropping")).toHaveCount(0);
  await expect(cell(page, 3, 4)).toHaveClass(/is-last/);
});

test("moves that arrive together drop one after another", async ({ page }) => {
  await playDrops(page);
  const start = snapshotFor("P03");
  const app = await mockApp(page, start);
  await page.goto("/play");
  await expect(page.locator(".board")).toBeVisible();

  // An instant AI reply 5ms after your move waits for your token to land.
  const yours = cell(page, 3, 4).locator(".token");
  const reply = cell(page, 5, 1).locator(".token");
  app.send(afterMoves(start, false));
  await expect(yours).toHaveClass(/is-dropping/);
  await page.clock.runFor(5);
  app.send(afterMoves(start, true));
  await expect(reply).toHaveClass(/is-queued/);
  await expect(reply).toBeHidden();
  await expect(yours).toHaveClass(/is-dropping/);

  await page.clock.runFor(dropDuration(3) - 5 + 50);
  await expect(reply).toHaveClass(/is-dropping/);
  await expect(yours).not.toHaveClass(/is-dropping/);
  await page.clock.runFor(dropDuration(5));
  await expect(
    page.locator(".token.is-dropping, .token.is-queued"),
  ).toHaveCount(0);
  await expect(cell(page, 5, 1)).toHaveClass(/is-last/);
});

test("the winning move lands before the celebration starts", async ({
  page,
}) => {
  await playDrops(page);
  const finished = snapshotFor("P07");
  const game = finished.game!;
  const board = game.board.map((row) => [...row]);
  board[2][4] = null;
  const app = await mockApp(page, {
    ...finished,
    game: {
      ...game,
      revision: game.revision - 1,
      status: "playing",
      turn: "green",
      board,
      history: game.history.slice(0, -1),
      winner: null,
      result_reason: null,
      winning_cells: [],
      series: { you: 0, opponent: 0, draws: 0 },
    },
  });
  await page.goto("/play");
  await expect(page.locator(".board")).toBeVisible();

  app.send(finished);
  const card = page.locator(".result-card");
  await expect(cell(page, 2, 4).locator(".token")).toHaveClass(/is-dropping/);
  await expect(page.locator(".board")).not.toHaveClass(/is-celebrating/);
  await expect(card).toHaveClass(/is-held/);
  await expect(card).toBeHidden();

  await page.clock.runFor(dropDuration(2) + 50);
  await expect(page.locator(".board")).toHaveClass(/is-celebrating/);
  await expect(card).toHaveClass(/is-entering/);
  await expect(card).toBeVisible();
});

test("your turn follows your own colour when you play pink", async ({
  page,
}, testInfo) => {
  const base = snapshotFor("P04");
  await mockApp(page, { ...base, game: { ...base.game!, turn: "pink" } });
  await page.goto("/play");
  const head = page.locator(".board-head:visible");
  await expect(head).toContainText("輪到你了");

  const colours = await page.evaluate(() => {
    const probe = document.createElement("i");
    document.body.append(probe);
    const resolve = (value: string) => {
      probe.style.backgroundColor = value;
      return getComputedStyle(probe).backgroundColor;
    };
    const result = {
      pink: resolve("var(--pink)"),
      pinkSoft: resolve("var(--pink-soft)"),
    };
    probe.remove();
    return result;
  });
  await expect(head.locator(".turn-status")).toHaveCSS(
    "background-color",
    colours.pink,
  );
  await expect(head.locator(".status-token")).toHaveClass(/pink/);

  if (kind(testInfo) !== "desktop") return;
  // The match card and the hand only show on the desktop sidebar and mouse.
  await expect(page.locator(".player.is-me.is-current")).toHaveCSS(
    "background-color",
    colours.pinkSoft,
  );
  await expect(page.locator(".turn-tag")).toHaveCSS(
    "background-color",
    colours.pink,
  );
  await page.locator(".col-target").nth(1).hover();
  await expect(page.locator(".hand .token")).toHaveClass(/pink/);
});

test("the keyboard plays through one tab stop on the board", async ({
  page,
}, testInfo) => {
  test.skip(
    kind(testInfo) !== "desktop",
    "Keyboard play is checked on desktop.",
  );
  const sent: string[] = [];
  await mockApp(page, snapshotFor("P03"), {
    onMessage: (message) => sent.push(JSON.stringify(message)),
  });
  await page.goto("/play");
  await expect(page.locator(".board")).toBeVisible();

  await page.locator(".col-target").nth(3).focus();
  await expect(page.locator(".hand")).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator(".col-target").nth(4)).toBeFocused();
  // The focused column shows a plain black frame, no coloured halo.
  expect(
    await page
      .locator(".col-target")
      .nth(4)
      .evaluate((element) => {
        const style = getComputedStyle(element);
        return [style.outlineStyle, style.outlineColor, style.boxShadow];
      }),
  ).toEqual(["solid", "rgb(27, 27, 31)", "none"]);
  await expect(page.locator(".col-target[tabindex='0']")).toHaveCount(1);
  await page.keyboard.press("Enter");
  await expect
    .poll(() => sent.filter((message) => message.includes("game.move")))
    .toEqual([JSON.stringify({ type: "game.move", payload: { column: 4 } })]);
});

test("finished games show the approved outcome for each case", async ({
  page,
}, testInfo) => {
  test.skip(kind(testInfo) !== "desktop", "Copy is the same on every size.");
  const cases: Array<[PageId, string, string[]]> = [
    ["P08", "Super AI 拿下這局", ["再次挑戰", "離開"]],
    ["P09", "平手！", ["再來一局", "離開"]],
    ["P10", "你獲勝！小安 離線逾時", ["再來一局", "離開"]],
    ["P11", "小安 離開了房間", ["回到大廳"]],
    ["P12", "AI 求解器暫時無法使用", ["重新開始", "離開"]],
    ["P13", "你贏了！", ["等待對手回應…", "離開"]],
    ["P16", "離線逾時，這局判負", ["再來一局", "離開"]],
    ["P17", "小安 拿下這局", ["好，再來一局", "離開"]],
    ["P18", "你贏了！", ["回到大廳"]],
  ];
  for (const [id, title, buttons] of cases) {
    const tab = await page.context().newPage();
    await mockApp(tab, snapshotFor(id));
    await tab.goto("/play");
    const card = tab.locator(".result-card");
    await expect(card.locator("h2"), id).toHaveText(title);
    await expect(card.locator(".result-actions .btn"), id).toHaveText(buttons);
    if (id === "P18") {
      await expect(card.locator(".rematch-row")).toHaveText(
        "小安 已離開房間，無法再來一局。",
      );
    }
    if (id === "P17") {
      await expect(card.locator(".rematch-row")).toContainText(
        "這局換 小安 先下",
      );
    }
    await tab.close();
  }
});
