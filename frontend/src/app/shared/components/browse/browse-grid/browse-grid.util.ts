export const SKELETON_DELAY_MS = 180;

export const BROWSE_GRID_SKELETON_OVERSCAN_ROWS = 2;

export function skeletonFillCount(
  viewportHeight: number,
  columns: number,
  itemHeight: number,
  gap: number,
  overscanRows: number = BROWSE_GRID_SKELETON_OVERSCAN_ROWS,
): number {
  const safeColumns = Math.max(1, Math.floor(columns));
  const rowStride = itemHeight + gap;
  const visibleRows = rowStride > 0 ? Math.ceil(viewportHeight / rowStride) : 0;
  const rows = Math.max(1, visibleRows + overscanRows);
  return safeColumns * rows;
}
