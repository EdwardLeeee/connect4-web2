import { describe, expect, it } from "vitest";
import { activityRoute } from "../src/utils/activityRoute";

const noInvite = { invite: false, onDevice: false };

describe("where a game or search takes the page", () => {
  it("shows an active one on /play, and the lobby once it is over", () => {
    expect(activityRoute(true, "/", noInvite)).toBe("/play");
    expect(activityRoute(true, "/play", noInvite)).toBeNull();
    expect(activityRoute(false, "/play", noInvite)).toBe("/");
    expect(activityRoute(false, "/", noInvite)).toBeNull();
  });

  // Invite first (2026-10-16).
  it("keeps an invite on screen over an on-device AI game", () => {
    expect(
      activityRoute(true, "/", { invite: true, onDevice: true }),
    ).toBeNull();
    // An on-device game with no invite still shows on /play.
    expect(activityRoute(true, "/", { invite: false, onDevice: true })).toBe(
      "/play",
    );
  });

  it("still goes to /play for a server game, the friend's room included", () => {
    // After joining, the address still has ?room=, but the game is the server's.
    expect(activityRoute(true, "/", { invite: true, onDevice: false })).toBe(
      "/play",
    );
  });
});
