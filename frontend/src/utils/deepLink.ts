import { roomCodeFrom } from "./invite";
import { siteOrigin } from "./origin";

// Invite links the app opens itself (2026-10-16): the website's
// https://…/r/CODE (Universal Links), the older https://…/?room=CODE, and
// oraclelee-fourinarow://r/CODE from the website's "open in the app" button.
// Anything else, or a code that is not one, is left alone.
const SCHEME_LINK = /^oraclelee-fourinarow:\/\/r\/([^/?#]+)\/?(?:[?#].*)?$/i;
const SITE_PATH = /^\/r\/([^/]+)\/?$/;

/** The room an invite link opens, or "" when it is not one. */
export function roomFromLink(link: string): string {
  const scheme = SCHEME_LINK.exec(link);
  if (scheme) return roomCodeFrom(decode(scheme[1]));
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return "";
  }
  if (url.origin !== siteOrigin()) return "";
  const path = SITE_PATH.exec(url.pathname);
  if (path) return roomCodeFrom(decode(path[1]));
  return url.pathname === "/" ? roomCodeFrom(url.searchParams.get("room")) : "";
}

function decode(part: string): string {
  try {
    return decodeURIComponent(part);
  } catch {
    return "";
  }
}

// iOS hands a link opened at launch to appUrlOpen and to getLaunchUrl both.
const SAME_LINK_MS = 2000;

/**
 * Opens invite links handed to the app: at launch (getLaunchUrl, which is
 * how Android reports one) and while it runs (appUrlOpen). App only; the
 * plugin loads on first use, so the website never downloads it.
 */
export async function listenForInviteLinks(
  open: (room: string) => void,
): Promise<void> {
  const { App } = await import("@capacitor/app");
  let last = { link: "", at: -Infinity };
  const handle = (link: string | undefined) => {
    if (!link) return;
    const now = Date.now();
    if (link === last.link && now - last.at < SAME_LINK_MS) return;
    last = { link, at: now };
    const room = roomFromLink(link);
    if (room) open(room);
  };
  await App.addListener("appUrlOpen", ({ url }) => handle(url));
  handle((await App.getLaunchUrl())?.url);
}
