import { copyText } from "./clipboard";

/** The deep link a friend opens to land in the lobby with the code filled in. */
export function inviteUrl(code: string): string {
  return `${window.location.origin}/?room=${encodeURIComponent(code)}`;
}

/** Normalises a code from a link or the input; returns "" when it cannot be one. */
export function roomCodeFrom(value: unknown): string {
  const code = typeof value === "string" ? value.trim().toUpperCase() : "";
  return /^[A-Z0-9]{6}$/.test(code) ? code : "";
}

export function canShare(): boolean {
  return typeof navigator.share === "function";
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
  const url = inviteUrl(code);
  if (canShare()) {
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
