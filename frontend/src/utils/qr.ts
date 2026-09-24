import qrcode from "qrcode-generator";

/** SVG path for a QR code, one unit per module, and its side length. */
export function qrPath(text: string): { size: number; d: string } {
  const code = qrcode(0, "M");
  code.addData(text, "Byte");
  code.make();
  const size = code.getModuleCount();
  const runs: string[] = [];
  for (let row = 0; row < size; row += 1) {
    let column = 0;
    while (column < size) {
      if (!code.isDark(row, column)) {
        column += 1;
        continue;
      }
      const start = column;
      while (column < size && code.isDark(row, column)) column += 1;
      runs.push(`M${start} ${row}h${column - start}v1h${start - column}z`);
    }
  }
  return { size, d: runs.join("") };
}
