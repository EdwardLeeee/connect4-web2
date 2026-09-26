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

const engine = (async () => {
  // Instantiating from bytes avoids depending on the app server's .wasm MIME type.
  await init({ module_or_path: await bytes(wasmUrl) });
  // Without the table every move is still solved exactly, just more slowly.
  const table = await bytes(tableUrl)
    .then((buffer) => ReplyTable.parse(buffer))
    .catch(() => null);
  return new Engine(wasm as unknown as WasmLib, table);
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
