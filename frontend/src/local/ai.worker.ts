// Module Worker for the app's on-device AI; solving never runs on the main thread.
// Posted {id, history}; replies {id, column} or {id, error}.
import init, * as wasm from "connect-four-ai-wasm";
import wasmUrl from "connect-four-ai-wasm/connect_four_ai_wasm_bg.wasm?url";
import tableUrl from "../../../native_solver/data/reply-table.bin?url";
import { Engine, type WasmLib } from "./engine";
import { ReplyTable } from "./replyTable";

async function bytes(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.arrayBuffer();
}

/** Without the table every move is still solved exactly, just more slowly. */
async function loadTable(): Promise<ReplyTable | null> {
  let problem: string;
  try {
    const table = ReplyTable.parse(await bytes(tableUrl));
    if (table) return table;
    problem = "malformed file";
  } catch (error) {
    problem = String(error);
  }
  // Logged so that a slow AI on a real phone can be traced to the missing table.
  console.warn(
    `[local-ai] reply table unavailable (${problem}); every move is solved live`,
  );
  return null;
}

const engine = (async () => {
  // Instantiating from bytes avoids depending on the app server's .wasm MIME type.
  await init({ module_or_path: await bytes(wasmUrl) });
  return new Engine(wasm as unknown as WasmLib, await loadTable());
})();

const scope = self as unknown as {
  onmessage:
    ((event: MessageEvent<{ id: number; history: string }>) => void) | null;
  postMessage(message: unknown): void;
};

scope.onmessage = async ({ data: { id, history } }) => {
  try {
    scope.postMessage({ id, column: (await engine).bestMove(history) });
  } catch (error) {
    scope.postMessage({ id, error: String(error) });
  }
};
