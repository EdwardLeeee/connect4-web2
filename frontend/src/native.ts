// The iOS/Android app (Capacitor) only. On the website isNative() is false
// and none of these plugins is ever called.
import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import { Share } from "@capacitor/share";

export function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

/**
 * AI games are played on the device (3.2.0) in the app only. The dev server
 * also does it when an e2e test sets the flag; production builds drop that.
 */
export function usesLocalAi(): boolean {
  if (isNative()) return true;
  return (
    import.meta.env.DEV &&
    (window as { __CONNECT4_LOCAL_AI__?: boolean }).__CONNECT4_LOCAL_AI__ ===
      true
  );
}

// docs/protocol.md "App 連線": the app authenticates with a session token
// instead of a cookie; every /api/session reply carries the current one.
const TOKEN_KEY = "session-token";

export const tokenStore = {
  async get(): Promise<string | null> {
    return (await Preferences.get({ key: TOKEN_KEY })).value;
  },
  async set(token: string): Promise<void> {
    await Preferences.set({ key: TOKEN_KEY, value: token });
  },
};

// The on-device AI game in progress, so it survives the app being closed.
const LOCAL_GAME_KEY = "local-game";

export const localGameStore = {
  async get(): Promise<string | null> {
    return (await Preferences.get({ key: LOCAL_GAME_KEY })).value;
  },
  async set(value: string | null): Promise<void> {
    if (value === null) await Preferences.remove({ key: LOCAL_GAME_KEY });
    else await Preferences.set({ key: LOCAL_GAME_KEY, value });
  },
};

/** The system share sheet; a cancelled sheet is not an error. */
export async function nativeShare(share: {
  title: string;
  text: string;
  url: string;
}): Promise<"shared" | "dismissed" | "failed"> {
  try {
    await Share.share(share);
    return "shared";
  } catch (error) {
    // iOS rejects with "Share canceled" when the sheet is dismissed.
    return /cancel/i.test(String((error as Error)?.message ?? error))
      ? "dismissed"
      : "failed";
  }
}
