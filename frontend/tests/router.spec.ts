import { describe, expect, it } from "vitest";
import { router } from "../src/router";

// Invite links (2026-10-16): /r/CODE for new links, /?room=CODE for every
// link and QR code shared before; LINE's openExternalBrowser=1 is dropped.
describe("invite links", () => {
  it("open the invite page from /r/CODE, keeping other parameters", async () => {
    await router.push("/r/LAN427?from=qr");
    expect(router.currentRoute.value.path).toBe("/");
    expect(router.currentRoute.value.query).toEqual({
      from: "qr",
      room: "LAN427",
    });
  });

  it("drop LINE's openExternalBrowser from the address", async () => {
    await router.push("/r/lan427?openExternalBrowser=1");
    expect(router.currentRoute.value.fullPath).toBe("/?room=lan427");
    await router.push("/?room=LAN427&openExternalBrowser=1");
    expect(router.currentRoute.value.fullPath).toBe("/?room=LAN427");
  });

  it("keep the older /?room=CODE links working as they were", async () => {
    await router.push("/?room=LAN427");
    expect(router.currentRoute.value.fullPath).toBe("/?room=LAN427");
  });

  it("send other paths to the lobby", async () => {
    await router.push("/r/LAN427/extra");
    expect(router.currentRoute.value.fullPath).toBe("/");
  });
});
