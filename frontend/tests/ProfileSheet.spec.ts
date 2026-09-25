import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createPinia, setActivePinia } from "pinia";
import { createApp, nextTick, type App } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { i18n } from "../src/i18n";

// The privacy line at the foot of the sheet (spec: 隱私權政策小字), shown on
// the website and in the app.
const native = vi.hoisted(() => ({ on: false }));
vi.mock("../src/native", () => ({ isNative: () => native.on }));

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
