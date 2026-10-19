import { createApp, h, nextTick, type App } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { i18n } from "../src/i18n";

const store = vi.hoisted(() => ({ visits: 0 }));
vi.mock("../src/utils/appBanner", async (original) => ({
  ...(await original<typeof import("../src/utils/appBanner")>()),
  goToAppStore: () => {
    store.visits += 1;
  },
}));

let app: App | null = null;

async function mountBanner(route: "link" | "scheme", room: string) {
  const { default: AppBanner } =
    await import("../src/components/AppBanner.vue");
  const closed = vi.fn();
  const host = document.createElement("div");
  document.body.append(host);
  app = createApp({
    render: () => h(AppBanner, { route, room, onClose: closed }),
  });
  app.use(i18n);
  app.mount(host);
  await nextTick();
  const open = host.querySelector<HTMLAnchorElement>(".app-banner-open")!;
  const text = () => host.querySelector(".app-banner-text")!.textContent;
  return { host, open, text, closed };
}

/** Taps 打開; jsdom cannot follow the link, so the page stops it last. */
function tap(link: HTMLAnchorElement): boolean {
  let prevented = false;
  const last = (event: Event) => {
    prevented = event.defaultPrevented;
    event.preventDefault();
  };
  document.addEventListener("click", last);
  link.click();
  document.removeEventListener("click", last);
  return prevented;
}

beforeEach(() => {
  vi.useFakeTimers();
  i18n.global.locale.value = "zh-TW";
});

afterEach(() => {
  app?.unmount();
  app = null;
  document.body.replaceChildren();
  vi.useRealTimers();
  store.visits = 0;
});

describe("the app banner (R28 B)", () => {
  it("names the app and offers 打開 and ✕", async () => {
    const { host, open, text } = await mountBanner("link", "");
    expect(host.querySelector(".app-banner-name")!.textContent).toBe(
      "四子棋 Super AI",
    );
    expect(text()).toBe("在 App 中打開");
    expect(open.textContent).toBe("打開");
    expect(
      host.querySelector(".app-banner-close")!.getAttribute("aria-label"),
    ).toBe("關閉");
  });

  it("leaves Safari's tap to the link itself", async () => {
    const { open, text } = await mountBanner("link", "LAN427");
    expect(open.getAttribute("href")).toBe(
      "https://connect4-app.oraclelee.com/r/LAN427",
    );
    expect(tap(open)).toBe(false);
    expect(text()).toBe("在 App 中打開");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("waits for the app in an in-app browser, then the App Store", async () => {
    const { open, text } = await mountBanner("scheme", "LAN427");
    expect(open.getAttribute("href")).toBe("oraclelee-fourinarow://r/LAN427");
    expect(tap(open)).toBe(false);
    await nextTick();
    expect(text()).toBe("開啟中…");
    expect(open.classList.contains("is-busy")).toBe(true);
    vi.advanceTimersByTime(2500);
    await nextTick();
    expect(store.visits).toBe(1);
    expect(text()).toBe("在 App 中打開");
  });

  it("stops waiting when it goes away", async () => {
    const { open } = await mountBanner("scheme", "");
    tap(open);
    app!.unmount();
    app = null;
    vi.advanceTimersByTime(10_000);
    expect(store.visits).toBe(0);
  });

  it("tells App.vue when ✕ is tapped", async () => {
    const { host, closed } = await mountBanner("link", "");
    host.querySelector<HTMLButtonElement>(".app-banner-close")!.click();
    expect(closed).toHaveBeenCalledTimes(1);
  });
});
