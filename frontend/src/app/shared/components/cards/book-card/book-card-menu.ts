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

const isDigitalType = (type: BookFileType | undefined): boolean => !!type && type !== 'AUDIOBOOK';

export function bookHasDigitalFile(book: BookSummary): boolean {
  return (
    isDigitalType(book.primaryFile?.bookType) ||
    (book.alternativeFormats ?? []).some(file => isDigitalType(file.bookType))
  );
}
