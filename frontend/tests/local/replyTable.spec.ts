// @vitest-environment node
import { describe, expect, it } from "vitest";
import { positionKeys, ReplyTable } from "../../src/local/replyTable";
import { fixture, realEngine, sharedEngine, tableBytes, wasmLib } from "./wasm";

const positions =
  fixture<
    Array<{ history: string; scores: (number | null)[]; in_table: boolean }>
  >("ai-parity.json");
const table = ReplyTable.parse(tableBytes());
const mirror = (history: string) =>
  [...history].map((move) => String(8 - Number(move))).join("");

describe("reply table", () => {
  it("parses the committed file", () => {
    expect(table?.size).toBe(66_540);
  });

  it("computes the engine's own position keys", () => {
    const lib = wasmLib();
    for (const { history } of positions) {
      for (const moves of [history, mirror(history)]) {
        const position = lib.Position.fromMoves(moves);
        expect(positionKeys(moves).key).toBe(BigInt(position.getKey()));
        position.free();
      }
    }
  });

  it("answers the server's scores, and only for stored positions", () => {
    for (const { history, scores, in_table } of positions) {
      expect(table?.scores(history) ?? null).toEqual(in_table ? scores : null);
    }
  });

  it("restores the orientation of mirrored positions", () => {
    const stored = positions.filter(
      ({ in_table, scores }) =>
        in_table &&
        JSON.stringify(scores) !== JSON.stringify([...scores].reverse()),
    );
    expect(stored.length).toBeGreaterThan(10);
    for (const { history, scores } of stored) {
      expect(table?.scores(mirror(history))).toEqual([...scores].reverse());
    }
  });

  it(
    "answers every position a Super AI moving first meets after 8, 10 and 12 moves",
    { timeout: 60_000 },
    () => {
      const lib = wasmLib();
      const engine = sharedEngine();
      const live = realEngine(false);
      const wins = (history: string, column: number) => {
        const position = lib.Position.fromMoves(history);
        const won = position.isWinningMove(column);
        position.free();
        return won;
      };
      let seed = 20261019;
      const random = (n: number) => {
        seed = (seed * 1103515245 + 12345) % 2 ** 31;
        return seed % n;
      };
      let checked = 0;
      for (let game = 0; game < 6; game++) {
        let history = "";
        while (history.length <= 12) {
          if ([8, 10, 12].includes(history.length)) {
            expect(table?.scores(history), history).toEqual(
              live.scores(history),
            );
            checked += 1;
          }
          const column = engine.bestMove(history);
          if (wins(history, column)) break;
          history += String(column + 1);
          const open = [...Array(7).keys()].filter(
            (c) => [...history].filter((m) => m === String(c + 1)).length < 6,
          );
          const reply = open[random(open.length)];
          if (wins(history, reply)) break;
          history += String(reply + 1);
        }
      }
      live.dispose();
      expect(checked).toBeGreaterThan(10);
    },
  );

  it("rejects malformed files", () => {
    const good = new Uint8Array(tableBytes());
    const broken = (change: (bytes: Uint8Array) => Uint8Array) =>
      ReplyTable.parse(change(good.slice()).buffer as ArrayBuffer);
    expect(broken((b) => ((b[0] = 0x58), b))).toBeNull(); // magic
    expect(broken((b) => ((b[4] = 2), b))).toBeNull(); // version
    expect(broken((b) => ((b[12] = 1), b))).toBeNull(); // reserved
    expect(broken((b) => ((b[8] += 1), b))).toBeNull(); // count
    expect(broken((b) => b.slice(0, b.length - 1))).toBeNull(); // truncated
    expect(broken((b) => ((b[16 + 8] = 40), b))).toBeNull(); // score out of range
    expect(
      broken((b) => {
        const first = b.slice(16, 31);
        b.set(b.slice(31, 46), 16);
        b.set(first, 31);
        return b;
      }),
    ).toBeNull(); // keys out of order
  });
});
