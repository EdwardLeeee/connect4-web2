import { expect, test, type Page } from "@playwright/test";
import type { Snapshot } from "../src/types";

const SERVER_TIME = 1_790_000_000;

const gameSnapshot: Snapshot = {
  server_time: SERVER_TIME,
  session: { nickname: "曜宇", locale: "zh-TW" },
  queue: { searching: false },
  room: { id: "room", code: null, mode: "ai" },
  game: {
    revision: 9,
    status: "playing",
    board: [
      [null, null, null, null, null, null, null],
      [null, null, null, null, null, null, null],
      [null, null, null, null, null, null, null],
      [null, null, null, null, null, null, null],
      [null, null, "green", "pink", "green", null, null],
      [null, null, "pink", "green", "pink", null, null],
    ],
    history: "433554",
    turn: "green",
    you: "green",
    winner: null,
    winning_cells: [],
    result_reason: null,
    players: {
      green: {
        nickname: "曜宇",
        connected: true,
        is_ai: false,
        grace_deadline: null,
      },
      pink: {
        nickname: "Perfect AI",
        connected: true,
        is_ai: true,
        grace_deadline: null,
      },
    },
    rematch: { green: false, pink: false },
    rematch_requested: false,
    rematch_available: false,
    series: { you: 0, opponent: 0, draws: 0 },
    grace_deadline: null,
  },
};

const emptyBoard = Array.from({ length: 6 }, () => Array<null>(7).fill(null));

function human(nickname: string) {
  return { nickname, connected: true, is_ai: false, grace_deadline: null };
}

function privateSnapshot(status: "waiting" | "playing" | "finished"): Snapshot {
  return {
    server_time: SERVER_TIME,
    session: { nickname: "曜宇", locale: "zh-TW" },
    queue: { searching: false },
    room: { id: "private-room", code: "LAN427", mode: "private" },
    game: {
      ...gameSnapshot.game!,
      revision: 2,
      status,
      board: status === "waiting" ? emptyBoard : gameSnapshot.game!.board,
      history: status === "waiting" ? "" : gameSnapshot.game!.history,
      rematch_available: status === "finished",
      winner: status === "finished" ? "green" : null,
      result_reason: status === "finished" ? "connect_four" : null,
      players:
        status === "waiting"
          ? { green: human("曜宇") }
          : { green: human("曜宇"), pink: human("小安") },
    },
  };
}

async function mockApp(page: Page, snapshot: Snapshot = gameSnapshot) {
  await page.route("**/api/session", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(snapshot.session),
    });
  });
  await page.routeWebSocket(/\/ws$/, async (socket) => {
    socket.send(JSON.stringify({ type: "state.snapshot", payload: snapshot }));
  });
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
    document.addEventListener(
      "copy",
      () => {
        const textarea =
          document.activeElement instanceof HTMLTextAreaElement
            ? document.activeElement
            : null;
        (
          window as typeof window & { __copiedRoomCode?: string }
        ).__copiedRoomCode = textarea?.value;
      },
      { capture: true },
    );
  });
}

function lobbySnapshot(locale: "zh-TW" | "en"): Snapshot {
  return {
    server_time: SERVER_TIME,
    session: { nickname: locale === "zh-TW" ? "曜宇" : "Taylor", locale },
    queue: { searching: false },
    room: null,
    game: null,
  };
}

