import { readFileSync } from "node:fs";
import { defineConfig } from "vitest/config";
import vue from "@vitejs/plugin-vue";
import { searchForWorkspaceRoot } from "vite";

// The app shows its version next to the privacy policy (spec: App 專用);
// release.sh bumps package.json, so the build takes it from there.
const { version } = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
) as { version: string };

export default defineConfig({
  plugins: [vue()],
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  server: {
    port: 5173,
    fs: {
      // The app's on-device AI imports the reply table from native_solver.
      allow: [searchForWorkspaceRoot(process.cwd()), "../native_solver/data"],
    },
    proxy: {
      "/api": "http://127.0.0.1:55555",
      "/ws": {
        target: "ws://127.0.0.1:55555",
        ws: true,
      },
    },
  },
  test: {
    environment: "jsdom",
    include: ["tests/**/*.spec.ts"],
  },
});
