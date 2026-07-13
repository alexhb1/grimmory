import {BookFileType, BookReadStatus, BookSummary} from '../../../../features/book/data/book-response.models';

export interface BookCardMenuCapabilities {
  canDownload: boolean;
  canEmailBook: boolean;
  canEditMetadata: boolean;
  canDeleteBook: boolean;
}

export interface BookCardMenuShelf {
  id: number;
  name: string;
  checked: boolean;
}

export type ReadStatusTarget = Exclude<BookReadStatus, 'UNSET'>;

export const READ_STATUS_TARGET_LABELS: Readonly<Record<ReadStatusTarget, string>> = {
  UNREAD: 'Unread',
  READING: 'Reading',
  RE_READING: 'Re-reading',
  PARTIALLY_READ: 'Partially Read',
  PAUSED: 'Paused',
  READ: 'Read',
  WONT_READ: 'Won\'t Read',
  ABANDONED: 'Abandoned',
};

export const READ_STATUS_TARGETS: readonly ReadStatusTarget[] = Object.keys(
  READ_STATUS_TARGET_LABELS,
) as ReadStatusTarget[];

const isDigitalType = (type: BookFileType | undefined): boolean => !!type && type !== 'AUDIOBOOK';

export function bookHasDigitalFile(book: BookSummary): boolean {
  return (
    isDigitalType(book.primaryFile?.bookType) ||
    (book.alternativeFormats ?? []).some(file => isDigitalType(file.bookType))
  );
}
