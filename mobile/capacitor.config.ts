import type { CapacitorConfig } from "@capacitor/cli";

// The web app is bundled into the binary (webDir), never loaded from server.url.
// The default schemes give the origins the backend expects:
// capacitor://localhost on iOS and https://localhost on Android.
const config: CapacitorConfig = {
  appId: "com.oraclelee.connect4",
  appName: "Four In A Row",
  webDir: "../frontend/dist",
  backgroundColor: "#fff4dc",
  plugins: {
    // "native" never injects --safe-area-inset-* variables, which 8.5.2 reports
    // wrongly on Android 14 and below (ionic-team/capacitor#8623); the web app
    // reads env(safe-area-inset-*) only.
    // The page is always light (no dark mode), so keep dark status bar icons.
    SystemBars: {
      insetsHandling: "native",
      style: "LIGHT",
    },
  },
};

export default config;