async function expectAlignedLobby(
  page: Page,
  expectedHeadings: string[],
  testInfo: { project: { name: string } },
  locale: "zh-TW" | "en",
) {
  const desktopOrLandscape =
    testInfo.project.name.startsWith("desktop-") ||
    testInfo.project.name.endsWith("-landscape");
  const portraitPhone = !desktopOrLandscape;

  await expect(page.locator(".hero-copy")).toHaveCount(0);
  await expect(page.locator(".badge")).toHaveCount(0);
  await expect(page.locator(".brand")).toContainText("CONNECT 4");
  await expect(page.locator(".mode-card h2")).toHaveText(expectedHeadings);

  const layout = await page.locator(".mode-card").evaluateAll((cards) => {
    const cardRects = cards.map((card) => card.getBoundingClientRect());
    const titleOffsets = cards.map((card) => {
      const title = card.querySelector("h2")!;
      return (
        title.getBoundingClientRect().top - card.getBoundingClientRect().top
      );
    });
    const grid = document
      .querySelector<HTMLElement>(".lobby-grid")!
      .getBoundingClientRect();
    const main = document.querySelector("main")!.getBoundingClientRect();
    return {
      titleOffsets,
      brandFontSize: Number.parseFloat(
        getComputedStyle(document.querySelector<HTMLElement>(".brand")!)
          .fontSize,
      ),
      documentHeight: document.documentElement.scrollHeight,
      viewportHeight: window.innerHeight,
      cardTops: cardRects.map((card) => card.top),
      cardBottoms: cardRects.map((card) => card.bottom),
      cardHeights: cardRects.map((card) => card.height),
      gridTop: grid.top,
      gridBottom: grid.bottom,
      gridLeft: grid.left,
      gridRight: grid.right,
      mainTop: main.top,
      mainBottom: main.bottom,
      viewportWidth: window.innerWidth,
      overflow:
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
      cardOverflow: cards.map((card) => card.scrollWidth - card.clientWidth),
    };
  });

  expect(layout.overflow).toBeLessThanOrEqual(1);
  expect(layout.brandFontSize).toBe(desktopOrLandscape ? 22 : 20);
  const comparedTitleOffsets = portraitPhone
    ? layout.titleOffsets.slice(1)
    : layout.titleOffsets;
  expect(
    Math.max(...comparedTitleOffsets) - Math.min(...comparedTitleOffsets),
  ).toBeLessThanOrEqual(1);
  for (const overflow of layout.cardOverflow) {
    expect(overflow).toBeLessThanOrEqual(1);
  }

  async function expectTouchSafeTargets() {
    const targets = await page
      .locator(".lobby button:visible, .lobby input:visible")
      .evaluateAll((elements) =>
        elements.map((element) => {
          const box = element.getBoundingClientRect();
          return { width: box.width, height: box.height };
        }),
      );
    for (const target of targets) {
      expect(target.width).toBeGreaterThanOrEqual(44);
      expect(target.height).toBeGreaterThanOrEqual(44);
    }
  }

  const roomCode = page.locator("#room-code");
  const friendToggle = page.locator(".friend-card .mode-card-toggle");
  const matchmakingToggle = page.locator(".matchmaking-card .mode-card-toggle");
  const friendDescription = page.locator(".friend-card .mode-copy p");
  const matchmakingDescription = page.locator(".matchmaking-card .mode-copy p");
  const matchmakingAction = page.locator(
    ".matchmaking-card .mode-card-panel .button",
  );

  if (portraitPhone) {
    await expect(page.locator(".mode-card-toggle:visible")).toHaveCount(2);
    await expect(friendToggle).toHaveAttribute("aria-expanded", "false");
    await expect(matchmakingToggle).toHaveAttribute("aria-expanded", "false");
    await expect(friendDescription).toBeHidden();
    await expect(matchmakingDescription).toBeHidden();
    await expect(roomCode).toBeHidden();
    await expect(matchmakingAction).toBeHidden();
  } else {
    await expect(page.locator(".mode-card-toggle:visible")).toHaveCount(0);
    await expect(friendDescription).toBeVisible();
    await expect(matchmakingDescription).toBeVisible();
    await expect(roomCode).toBeVisible();
    if (locale === "zh-TW") {
      await roomCode.focus();
      await expect(roomCode).toBeInViewport();
    }
  }
  await expectTouchSafeTargets();

  if (portraitPhone) {
    expect(layout.gridLeft, JSON.stringify(layout)).toBeGreaterThanOrEqual(20);
    expect(
      layout.viewportWidth - layout.gridRight,
      JSON.stringify(layout),
    ).toBeGreaterThanOrEqual(20);
    expect(
      Math.abs(layout.gridLeft - (layout.viewportWidth - layout.gridRight)),
      JSON.stringify(layout),
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs(layout.cardHeights[1] - layout.cardHeights[2]),
      JSON.stringify(layout),
    ).toBeLessThanOrEqual(1);
    expect(layout.cardHeights[0], JSON.stringify(layout)).toBeGreaterThan(
      layout.cardHeights[1],
    );
    const cardGaps = [
      layout.cardTops[1] - layout.cardBottoms[0],
      layout.cardTops[2] - layout.cardBottoms[1],
    ];
    for (const gap of cardGaps) {
      expect(gap, JSON.stringify(layout)).toBeCloseTo(16, 0);
    }
    expect(
      layout.viewportHeight - layout.gridBottom,
      JSON.stringify(layout),
    ).toBeGreaterThanOrEqual(40);
    expect(
      Math.abs(
        (layout.gridTop + layout.gridBottom) / 2 -
          (layout.mainTop + layout.mainBottom) / 2,
      ),
      JSON.stringify(layout),
    ).toBeLessThanOrEqual(2);
    expect(
      layout.viewportHeight - layout.mainBottom,
      JSON.stringify(layout),
    ).toBeLessThanOrEqual(20);
  }

  await expect(page.locator('link[rel~="icon"]')).toHaveCount(3);
  const iconHrefs = await page
    .locator('link[rel~="icon"]')
    .evaluateAll((links) => links.map((link) => link.getAttribute("href")));
  expect(iconHrefs).toEqual([
    "/connect4-mark.svg?v=20260730-2",
    "/connect4-mark-32.png?v=20260730-2",
    "/favicon.ico?v=20260730-2",
  ]);
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute(
    "href",
    "/apple-touch-icon.png?v=20260730-2",
  );
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
    "href",
    "/site.webmanifest?v=20260730-2",
  );
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    "https://connect4.oraclelee.com/",
  );
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
    "content",
    "https://connect4.oraclelee.com/connect4-preview.png?v=20260730-2",
  );
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
    "content",
    "summary_large_image",
  );

  if (portraitPhone) {
    await friendToggle.click();
    await expect(friendToggle).toHaveAttribute("aria-expanded", "true");
    await expect(matchmakingToggle).toHaveAttribute("aria-expanded", "false");
    await expect(friendDescription).toBeVisible();
    await expect(roomCode).toBeVisible();
    await roomCode.fill("lan427");
    await expect(roomCode).toHaveValue("LAN427");
    await expectTouchSafeTargets();

    await matchmakingToggle.click();
    await expect(friendToggle).toHaveAttribute("aria-expanded", "false");
    await expect(matchmakingToggle).toHaveAttribute("aria-expanded", "true");
    await expect(roomCode).toBeHidden();
    await expect(matchmakingDescription).toBeVisible();
    await expect(matchmakingAction).toBeVisible();
    await expectTouchSafeTargets();

    await matchmakingToggle.click();
    await friendToggle.click();
    await expect(roomCode).toHaveValue("LAN427");
    await friendToggle.click();
    await expect(friendToggle).toHaveAttribute("aria-expanded", "false");
  }

  if (testInfo.project.name.startsWith("desktop-")) {
    const verticalOffset = await page.locator(".lobby").evaluate((lobby) => {
      const main = document.querySelector("main")!.getBoundingClientRect();
      const section = lobby.getBoundingClientRect();
      return (section.top + section.bottom) / 2 - (main.top + main.bottom) / 2;
    });
    expect(Math.abs(verticalOffset)).toBeLessThanOrEqual(1);
  }

  await expect(page).toHaveScreenshot(
    `${testInfo.project.name}-lobby-${locale}.png`,
    { fullPage: true },
  );
}

