import { afterEach, describe, expect, it, vi } from "vitest";
import { copyText } from "../src/utils/clipboard";

function setSecureContext(value: boolean) {
  Object.defineProperty(window, "isSecureContext", {
    configurable: true,
    value,
  });
}

function setClipboard(writeText: ReturnType<typeof vi.fn> | undefined) {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: writeText ? { writeText } : undefined,
  });
}

function setExecCommand(copy: () => boolean) {
  Object.defineProperty(document, "execCommand", {
    configurable: true,
    value: vi.fn((command: string) => command === "copy" && copy()),
  });
}

afterEach(() => {
  Reflect.deleteProperty(window, "isSecureContext");
  Reflect.deleteProperty(navigator, "clipboard");
  Reflect.deleteProperty(document, "execCommand");
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("copyText", () => {
  it("uses the Clipboard API in a secure context", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setSecureContext(true);
    setClipboard(writeText);
    setExecCommand(() => true);

    await expect(copyText("ABC123")).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith("ABC123");
    expect(document.execCommand).not.toHaveBeenCalled();
  });

  it("copies synchronously through a selected textarea on HTTP LAN", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const originalButton = document.createElement("button");
    document.body.append(originalButton);
    originalButton.focus();
    setSecureContext(false);
    setClipboard(writeText);
    setExecCommand(() => {
      const textarea = document.activeElement as HTMLTextAreaElement;
      expect(textarea.tagName).toBe("TEXTAREA");
      expect(textarea.value).toBe("LAN427");
      expect(textarea.selectionStart).toBe(0);
      expect(textarea.selectionEnd).toBe(6);
      return true;
    });

    await expect(copyText("LAN427")).resolves.toBe(true);
    expect(writeText).not.toHaveBeenCalled();
    expect(document.querySelector("textarea")).toBeNull();
    expect(document.activeElement).toBe(originalButton);
  });

  it("falls back when the Clipboard API rejects the write", async () => {
    const writeText = vi.fn().mockRejectedValue(new DOMException("Denied"));
    setSecureContext(true);
    setClipboard(writeText);
    setExecCommand(() => true);

    await expect(copyText("ROOM42")).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledOnce();
    expect(document.execCommand).toHaveBeenCalledWith("copy");
  });

  it("reports failure when neither copy path succeeds", async () => {
    setSecureContext(false);
    setClipboard(undefined);
    setExecCommand(() => false);

    await expect(copyText("ROOM42")).resolves.toBe(false);
  });
});
