// Where the client talks to the server and which site its links point to.
// The website is built without either variable and keeps using its own
// origin. The iOS/Android app is served from capacitor://localhost or
// https://localhost, so it is built with VITE_API_ORIGIN (and optionally
// VITE_SITE_ORIGIN) pointing at the public site.

/** The origin in `value`, or "" when unset; anything but http(s) is an error. */
function originOf(name: string, value: string | undefined): string {
  const text = (value ?? "").trim();
  if (!text) return "";
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new Error(`${name} must be an http(s) origin, got "${text}"`);
  }
  if (!/^https?:$/.test(url.protocol) || url.pathname !== "/" || url.search) {
    throw new Error(`${name} must be an http(s) origin, got "${text}"`);
  }
  return url.origin;
}

function apiOrigin(): string {
  return originOf("VITE_API_ORIGIN", import.meta.env.VITE_API_ORIGIN);
}

/** An API path: relative on the website, on the API origin in the app. */
export function apiUrl(path: string): string {
  return `${apiOrigin()}${path}`;
}

/** The game WebSocket, on the API origin or this page's host. */
export function socketUrl(): string {
  const origin = apiOrigin();
  if (origin) return `${origin.replace(/^http/, "ws")}/ws`;
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws`;
}

/** The public website that invite links and QR codes send friends to. */
export function siteOrigin(): string {
  return (
    originOf("VITE_SITE_ORIGIN", import.meta.env.VITE_SITE_ORIGIN) ||
    apiOrigin() ||
    window.location.origin
  );
}