test("game board is touch-safe and visually stable", async ({
  page,
}, testInfo) => {
  await mockApp(page);
  await page.goto("/play");
  await expect(page.locator(".board-wrap")).toBeVisible();

  const overflow = await page.evaluate(() => ({
    document:
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
    body: document.body.scrollWidth - document.body.clientWidth,
    sizes: {
      innerWidth: window.innerWidth,
      documentClient: document.documentElement.clientWidth,
      documentScroll: document.documentElement.scrollWidth,
      bodyClient: document.body.clientWidth,
      bodyScroll: document.body.scrollWidth,
      bodyRect: document.body.getBoundingClientRect().toJSON(),
    },
    offenders: [...document.querySelectorAll<HTMLElement>("body *")]
      .filter((element) => {
        const box = element.getBoundingClientRect();
        return (
          box.left < -1 || box.right > document.documentElement.clientWidth + 1
        );
      })
      .map((element) => ({
        className: element.className,
        tag: element.tagName,
        left: element.getBoundingClientRect().left,
        right: element.getBoundingClientRect().right,
      }))
      .slice(0, 8),
  }));

  if (testInfo.project.name.endsWith("-landscape")) {
    const landscapeLayout = await page.evaluate(() => ({
      mediaMatches: matchMedia(
        "(orientation: landscape) and (max-height: 500px)",
      ).matches,
      brandFontSize: getComputedStyle(
        document.querySelector<HTMLElement>(".brand")!,
      ).fontSize,
    }));
    expect(landscapeLayout).toEqual({
      mediaMatches: true,
      brandFontSize: "0px",
    });
  }

  if (testInfo.project.name.startsWith("desktop-")) {
    const desktopLayout = await page.evaluate(() => {
      const main = document.querySelector("main")!.getBoundingClientRect();
      const game = document
        .querySelector(".game-screen")!
        .getBoundingClientRect();
      return {
        brandFontSize: Number.parseFloat(
          getComputedStyle(document.querySelector<HTMLElement>(".brand")!)
            .fontSize,
        ),
        verticalOffset:
          (game.top + game.bottom) / 2 - (main.top + main.bottom) / 2,
      };
    });
    expect(desktopLayout.brandFontSize).toBe(22);
    expect(Math.abs(desktopLayout.verticalOffset)).toBeLessThanOrEqual(1);
  }

  if (
    !testInfo.project.name.startsWith("desktop-") &&
    !testInfo.project.name.endsWith("-landscape")
  ) {
    const portraitLayout = await page.evaluate(() => {
      const main = document.querySelector("main")!.getBoundingClientRect();
      const game = document
        .querySelector(".game-screen")!
        .getBoundingClientRect();
      return {
        mainHeight: main.height,
        mainBottom: main.bottom,
        gameHeight: game.height,
        viewportHeight: window.innerHeight,
        verticalOffset:
          (game.top + game.bottom) / 2 - (main.top + main.bottom) / 2,
      };
    });
    expect(
      portraitLayout.gameHeight,
      JSON.stringify(portraitLayout),
    ).toBeLessThanOrEqual(portraitLayout.mainHeight);
    expect(
      Math.abs(portraitLayout.verticalOffset),
      JSON.stringify(portraitLayout),
    ).toBeLessThanOrEqual(2);
    expect(
      portraitLayout.viewportHeight - portraitLayout.mainBottom,
      JSON.stringify(portraitLayout),
    ).toBeLessThanOrEqual(20);
  }

  expect(overflow.document, JSON.stringify(overflow)).toBeLessThanOrEqual(1);
  expect(overflow.body, JSON.stringify(overflow)).toBeLessThanOrEqual(1);

  const targets = await page.locator("button:visible").evaluateAll((buttons) =>
    buttons.map((button) => {
      const box = button.getBoundingClientRect();
      return { width: box.width, height: box.height };
    }),
  );
  for (const target of targets) {
    expect(target.width).toBeGreaterThanOrEqual(44);
    expect(target.height).toBeGreaterThanOrEqual(44);
  }

  const actionLayout = await page
    .locator(".game-actions")
    .evaluate((actions) => {
      const button = actions.querySelector("button")!;
      return {
        actionWidth: actions.getBoundingClientRect().width,
        buttonWidth: button.getBoundingClientRect().width,
        buttonCount: actions.querySelectorAll("button").length,
        gridColumn: getComputedStyle(button).gridColumn,
        sidebarWidth: document
          .querySelector(".game-sidebar")!
          .getBoundingClientRect().width,
        playerStripWidth: document
          .querySelector(".player-strip")!
          .getBoundingClientRect().width,
        screenWidth: document
          .querySelector(".game-screen")!
          .getBoundingClientRect().width,
      };
    });
  expect(actionLayout.buttonCount).toBe(1);
  expect(
    actionLayout.buttonWidth / actionLayout.actionWidth,
    JSON.stringify(actionLayout),
  ).toBeGreaterThan(0.95);
  expect(
    actionLayout.actionWidth / actionLayout.sidebarWidth,
    JSON.stringify(actionLayout),
  ).toBeGreaterThan(0.95);
  expect(
    actionLayout.playerStripWidth / actionLayout.sidebarWidth,
    JSON.stringify(actionLayout),
  ).toBeLessThanOrEqual(1.01);
  if (
    !testInfo.project.name.endsWith("-landscape") &&
    !testInfo.project.name.startsWith("desktop-")
  ) {
    expect(
      actionLayout.sidebarWidth / actionLayout.screenWidth,
      JSON.stringify(actionLayout),
    ).toBeGreaterThan(0.95);
  }

  if (
    !testInfo.project.name.endsWith("-landscape") &&
    !testInfo.project.name.startsWith("desktop-")
  ) {
    const bottomLayout = await page.locator(".board-wrap").evaluate((board) => {
      const boardBox = board.getBoundingClientRect();
      const boardStyle = getComputedStyle(board);
      const border = Number.parseFloat(boardStyle.borderBottomWidth);
      const grid = board.querySelector<HTMLElement>(".board-grid")!;
      const gridBox = grid.getBoundingClientRect();
      const gridStyle = getComputedStyle(grid);
      const lastRow = [...board.querySelectorAll<HTMLElement>(".slot")].slice(
        -7,
      );
      const slotBoxes = lastRow.map((slot) => slot.getBoundingClientRect());
      return {
        inset:
          boardBox.bottom -
          border -
          Math.max(...slotBoxes.map((slot) => slot.bottom)),
        board: { width: boardBox.width, height: boardBox.height },
        grid: { width: gridBox.width, height: gridBox.height },
        paddingBottom: gridStyle.paddingBottom,
        rowGap: gridStyle.rowGap,
        slot: { width: slotBoxes[0].width, height: slotBoxes[0].height },
      };
    });
    expect(
      bottomLayout.inset,
      JSON.stringify(bottomLayout),
    ).toBeGreaterThanOrEqual(7.5);
  }

  await expect(page).toHaveScreenshot(`${testInfo.project.name}-game.png`, {
    fullPage: true,
  });
});

