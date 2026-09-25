/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** The server the app talks to, e.g. https://connect4.oraclelee.com. Unset
   * on the website, which talks to its own origin. */
  readonly VITE_API_ORIGIN?: string;
  /** The public site invite links point to; defaults to the API origin, then
   * the page's own origin. */
  readonly VITE_SITE_ORIGIN?: string;
}

/** package.json's version, injected at build time (vite.config.ts). */
declare const __APP_VERSION__: string;
