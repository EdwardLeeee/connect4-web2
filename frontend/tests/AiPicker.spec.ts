import { createApp, h, nextTick, ref, type App } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AiPicker from "../src/components/AiPicker.vue";
import { i18n } from "../src/i18n";
import { DEFAULT_CHOICE, type AiChoice } from "../src/utils/aiChoice";

let app: App | null = null;

async function mountPicker(choice: AiChoice = DEFAULT_CHOICE, canStart = true) {
  const start = vi.fn();
  const close = vi.fn();
  const allowed = ref(canStart);
  const host = document.createElement("div");
  document.body.append(host);
  app = createApp({
    render: () =>
      h(AiPicker, {
        choice,
        canStart: allowed.value,
        onStart: start,
        onClose: close,
      }),
  });
  app.use(i18n);
  app.mount(host);
  await nextTick();
  // Teleported to <body>, outside the host.
  const sheet = document.querySelector<HTMLFormElement>(".ai-picker")!;
  const radio = (name: string, label: string) =>
    [...sheet.querySelectorAll<HTMLInputElement>(`input[name=${name}]`)].find(
      (input) => input.closest("label")!.textContent!.includes(label),
    )!;
  const pick = async (name: string, label: string) => {
    radio(name, label).click();
    await nextTick();
  };
  const checked = (name: string) =>
    sheet
      .querySelector<HTMLInputElement>(`input[name=${name}]:checked`)!
      .closest("label")!
      .textContent!.trim();
  const warning = () =>
    sheet.querySelector(".picker-warn")?.textContent?.trim() ?? null;
  const startButton = sheet.querySelector<HTMLButtonElement>(".btn.primary")!;
  return {
    sheet,
    start,
    close,
    allowed,
    pick,
    checked,
    warning,
    startButton,
  };
}

beforeEach(() => {
  i18n.global.locale.value = "zh-TW";
});

afterEach(() => {
  app?.unmount();
  app = null;
  document.body.replaceChildren();
});

describe("the AI sheet (R29 01-B)", () => {
  it("lists the three levels, who starts and your colour, top to bottom", async () => {
    const { sheet } = await mountPicker();
    expect(sheet.getAttribute("role")).toBe("dialog");
    expect(sheet.querySelector("h2")!.textContent).toBe("選擇難度");
    expect(
      [...sheet.querySelectorAll(".picker-level")].map((level) => [
        level.querySelector("b")!.textContent,
        level.querySelector("small")!.textContent,
      ]),
    ).toEqual([
      ["簡單", "剛開始玩的好對手"],
      ["普通", "要動點腦筋才贏得了"],
      ["Super AI", "準備好迎戰最強的 AI 了嗎？"],
    ]);
    expect(
      [...sheet.querySelectorAll(".picker-label")].map((l) => l.textContent),
    ).toEqual(["誰先下", "你的顏色"]);
    expect(
      [...sheet.querySelectorAll(".picker-seg label")].map((l) =>
        l.textContent!.trim(),
      ),
    ).toEqual(["你先下", "AI 先下", "綠色", "粉紅色"]);
    expect(
      [...sheet.querySelectorAll(".picker-swatch")].map((s) => s.className),
    ).toEqual(["token picker-swatch green", "token picker-swatch pink"]);
    expect(
      [...sheet.querySelectorAll(".btn")].map((b) => b.textContent!.trim()),
    ).toEqual(["開始對戰", "取消"]);
  });

  it("opens on the choice it is given, marked as picked", async () => {
    const { sheet, checked } = await mountPicker({
      difficulty: "normal",
      aiFirst: true,
      colour: "pink",
    });
    expect(checked("ai-level")).toContain("普通");
    expect(checked("ai-first")).toBe("AI 先下");
    expect(checked("ai-colour")).toBe("粉紅色");
    expect(
      [...sheet.querySelectorAll(".is-on")].map((on) =>
        on.textContent!.trim().slice(0, 2),
      ),
    ).toEqual(["普通", "AI", "粉紅"]);
  });

  it("warns only while Super AI and AI 先下 are both picked (05-A)", async () => {
    const { pick, warning } = await mountPicker();
    expect(warning()).toBeNull();
    await pick("ai-first", "AI 先下");
    expect(warning()).toBe("Super AI 先下時很難贏");
    await pick("ai-level", "普通");
    expect(warning()).toBeNull();
    await pick("ai-level", "Super AI");
    expect(warning()).toBe("Super AI 先下時很難贏");
    await pick("ai-first", "你先下");
    expect(warning()).toBeNull();
  });

  it("starts with what is picked", async () => {
    const { pick, startButton, start, close } = await mountPicker();
    await pick("ai-level", "簡單");
    await pick("ai-first", "AI 先下");
    await pick("ai-colour", "粉紅色");
    startButton.click();
    expect(start).toHaveBeenCalledWith({
      difficulty: "easy",
      aiFirst: true,
      colour: "pink",
    });
    expect(close).not.toHaveBeenCalled();
  });

  it("cannot start while the website is offline", async () => {
    const { startButton, start, allowed } = await mountPicker(
      DEFAULT_CHOICE,
      false,
    );
    expect(startButton.disabled).toBe(true);
    startButton.closest("form")!.requestSubmit();
    expect(start).not.toHaveBeenCalled();
    allowed.value = true;
    await nextTick();
    startButton.click();
    expect(start).toHaveBeenCalledWith(DEFAULT_CHOICE);
  });

  it.each([
    [
      "取消",
      (sheet: HTMLElement) =>
        sheet.querySelector<HTMLElement>(".btn.ghost")!.click(),
    ],
    [
      "the scrim",
      () => document.querySelector<HTMLElement>(".picker-scrim")!.click(),
    ],
    [
      "Esc",
      () =>
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })),
    ],
  ])("closes on %s without starting", async (_, act) => {
    const { sheet, start, close, pick } = await mountPicker();
    await pick("ai-level", "簡單");
    act(sheet);
    expect(close).toHaveBeenCalledTimes(1);
    expect(start).not.toHaveBeenCalled();
  });

  it("stays open on a tap inside it", async () => {
    const { sheet, close } = await mountPicker();
    sheet
      .querySelector("h2")!
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(close).not.toHaveBeenCalled();
  });

  it("takes the focus, so a keyboard starts inside it", async () => {
    const { sheet } = await mountPicker();
    expect(document.activeElement).toBe(sheet);
  });

  it("speaks English and Thai", async () => {
    i18n.global.locale.value = "en";
    const { sheet, pick, warning } = await mountPicker();
    expect(sheet.querySelector("h2")!.textContent).toBe("Pick a level");
    await pick("ai-first", "AI first");
    expect(warning()).toBe("Super AI is very hard to beat when it starts");
    app!.unmount();
    document.body.replaceChildren();
    i18n.global.locale.value = "th";
    const thai = await mountPicker();
    expect(
      [...thai.sheet.querySelectorAll(".picker-level b")].map(
        (b) => b.textContent,
      ),
    ).toEqual(["ง่าย", "ปกติ", "Super AI"]);
    expect(thai.startButton.textContent!.trim()).toBe("เริ่มเลย");
  });
});
