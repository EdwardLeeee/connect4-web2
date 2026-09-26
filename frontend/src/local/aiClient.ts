// Main-thread side of ai.worker.ts. Only the app loads this, and only through a dynamic
// import, so the website never downloads the WASM engine or the reply table.
import type { AiEngine } from "./localGame";

export function createWorkerEngine(): AiEngine {
  const worker = new Worker(new URL("./ai.worker.ts", import.meta.url), {
    type: "module",
  });
  const pending = new Map<
    number,
    { resolve: (column: number) => void; reject: (error: Error) => void }
  >();
  let next = 0;

  const failAll = (error: Error) => {
    for (const { reject } of pending.values()) reject(error);
    pending.clear();
  };
  worker.onmessage = ({
    data,
  }: MessageEvent<{ id: number; column?: number; error?: string }>) => {
    const request = pending.get(data.id);
    if (!request) return;
    pending.delete(data.id);
    if (typeof data.column === "number") request.resolve(data.column);
    else request.reject(new Error(data.error ?? "solver unavailable"));
  };
  worker.onerror = (event) =>
    failAll(new Error(event.message || "solver unavailable"));

  return {
    bestMove(history: string): Promise<number> {
      const id = next++;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        worker.postMessage({ id, history });
      });
    },
    dispose(): void {
      worker.terminate();
      failAll(new Error("the AI engine was closed"));
    },
  };
}
