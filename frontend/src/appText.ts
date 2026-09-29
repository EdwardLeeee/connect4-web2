import { isNative } from "./native";

// 3.3.2 (Apple 2.1): the iOS/Android app says its own name, 四子棋, Four In A
// Row or เรียงสี่, and never "Connect 4" or "connect four"; the website keeps
// its words. Each key the app words differently maps to one in i18n's `app`.
const APP_KEYS: Record<string, string> = {
  "common.brand": "app.brand",
  "common.home": "app.home",
  "common.shareTitle": "app.shareTitle",
  "common.shareText": "app.shareText",
  "lobby.matchmakingBody": "app.matchmakingBody",
  "game.drawSub": "app.drawSub",
};

/** The message key to show: the app's own wording where it has one. */
export function shownKey(key: string): string {
  return (isNative() && APP_KEYS[key]) || key;
}
