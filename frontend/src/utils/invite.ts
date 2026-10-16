import { isNative, nativeShare } from "../native";
import { copyText } from "./clipboard";
import { siteOrigin } from "./origin";

/**
 * The deep link a friend opens to land on the invite page, as the QR code
 * shows it. It always points to the public website, also from inside the
 * app; the app opens it itself where Universal Links are set up.
 */
export function inviteUrl(code: string): string {
  return `${siteOrigin()}/r/${encodeURIComponent(code)}`;
}

/**
 * The link shared or copied: LINE opens it in the phone's own browser, not
 * its in-app one, so the app or the website takes it from there. A QR code
 * is scanned by the camera and keeps the plain link.
 */
export function shareUrl(code: string): string {
  return `${inviteUrl(code)}?openExternalBrowser=1`;
}

/** Normalises a code from a link or the input; returns "" when it cannot be one. */
export function roomCodeFrom(value: unknown): string {
  const code = typeof value === "string" ? value.trim().toUpperCase() : "";
  return /^[A-Z0-9]{6}$/.test(code) ? code : "";
}

export function canShare(): boolean {
  return isNative() || typeof navigator.share === "function";
}

/**
 * Opens the system share sheet, falling back to copying the link when sharing
 * is unavailable or fails. Dismissing the sheet is not an error.
 */
export async function shareInvite(
  code: string,
  title: string,
  text: string,
): Promise<"shared" | "copied" | "dismissed" | "failed"> {
  const url = shareUrl(code);
  // The app uses the system share sheet through Capacitor.
  if (isNative()) {
    const result = await nativeShare({ title, text, url });
    if (result !== "failed") return result;
  } else if (canShare()) {
    try {
      await navigator.share({ title, text, url });
      return "shared";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return "dismissed";
      }
    }
  }
  return (await copyText(url)) ? "copied" : "failed";
}
