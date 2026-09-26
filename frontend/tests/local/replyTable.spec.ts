// @vitest-environment node
import { describe, expect, it } from "vitest";
import { positionKeys, ReplyTable } from "../../src/local/replyTable";
import { fixture, tableBytes, wasmLib } from "./wasm";

const positions =
  fixture<
    Array<{ history: string; scores: (number | null)[]; in_table: boolean }>
  >("ai-parity.json");
const table = ReplyTable.parse(tableBytes());
const mirror = (history: string) =>
  [...history].map((move) => String(8 - Number(move))).join("");

describe("reply table", () => {
  it("parses the committed file", () => {
    expect(table?.size).toBe(52_721);
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
