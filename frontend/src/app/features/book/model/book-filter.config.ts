import {ReadStatus} from './book.model';

interface RangeConfig {
  id: number;
  label: string;
  min: number;
  max: number;
  sortIndex: number;
}

export const READ_STATUS_LABELS: Readonly<Record<ReadStatus, string>> = {
  [ReadStatus.UNREAD]: 'Unread',
  [ReadStatus.READING]: 'Reading',
  [ReadStatus.RE_READING]: 'Re-reading',
  [ReadStatus.PARTIALLY_READ]: 'Partially Read',
  [ReadStatus.PAUSED]: 'Paused',
  [ReadStatus.READ]: 'Read',
  [ReadStatus.WONT_READ]: 'Won\'t Read',
  [ReadStatus.ABANDONED]: 'Abandoned',
  [ReadStatus.UNSET]: 'Unset'
};

export const FILE_SIZE_RANGES: readonly RangeConfig[] = [
  {id: 0, label: '< 1 MB', min: 0, max: 1024, sortIndex: 0},
  {id: 1, label: '1–10 MB', min: 1024, max: 10240, sortIndex: 1},
  {id: 2, label: '10–50 MB', min: 10240, max: 51200, sortIndex: 2},
  {id: 3, label: '50–100 MB', min: 51200, max: 102400, sortIndex: 3},
  {id: 4, label: '100–500 MB', min: 102400, max: 512000, sortIndex: 4},
  {id: 5, label: '0.5–1 GB', min: 512000, max: 1048576, sortIndex: 5},
  {id: 6, label: '1–2 GB', min: 1048576, max: 2097152, sortIndex: 6},
  {id: 7, label: '2+ GB', min: 2097152, max: Infinity, sortIndex: 7}
];

export const PAGE_COUNT_RANGES: readonly RangeConfig[] = [
  {id: 0, label: '< 50 pages', min: 0, max: 50, sortIndex: 0},
  {id: 1, label: '50–100 pages', min: 50, max: 100, sortIndex: 1},
  {id: 2, label: '100–200 pages', min: 100, max: 200, sortIndex: 2},
  {id: 3, label: '200–400 pages', min: 200, max: 400, sortIndex: 3},
  {id: 4, label: '400–600 pages', min: 400, max: 600, sortIndex: 4},
  {id: 5, label: '600–1000 pages', min: 600, max: 1000, sortIndex: 5},
  {id: 6, label: '1000+ pages', min: 1000, max: Infinity, sortIndex: 6}
];

export const MATCH_SCORE_RANGES: readonly RangeConfig[] = [
  {id: 0, min: 0.95, max: 1.01, label: 'Outstanding (95–100%)', sortIndex: 0},
  {id: 1, min: 0.90, max: 0.95, label: 'Excellent (90–94%)', sortIndex: 1},
  {id: 2, min: 0.80, max: 0.90, label: 'Great (80–89%)', sortIndex: 2},
  {id: 3, min: 0.70, max: 0.80, label: 'Good (70–79%)', sortIndex: 3},
  {id: 4, min: 0.50, max: 0.70, label: 'Fair (50–69%)', sortIndex: 4},
  {id: 5, min: 0.30, max: 0.50, label: 'Weak (30–49%)', sortIndex: 5},
  {id: 6, min: 0.00, max: 0.30, label: 'Poor (0–29%)', sortIndex: 6}
];

export const AGE_RATING_OPTIONS: readonly RangeConfig[] = [
  {id: 0, min: 0, max: 6, label: 'All Ages', sortIndex: 0},
  {id: 6, min: 6, max: 10, label: '6+', sortIndex: 1},
  {id: 10, min: 10, max: 13, label: '10+', sortIndex: 2},
  {id: 13, min: 13, max: 16, label: '13+', sortIndex: 3},
  {id: 16, min: 16, max: 18, label: '16+', sortIndex: 4},
  {id: 18, min: 18, max: 21, label: '18+', sortIndex: 5},
  {id: 21, min: 21, max: Infinity, label: '21+', sortIndex: 6}
];

export const CONTENT_RATING_LABELS: Readonly<Record<string, string>> = {
  'EVERYONE': 'Everyone',
  'TEEN': 'Teen',
  'MATURE': 'Mature',
  'ADULT': 'Adult',
  'EXPLICIT': 'Explicit'
};