test("Traditional Chinese lobby is aligned and touch-safe", async ({
  page,
}, testInfo) => {
  await mockApp(page, lobbySnapshot("zh-TW"));
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
  await mockApp(page, lobbySnapshot("en"));
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
  const isPortraitPhone =
    !testInfo.project.name.startsWith("desktop-") &&
    !testInfo.project.name.endsWith("-landscape");
  test.skip(!isPortraitPhone, "This interaction is intentionally phone-only.");

  await mockApp(page, lobbySnapshot("zh-TW"));
  await page.goto("/");
  await page.locator(".friend-card .mode-card-toggle").click();

  const roomCode = page.getByLabel("房間代碼");
  await expect(roomCode).toBeVisible();
  await expect(roomCode).toBeInViewport();
  await expect(page.getByRole("button", { name: "加入房間" })).toBeInViewport();

  const layout = await page.locator(".lobby-grid").evaluate((grid) => {
    const box = grid.getBoundingClientRect();
    return {
      left: box.left,
      right: box.right,
      viewportWidth: window.innerWidth,
      overflow:
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    };
  });
  expect(layout.left).toBeGreaterThanOrEqual(20);
  expect(layout.viewportWidth - layout.right).toBeGreaterThanOrEqual(20);
  expect(layout.overflow).toBeLessThanOrEqual(1);

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
  await mockApp(page, lobbySnapshot("zh-TW"));
  await page.goto("/");
  await page.locator(".friend-card .mode-card-toggle").click();

  const layout = await page.locator(".lobby-grid").evaluate((grid) => {
    const box = grid.getBoundingClientRect();
    const main = document.querySelector("main")!.getBoundingClientRect();
    return {
      gridTop: box.top,
      gridBottom: box.bottom,
      mainTop: main.top,
      documentHeight: document.documentElement.scrollHeight,
      viewportHeight: window.innerHeight,
      scrollY: window.scrollY,
    };
  });

  expect(layout.scrollY, JSON.stringify(layout)).toBe(0);
  expect(layout.gridTop, JSON.stringify(layout)).toBeGreaterThanOrEqual(
    layout.mainTop + 19,
  );
  expect(layout.documentHeight, JSON.stringify(layout)).toBeGreaterThan(
    layout.viewportHeight,
  );
  expect(layout.gridBottom, JSON.stringify(layout)).toBeLessThanOrEqual(
    layout.documentHeight + 1,
  );

  const joinButton = page.getByRole("button", { name: "加入房間" });
  await joinButton.scrollIntoViewIfNeeded();
  await expect(joinButton).toBeInViewport();
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(page.locator(".topbar")).toBeInViewport();
});

