// Loads the real connect-four-ai-wasm engine and reply table in Node for tests/local.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as wasm from "connect-four-ai-wasm";
import { Engine, type WasmLib } from "../../src/local/engine";
import { ReplyTable } from "../../src/local/replyTable";

const root = join(__dirname, "../../..");

export function tableBytes(): ArrayBuffer {
  const bytes = readFileSync(join(root, "native_solver/data/reply-table.bin"));
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  );
}

let initialised = false;
export function wasmLib(): typeof wasm {
  if (!initialised) {
    const module = readFileSync(
      join(
        root,
        "frontend/node_modules/connect-four-ai-wasm/connect_four_ai_wasm_bg.wasm",
      ),
    );
    wasm.initSync({ module });
    initialised = true;
  }
  return wasm;
}

export function realEngine(withTable = true): Engine {
  return new Engine(
    wasmLib() as unknown as WasmLib,
    withTable ? ReplyTable.parse(tableBytes()) : null,
  );
}

let shared: Engine | null = null;
/** One engine for the whole file: each engine allocates a 64 MB table. */
export function sharedEngine(): Engine {
  shared ??= realEngine();
  return shared;
}

export function fixture<T>(name: string): T {
  return JSON.parse(
    readFileSync(join(root, "frontend/tests/local/fixtures", name), "utf8"),
  ) as T;
}
