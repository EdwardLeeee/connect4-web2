export interface WinLine {
  width: number;
  height: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  length: number;
}

/**
 * Line through the centres of the winning cells, in the container's own
 * coordinates, running from one end of the four to the other.
 */
export function measureWinLine(
  container: HTMLElement,
  cells: HTMLElement[],
): WinLine | null {
  if (cells.length < 2) return null;
  const box = container.getBoundingClientRect();
  const points = cells
    .map((cell) => {
      const rect = cell.getBoundingClientRect();
      return {
        x: rect.left + rect.width / 2 - box.left,
        y: rect.top + rect.height / 2 - box.top,
      };
    })
    .sort((a, b) => a.x - b.x || b.y - a.y);
  const [start, end] = [points[0], points[points.length - 1]];
  return {
    width: box.width,
    height: box.height,
    x1: start.x,
    y1: start.y,
    x2: end.x,
    y2: end.y,
    length: Math.hypot(end.x - start.x, end.y - start.y),
  };
}

/** Orders winning cells from the start of the line, for the staggered pop. */
export function winOrder(
  cells: Array<{ row: number; column: number }>,
): Map<string, number> {
  const sorted = [...cells].sort(
    (a, b) => a.column - b.column || b.row - a.row,
  );
  return new Map(
    sorted.map(({ row, column }, index) => [`${row}:${column}`, index]),
  );
}
