// The iOS/Android app (Capacitor) only. On the website isNative() is false
// and none of these plugins is ever called.
import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import { Share } from "@capacitor/share";

export function isNative(): boolean {
  return Capacitor.isNativePlatform();
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
