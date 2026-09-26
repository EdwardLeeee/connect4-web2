// Reads native_solver/data/reply-table.bin, the same file the server embeds. The format is
// documented in native_solver/src/reply_table.rs; this mirrors its parse and lookup.
import { COLUMNS, ROWS } from "./constants";

const MAGIC = [0x43, 0x34, 0x52, 0x54]; // "C4RT"
const VERSION = 1;
const HEADER_LEN = 16;
const ENTRY_LEN = 15;
const NO_MOVE = -128;
const COLUMN_BITS = BigInt(ROWS + 1);

export type Scores = (number | null)[];

function columnMask(column: number): bigint {
  return ((1n << BigInt(ROWS)) - 1n) << (BigInt(column) * COLUMN_BITS);
}

/**
 * The engine's position keys for a move history ("1"–"7"): `key` is shared with the
 * mirror image (connect-four-ai `Position::get_key`), `own` is this orientation's
 * `position + mask`.
 */
export function positionKeys(history: string): { key: bigint; own: bigint } {
  let position = 0n;
  let mask = 0n;
  for (const move of history) {
    const column = Number(move) - 1;
    position ^= mask;
    mask |= mask + (1n << (BigInt(column) * COLUMN_BITS));
  }
  let mirroredPosition = 0n;
  let mirroredMask = 0n;
  for (let column = 0; column < COLUMNS; column++) {
    const shift = BigInt(COLUMNS - 1 - 2 * column) * COLUMN_BITS;
    const move = (bits: bigint) =>
      shift >= 0n ? bits << shift : bits >> -shift;
    mirroredPosition |= move(position & columnMask(column));
    mirroredMask |= move(mask & columnMask(column));
  }
  const own = position + mask;
  const mirrored = mirroredPosition + mirroredMask;
  return { key: own < mirrored ? own : mirrored, own };
}

export class ReplyTable {
  private constructor(
    private readonly entries: DataView,
    readonly size: number,
  ) {}

  /** Validates the whole file; a malformed table is `null`, so every move is solved. */
  static parse(bytes: ArrayBuffer): ReplyTable | null {
    const view = new DataView(bytes);
    if (bytes.byteLength < HEADER_LEN) return null;
    if (MAGIC.some((byte, index) => view.getUint8(index) !== byte)) return null;
    if (view.getUint32(4, true) !== VERSION || view.getUint32(12, true) !== 0) {
      return null;
    }
    const count = view.getUint32(8, true);
    if (bytes.byteLength !== HEADER_LEN + count * ENTRY_LEN) return null;
    const entries = new DataView(bytes, HEADER_LEN);
    let previous: bigint | null = null;
    for (let index = 0; index < count; index++) {
      const key = entries.getBigUint64(index * ENTRY_LEN, true);
      if (previous !== null && previous >= key) return null;
      previous = key;
      let legal = 0;
      for (let column = 0; column < COLUMNS; column++) {
        const score = entries.getInt8(index * ENTRY_LEN + 8 + column);
        if (score === NO_MOVE) continue;
        if (score < -21 || score > 21) return null;
        legal += 1;
      }
      if (!legal) return null;
    }
    return new ReplyTable(entries, count);
  }

  /** Exact scores for the position after `history`, or `null` when it is not stored. */
  scores(history: string): Scores | null {
    const { key, own } = positionKeys(history);
    let low = 0;
    let high = this.size;
    while (low < high) {
      const middle = (low + high) >>> 1;
      const found = this.entries.getBigUint64(middle * ENTRY_LEN, true);
      if (found < key) low = middle + 1;
      else if (found > key) high = middle;
      else {
        const stored: Scores = [];
        for (let column = 0; column < COLUMNS; column++) {
          const score = this.entries.getInt8(middle * ENTRY_LEN + 8 + column);
          stored.push(score === NO_MOVE ? null : score);
        }
        // Stored for the orientation whose own key is the shared key.
        return own === key ? stored : stored.reverse();
      }
    }
    return null;
  }
}