test("portrait profile fields match on mobile browsers", async ({
  page,
}, testInfo) => {
  const isPortraitPhone =
    !testInfo.project.name.startsWith("desktop-") &&
    !testInfo.project.name.endsWith("-landscape");
  test.skip(!isPortraitPhone, "This regression targets portrait mobile UI.");

  await mockApp(page, lobbySnapshot("zh-TW"));
  await page.goto("/");
  await page.locator(".profile-button").click();

  const nickname = page.locator(".profile-sheet input");
  const language = page.locator(".profile-sheet select");
  await expect(nickname).toBeVisible();
  await expect(language).toBeVisible();

  const controls = await page.locator(".profile-sheet").evaluate((sheet) => {
    const input = sheet.querySelector("input")!;
    const select = sheet.querySelector("select")!;
    const inputBox = input.getBoundingClientRect();
    const selectBox = select.getBoundingClientRect();
    const chevron = getComputedStyle(
      sheet.querySelector(".select-field")!,
      "::after",
    );
    return {
      input: {
        width: inputBox.width,
        height: inputBox.height,
        fontSize: Number.parseFloat(getComputedStyle(input).fontSize),
      },
      select: {
        width: selectBox.width,
        height: selectBox.height,
        fontSize: Number.parseFloat(getComputedStyle(select).fontSize),
        appearance: getComputedStyle(select).appearance,
      },
      chevron: {
        content: chevron.content,
        pointerEvents: chevron.pointerEvents,
      },
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
  expect(controls.chevron.content).not.toBe("none");
  expect(controls.chevron.pointerEvents).toBe("none");

  await language.selectOption("en");
  await expect(language).toHaveValue("en");

  if (
    testInfo.project.name === "iphone-14promax-15plus-15promax-16plus" ||
    testInfo.project.name === "galaxy-s26-ultra"
  ) {
    await expect(page).toHaveScreenshot(`${testInfo.project.name}-profile.png`);
  }
});

test("brand icons and install metadata contain the green-pink mark", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop-1366x768",
    "One desktop Chromium project is sufficient for asset decoding.",
  );

  await mockApp(page, lobbySnapshot("zh-TW"));
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
    background_color: "#f7f3ee",
    theme_color: "#f7f3ee",
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

test("desktop private-game controls use the enlarged layout", async ({
  page,
}, testInfo) => {
  test.skip(
    !testInfo.project.name.startsWith("desktop-"),
    "The enlarged sidebar is intentionally desktop-only.",
  );

  await mockApp(page, privateSnapshot("finished"));
  await page.goto("/play");
  await expect(page.getByRole("button", { name: "再來一局" })).toBeVisible();

  const layout = await page.locator(".game-sidebar").evaluate((sidebar) => {
    const playerStrip = sidebar.querySelector(".player-strip")!;
    const token = sidebar.querySelector(".player-token")!;
    const playerName = sidebar.querySelector(".player-side strong")!;
    const versus = sidebar.querySelector(".versus")!;
    const roomCode = sidebar.querySelector(".compact-code")!;
    const code = sidebar.querySelector(".compact-code strong")!;
    const buttons = [
      ...sidebar.querySelectorAll<HTMLElement>(".game-actions .button"),
    ];
    return {
      playerHeight: playerStrip.getBoundingClientRect().height,
      tokenWidth: token.getBoundingClientRect().width,
      playerNameSize: Number.parseFloat(getComputedStyle(playerName).fontSize),
      versusSize: Number.parseFloat(getComputedStyle(versus).fontSize),
      roomCodeHeight: roomCode.getBoundingClientRect().height,
      codeSize: Number.parseFloat(getComputedStyle(code).fontSize),
      buttonHeights: buttons.map(
        (button) => button.getBoundingClientRect().height,
      ),
      buttonSizes: buttons.map((button) =>
        Number.parseFloat(getComputedStyle(button).fontSize),
      ),
      overflow:
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    };
  });

  expect(layout.playerHeight).toBeGreaterThanOrEqual(104);
  expect(layout.tokenWidth).toBe(44);
  expect(layout.playerNameSize).toBe(18);
  expect(layout.versusSize).toBe(14);
  expect(layout.roomCodeHeight).toBeGreaterThanOrEqual(88);
  expect(layout.codeSize).toBe(24);
  expect(layout.buttonHeights).toEqual([56, 56]);
  expect(layout.buttonSizes).toEqual([17, 17]);
  expect(layout.overflow).toBeLessThanOrEqual(1);

  await expect(page).toHaveScreenshot(
    `${testInfo.project.name}-private-finished.png`,
    { fullPage: true },
  );
});

test("room copy button works on HTTP LAN while waiting", async ({ page }) => {
  await forceLanCopyFallback(page);
  await mockApp(page, privateSnapshot("waiting"));
  await page.goto("/play");

  const copyButton = page.getByRole("button", { name: "複製" });
  await copyButton.click();
  await expect(copyButton).toHaveText("已複製");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as typeof window & { __copiedRoomCode?: string })
            .__copiedRoomCode,
      ),
    )
    .toBe("LAN427");
});

test("room copy button works on HTTP LAN during a game", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name.endsWith("-landscape"),
    "The compact Room Code control is intentionally hidden in short landscape layouts.",
  );
  await forceLanCopyFallback(page);
  await mockApp(page, privateSnapshot("playing"));
  await page.goto("/play");

  const copyButton = page.locator(".compact-code button");
  await copyButton.click();
  await expect(copyButton.locator("small")).toHaveText("已複製");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as typeof window & { __copiedRoomCode?: string })
            .__copiedRoomCode,
      ),
    )
    .toBe("LAN427");
});
