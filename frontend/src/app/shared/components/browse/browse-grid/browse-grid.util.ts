export const SKELETON_DELAY_MS = 180;

export const BROWSE_GRID_SKELETON_OVERSCAN_ROWS = 2;

export function skeletonFillCount(
  viewportHeight: number,
  columns: number,
  itemHeight: number,
  gap: number,
): number {
  const safeColumns = Math.max(1, Math.floor(columns));
  const rowStride = itemHeight + gap;
  const visibleRows = Math.ceil(viewportHeight / rowStride);
  const rows = Math.max(1, visibleRows + BROWSE_GRID_SKELETON_OVERSCAN_ROWS);
  return safeColumns * rows;
}
