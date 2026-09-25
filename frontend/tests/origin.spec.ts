import { afterEach, describe, expect, it, vi } from "vitest";
import { inviteUrl } from "../src/utils/invite";
import { apiUrl, siteOrigin, socketUrl } from "../src/utils/origin";

// jsdom serves the tests from http://localhost:3000.
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("server and site origins", () => {
  it("keeps the website on its own origin when nothing is set", () => {
    expect(apiUrl("/api/session")).toBe("/api/session");
    expect(socketUrl()).toBe(`ws://${window.location.host}/ws`);
    expect(siteOrigin()).toBe(window.location.origin);
    expect(inviteUrl("LAN427")).toBe(`${window.location.origin}/?room=LAN427`);
  });

  it("points the app at the API origin, for invites too", () => {
    vi.stubEnv("VITE_API_ORIGIN", "https://connect4.oraclelee.com/");
    expect(apiUrl("/api/session")).toBe(
      "https://connect4.oraclelee.com/api/session",
    );
    expect(socketUrl()).toBe("wss://connect4.oraclelee.com/ws");
    expect(inviteUrl("LAN427")).toBe(
      "https://connect4.oraclelee.com/?room=LAN427",
    );
  });

  it("uses ws for a plain http server and keeps its port", () => {
    vi.stubEnv("VITE_API_ORIGIN", "http://127.0.0.1:55555");
    expect(socketUrl()).toBe("ws://127.0.0.1:55555/ws");
  });

  it("lets the site origin differ from the API", () => {
    vi.stubEnv("VITE_API_ORIGIN", "https://api.example.com");
    vi.stubEnv("VITE_SITE_ORIGIN", "https://play.example.com");
    expect(apiUrl("/api/session")).toBe("https://api.example.com/api/session");
    expect(siteOrigin()).toBe("https://play.example.com");
  });

  it("refuses anything that is not an http(s) origin", () => {
    for (const value of [
      "connect4.oraclelee.com",
      "ftp://connect4.oraclelee.com",
      "https://connect4.oraclelee.com/game",
    ]) {
      vi.stubEnv("VITE_API_ORIGIN", value);
      expect(() => apiUrl("/api/session"), value).toThrow(/VITE_API_ORIGIN/);
    }
  });
});
