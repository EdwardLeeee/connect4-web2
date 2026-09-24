// WebKit needs libavif13 (sudo) on this host, so every viewport uses Chromium.
// Measure the current production UI (Vite dev server + mocked snapshot, same
// approach as frontend/e2e/mobile-layout.spec.ts) so design numbers can be
// checked against reality. Usage:
//   PLAYWRIGHT_BROWSERS_PATH=.playwright node design/tools/measure.mjs http://127.0.0.1:5199
import { writeFileSync } from "node:fs";
import { chromium } from "../../frontend/node_modules/playwright/index.mjs";

const base = process.argv[2] ?? "http://127.0.0.1:5173";
const board = [
  [null, null, null, null, null, null, null],
  [null, null, null, null, null, null, null],
  [null, null, null, null, null, null, null],
  [null, null, null, null, null, null, null],
  [null, null, "green", "pink", "green", null, null],
  [null, null, "pink", "green", "pink", null, null],
];
const session = { nickname: "曜宇", locale: "zh-TW" };
const snapshots = {
  lobby: { session, queue: { searching: false }, room: null, game: null },
  game: {
    session,
    queue: { searching: false },
    room: { id: "room", code: null, mode: "ai" },
    game: {
      revision: 9, status: "playing", board, turn: "green", you: "green",
      winner: null, winning_cells: [], result_reason: null,
      players: {
        green: { nickname: "曜宇", connected: true, is_ai: false },
        pink: { nickname: "Perfect AI", connected: true, is_ai: true },
      },
      rematch_requested: false, grace_deadline: null,
    },
  },
};
snapshots.privateFinished = {
  ...snapshots.game,
  room: { id: "private-room", code: "LAN427", mode: "private" },
  game: {
    ...snapshots.game.game, status: "finished", winner: "green",
    result_reason: "connect_four",
    players: {
      green: { nickname: "曜宇", connected: true, is_ai: false },
      pink: { nickname: "小安", connected: true, is_ai: false },
    },
  },
};

const viewports = [
  { name: "desktop-1440x900", engine: chromium, use: { viewport: { width: 1440, height: 900 } } },
  { name: "desktop-1366x768", engine: chromium, use: { viewport: { width: 1366, height: 768 } } },
  { name: "iphone-430x932", engine: chromium, use: { viewport: { width: 430, height: 932 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true } },
  { name: "landscape-892x412", engine: chromium, use: { viewport: { width: 892, height: 412 }, deviceScaleFactor: 3.5, hasTouch: true, isMobile: true } },
];

const selectors = [
  "main", ".topbar", ".brand", ".profile-button", ".turn-card", ".turn-token",
  ".board-wrap", ".board-grid", ".slot", ".game-sidebar", ".player-strip",
  ".player-token", ".player-side strong", ".versus", ".compact-code",
  ".compact-code strong", ".game-actions .button", ".lobby-grid", ".mode-card",
  ".mode-card h2", ".mode-card p", ".card-icon", ".mode-card .button",
];

async function measure(page) {
  return page.evaluate((selectors) => {
    const out = {
      document: { scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth },
    };
    for (const selector of selectors) {
      const nodes = [...document.querySelectorAll(selector)].filter((n) => n.getClientRects().length);
      if (!nodes.length) continue;
      out[selector] = nodes.slice(0, 3).map((node) => {
        const r = node.getBoundingClientRect();
        const s = getComputedStyle(node);
        return {
          x: Math.round(r.x * 10) / 10, y: Math.round(r.y * 10) / 10,
          w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10,
          fontSize: s.fontSize, fontWeight: s.fontWeight, fontFamily: s.fontFamily.split(",")[0],
          radius: s.borderRadius, padding: s.padding, gap: s.gap,
        };
      });
    }
    return out;
  }, selectors);
}

const result = { measuredAt: new Date().toISOString(), base, views: {} };
for (const vp of viewports) {
  const browser = await vp.engine.launch();
  for (const [key, snapshot] of Object.entries(snapshots)) {
    const context = await browser.newContext({ ...vp.use, locale: "zh-TW", reducedMotion: "reduce" });
    const page = await context.newPage();
    await page.route("**/api/session", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(snapshot.session) }));
    await page.routeWebSocket(/\/ws$/, (socket) =>
      socket.send(JSON.stringify({ type: "state.snapshot", payload: snapshot })));
    await page.goto(key === "lobby" ? `${base}/` : `${base}/play`);
    await page.waitForSelector(key === "lobby" ? ".mode-card" : ".board-wrap");
    await page.waitForTimeout(300);
    result.views[`${vp.name}/${key}`] = await measure(page);
    await context.close();
  }
  await browser.close();
}
writeFileSync(new URL("../measurements/current.json", import.meta.url), JSON.stringify(result, null, 1));
console.log("wrote design/measurements/current.json");
