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
    pendingLocale: async () => null,
    setPendingLocale: async () => {},
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

  it("locks the nickname and says why", async () => {
    const { host } = await mountOffline("曜宇");
    const input = host.querySelector<HTMLInputElement>(".profile-sheet input")!;
    expect(input.disabled).toBe(true);
    expect(input.classList).toContain("is-locked");
    expect(input.value).toBe("曜宇");
    expect(host.querySelector(".sheet-note")?.textContent?.trim()).toBe(
      "目前離線：暱稱要連線後才能改，語言可以直接切換。",
    );
    // The note sits right above Cancel and Save.
    expect(
      host.querySelector(".sheet-note")?.nextElementSibling?.classList,
    ).toContain("sheet-actions");
  });

  it("shows no error for an empty nickname, and saves the language", async () => {
    const { host, saveProfile } = await mountOffline("");
    expect(host.querySelector(".form-error")).toBeNull();
    const save = host.querySelector<HTMLButtonElement>("button[type=submit]")!;
    expect(save.disabled).toBe(false);
    const select = host.querySelector<HTMLSelectElement>("select")!;
    select.value = "en";
    select.dispatchEvent(new Event("change"));
    save.click();
    await nextTick();
    expect(saveProfile).toHaveBeenCalledWith("", "en");
  });
});
