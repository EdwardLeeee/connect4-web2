// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

// Solving runs real WASM; a ninth move without the table takes seconds.
vi.setConfig({ testTimeout: 60_000 });
import { fixture, tableBytes } from "./wasm";

const wasmBytes = readFileSync(
  join(
    __dirname,
    "../../node_modules/connect-four-ai-wasm/connect_four_ai_wasm_bg.wasm",
  ),
);

/** A ninth move that the table answers, with the server's column. */
const ninth = fixture<
  Array<{ history: string; column: number; in_table: boolean }>
>("ai-parity.json").find(
  (position) => position.in_table && position.history.length === 9,
)!;

/** Loads a fresh copy of ai.worker.ts whose table request gets `table`. */
async function startWorker(table: () => Response) {
  const posted: unknown[] = [];
  const scope = {
    onmessage: null,
    postMessage: (m: unknown) => posted.push(m),
  };
  vi.stubGlobal("self", scope);
  vi.stubGlobal("fetch", async (url: string) =>
    url.includes("reply-table") ? table() : new Response(wasmBytes),
  );
  vi.resetModules();
  await import("../../src/local/ai.worker");
  const ask = async (history: string) => {
    (scope.onmessage as unknown as (event: unknown) => void)({
      data: { id: 1, history },
    });
    await vi.waitFor(() => expect(posted).toHaveLength(1), { timeout: 55_000 });
    return posted.pop();
  };
  return { ask };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("the AI worker", () => {
  it("answers from the reply table without a warning", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { ask } = await startWorker(() => new Response(tableBytes()));
    expect(await ask(ninth.history)).toEqual({ id: 1, column: ninth.column });
    expect(warn).not.toHaveBeenCalled();
  });

  it.each([
    ["cannot be fetched", () => new Response(null, { status: 404 }), "404"],
    ["is malformed", () => new Response(new Uint8Array(20)), "malformed"],
  ])(
    "warns once and solves the same move live when the table %s",
    async (_case, table, reason) => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const { ask } = await startWorker(table);
      expect(await ask(ninth.history)).toEqual({ id: 1, column: ninth.column });
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0][0]).toContain(reason);
      expect(warn.mock.calls[0][0]).toContain("solved live");
    },
  );
});
