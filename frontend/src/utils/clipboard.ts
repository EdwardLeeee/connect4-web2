function copyWithSelection(text: string): boolean {
  const activeElement =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.readOnly = true;
  textarea.setAttribute("aria-hidden", "true");
  Object.assign(textarea.style, {
    position: "fixed",
    inset: "0 auto auto 0",
    width: "2px",
    height: "2px",
    padding: "0",
    border: "0",
    opacity: "0",
    pointerEvents: "none",
    fontSize: "16px",
  });
  document.body.append(textarea);
  textarea.focus({ preventScroll: true });
  textarea.select();
  textarea.setSelectionRange(0, text.length);

  let copied = false;
  try {
    copied =
      typeof document.execCommand === "function" &&
      document.execCommand("copy");
  } catch {
    copied = false;
  } finally {
    textarea.remove();
    activeElement?.focus({ preventScroll: true });
  }
  return copied;
}

export async function copyText(text: string): Promise<boolean> {
  if (window.isSecureContext && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // A denied Clipboard API call still gets the selection-based fallback.
    }
  }
  return copyWithSelection(text);
}
