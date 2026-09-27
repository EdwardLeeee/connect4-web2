import { createApp, h, nextTick } from "vue";
import { afterEach, describe, expect, it } from "vitest";
import ClauseText from "../src/components/ClauseText.vue";
import { i18n } from "../src/i18n";

function render(text: string, thaiOnly = false) {
  const host = document.createElement("div");
  const app = createApp({ render: () => h(ClauseText, { text, thaiOnly }) });
  app.use(i18n).mount(host);
  return host;
}

afterEach(() => {
  i18n.global.locale.value = "zh-TW";
});

describe("a sentence that breaks only between its phrases (3.3.0)", () => {
  it("keeps Thai phrases whole, with the spaces between them", async () => {
    i18n.global.locale.value = "th";
    await nextTick();
    const host = render("หลุดนานเกินไป แพ้เกมนี้", true);
    expect(
      [...host.querySelectorAll(".clauses > span")].map((s) => s.textContent),
    ).toEqual(["หลุดนานเกินไป", "แพ้เกมนี้"]);
    expect(host.textContent).toBe("หลุดนานเกินไป แพ้เกมนี้");
  });

  it("leaves a name tied to its verb in one phrase", async () => {
    i18n.global.locale.value = "th";
    await nextTick();
    const text = i18n.global.t("game.rematchIncomingSub", { name: "มะลิ" });
    const host = render(text, true);
    expect(
      [...host.querySelectorAll(".clauses > span")].map((s) => s.textContent),
    ).toEqual([
      "แตะเพื่อเริ่มเกมต่อไป",
      "สีเหมือนเดิม",
      "เกมนี้\u00A0มะลิ\u00A0เดินก่อน",
    ]);
  });

  it("stays plain text in Chinese and English when Thai-only", async () => {
    for (const [locale, text] of [
      ["zh-TW", "這局算你獲勝。對手已離開，無法再來一局。"],
      ["en", "You win this game. They've left, so a rematch isn't available."],
    ] as const) {
      i18n.global.locale.value = locale;
      await nextTick();
      const host = render(text, true);
      expect(host.textContent).toBe(text);
      expect(host.children).toHaveLength(0);
    }
  });
});
