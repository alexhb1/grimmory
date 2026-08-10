import {
  BookFileResponse,
  BookReadStatus,
  KnownBookReadStatus,
  BookSummary,
} from '../../data/book-response.models';

export interface BookMenuCapabilities {
  canDownload: boolean;
  canEmailBook: boolean;
  canEditMetadata: boolean;
  canDeleteBook: boolean;
  canResetGrimmoryProgress: boolean;
  canResetKoreaderProgress: boolean;
}

export type ReadStatusTarget = Exclude<KnownBookReadStatus, 'UNSET'>;
export const CLEAR_READ_STATUS = 'UNSET' as const satisfies KnownBookReadStatus;
export const CLEAR_READ_STATUS_LABEL_KEY = 'book.menu.clearStatus';

export const READ_STATUS_TARGET_LABEL_KEYS: Readonly<Record<ReadStatusTarget, string>> = {
  UNREAD: 'book.filter.readStatus.unread',
  READING: 'book.filter.readStatus.reading',
  RE_READING: 'book.filter.readStatus.reReading',
  PARTIALLY_READ: 'book.filter.readStatus.partiallyRead',
  PAUSED: 'book.filter.readStatus.paused',
  READ: 'book.filter.readStatus.read',
  WONT_READ: 'book.filter.readStatus.wontRead',
  ABANDONED: 'book.filter.readStatus.abandoned',
};

export const READ_STATUS_TARGETS: readonly ReadStatusTarget[] = Object.keys(
  READ_STATUS_TARGET_LABEL_KEYS,
) as ReadStatusTarget[];

export function isReadStatusTarget(status: BookReadStatus): status is ReadStatusTarget {
  return READ_STATUS_TARGETS.some(target => target === status);
}

export function bookHasDigitalFile(book: BookSummary): boolean {
  return book.primaryFile != null || (book.alternativeFormats ?? []).length > 0;
}

export function bookAdditionalFiles(book: BookSummary | null): BookFileResponse[] {
  if (!book) {
    return [];
  }
  return [...(book.alternativeFormats ?? []), ...(book.supplementaryFiles ?? [])];
}

export interface BookFileLabelParts {
  /** Collapsible part of the name (extension stripped); truncates on narrow menus. */
  base: string;
  /** Always-visible tail: extension and size. */
  suffix: string;
  /** Full label for the title attribute. */
  full: string;
}

export function bookFileLabelParts(file: BookFileResponse): BookFileLabelParts {
  const name = file.fileName ?? file.bookType ?? '';
  const ext = (file.extension ?? '').trim();
  const size = fileSizeLabel(file.fileSizeKb);

  let base = name;
  if (ext && base.toLowerCase().endsWith(`.${ext.toLowerCase()}`)) {
    base = base.slice(0, -(ext.length + 1));
  }

  const suffix = `${ext ? `.${ext}` : ''}${size ? ` (${size})` : ''}`;
  const full = `${base}${suffix}`.trim();
  return {base: base || name, suffix, full: full || name};
}

function fileSizeLabel(fileSizeKb: number | undefined): string | null {
  if (fileSizeKb == null) {
    return null;
  }
  const units = ['KB', 'MB', 'GB', 'TB'];
  let size = fileSizeKb;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  const decimals = size >= 100 ? 0 : size >= 10 ? 1 : 2;
  return `${size.toFixed(decimals)} ${units[unit]}`;
}
