import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createPinia, setActivePinia } from "pinia";
import { createApp, nextTick, type App } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { i18n } from "../src/i18n";

// The privacy line at the foot of the sheet (spec: 隱私權政策小字), shown on
// the website and in the app.
const native = vi.hoisted(() => ({ on: false }));
vi.mock("../src/native", () => ({
  isNative: () => native.on,
  usesLocalAi: () => native.on,
  profileMemory: {
    lastSession: async () => null,
    rememberSession: async () => {},
    pendingProfile: async () => null,
    setPendingProfile: async () => {},
    restorePending: async () => false,
    setRestorePending: async () => {},
  },
}));

const PRIVACY_URL =
  "https://github.com/EdwardLeeee/connect4-web2/blob/main/PRIVACY.md";
const version = (
  JSON.parse(readFileSync(join(__dirname, "../package.json"), "utf8")) as {
    version: string;
  }
).version;

let app: App | null = null;

async function mountSheet(locale: "zh-TW" | "en" = "zh-TW") {
  const { default: ProfileSheet } =
    await import("../src/components/ProfileSheet.vue");
  setActivePinia(createPinia());
  i18n.global.locale.value = locale;
  const host = document.createElement("div");
  document.body.append(host);
  app = createApp(ProfileSheet);
  app.use(i18n);
  app.mount(host);
  await nextTick();
  return host;
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  app?.unmount();
  app = null;
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("profile sheet privacy line", () => {
  it("shows the policy link and the app version in the app", async () => {
    native.on = true;
    const host = await mountSheet();
    const line = host.querySelector(".privacy-line")!;
    // Three parts spaced by the flex gap: link, dot, version.
    expect([...line.children].map((part) => part.textContent?.trim())).toEqual([
      "隱私權政策",
      "·",
      `版本 ${version}`,
    ]);
    // Only the words are the link; the dot is decoration.
    const link = line.querySelector("a")!;
    expect(link.textContent?.trim()).toBe("隱私權政策");
    expect(link.getAttribute("href")).toBe(PRIVACY_URL);
    expect(line.querySelector('[aria-hidden="true"]')?.textContent).toBe("·");
  });

  it("reads in English too", async () => {
    native.on = true;
    const host = await mountSheet("en");
    const line = host.querySelector(".privacy-line")!;
    expect([...line.children].map((part) => part.textContent?.trim())).toEqual([
      "Privacy Policy",
      "·",
      `Version ${version}`,
    ]);
  });

  it("opens the policy in the system browser", async () => {
    native.on = true;
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    const host = await mountSheet();
    host.querySelector<HTMLAnchorElement>(".privacy-link")!.click();
    expect(open).toHaveBeenCalledWith(PRIVACY_URL, "_blank");
  });

  it("shows on the website too, opening the policy in a new tab", async () => {
    native.on = false;
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    const host = await mountSheet();
    const link = host.querySelector<HTMLAnchorElement>(".privacy-link")!;
    expect(
      [...host.querySelector(".privacy-line")!.children].map((part) =>
        part.textContent?.trim(),
      ),
    ).toEqual(["隱私權政策", "·", `版本 ${version}`]);
    expect(link.target).toBe("_blank");
    expect(link.rel).toBe("noopener noreferrer");
    // The browser follows the link itself; the app path is not taken.
    link.addEventListener("click", (event) => event.preventDefault());
    link.click();
    expect(open).not.toHaveBeenCalled();
  });
});

// 3.2.0 app 離線 03, on the website and in the app alike.
describe("profile sheet offline", () => {
  async function mountOffline(nickname: string) {
    const { default: ProfileSheet } =
      await import("../src/components/ProfileSheet.vue");
    const { useGameStore } = await import("../src/stores/game");
    setActivePinia(createPinia());
    const store = useGameStore();
    store.connection = "offline";
    store.snapshot = {
      server_time: 1,
      session: { nickname, locale: "zh-TW" },
      queue: { searching: false },
      room: null,
      game: null,
    };
    i18n.global.locale.value = "zh-TW";
    const saveProfile = vi.spyOn(store, "saveProfile").mockResolvedValue();
    const host = document.createElement("div");
    document.body.append(host);
    app = createApp(ProfileSheet);
    app.use(i18n);
    app.mount(host);
    await nextTick();
    return { host, saveProfile };
  }

  // 3.3.1: offline the sheet is the one shown online, with no note.
  it("leaves the nickname open, with no note", async () => {
    const { host } = await mountOffline("曜宇");
    const input = host.querySelector<HTMLInputElement>(".profile-sheet input")!;
    expect(input.disabled).toBe(false);
    expect(input.value).toBe("曜宇");
    expect(host.querySelector(".notice-banner")).toBeNull();
    expect(
      host.querySelector("label + label")?.nextElementSibling?.classList,
    ).toContain("sheet-actions");
  });

  it("saves a new nickname and language", async () => {
    const { host, saveProfile } = await mountOffline("曜宇");
    const input = host.querySelector<HTMLInputElement>(".profile-sheet input")!;
    input.value = "小安";
    input.dispatchEvent(new Event("input"));
    const select = host.querySelector<HTMLSelectElement>("select")!;
    select.value = "en";
    select.dispatchEvent(new Event("change"));
    host.querySelector<HTMLButtonElement>("button[type=submit]")!.click();
    await nextTick();
    expect(saveProfile).toHaveBeenCalledWith("小安", "en");
  });

  it("catches an empty nickname as online", async () => {
    const { host, saveProfile } = await mountOffline("");
    expect(host.querySelector(".form-error")?.textContent?.trim()).toBe(
      "請先輸入暱稱",
    );
    const save = host.querySelector<HTMLButtonElement>("button[type=submit]")!;
    expect(save.disabled).toBe(true);
    save.click();
    await nextTick();
    expect(saveProfile).not.toHaveBeenCalled();
  });

  it("explains a nickname the server's rule would refuse", async () => {
    const { host, saveProfile } = await mountOffline("曜宇");
    const { ProfileError } = await import("../src/stores/game");
    saveProfile.mockRejectedValue(new ProfileError("invalid_nickname"));
    host.querySelector<HTMLButtonElement>("button[type=submit]")!.click();
    await nextTick();
    await nextTick();
    expect(host.querySelector(".form-error")?.textContent?.trim()).toBe(
      "暱稱需為 1–18 個字。",
    );
  });
});
