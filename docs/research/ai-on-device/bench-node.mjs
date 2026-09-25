import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import * as lib from "./package/connect_four_ai_wasm.js";
import { runBench } from "./bench-core.mjs";

const [mode, file] = process.argv.slice(2);
const exports = lib.initSync({ module: readFileSync(new URL("./package/connect_four_ai_wasm_bg.wasm", import.meta.url)) });
const before = exports.memory.buffer.byteLength;
const lines = readFileSync(file, "utf8").split("\n").filter(Boolean);
const results = runBench(lib, lines, mode, () => performance.now());
for (const r of results) {
  console.log([r.game, r.moves, r.ms.toFixed(3), r.best, "[" + r.scores.map((s) => (s ?? "null")).join(",") + "]"].join("\t"));
}
console.error(`wasm memory: before solver ${before} bytes, after run ${exports.memory.buffer.byteLength} bytes`);
