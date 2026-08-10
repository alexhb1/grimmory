import {
  type BookReadStatus,
  type KnownBookReadStatus,
} from '../data/book-response.models';

export type BookReadStatusTarget = Exclude<KnownBookReadStatus, 'UNSET'>;

export const CLEAR_BOOK_READ_STATUS = 'UNSET' satisfies KnownBookReadStatus;
export const CLEAR_BOOK_READ_STATUS_LABEL_KEY = 'book.filter.readStatus.unset';

export const BOOK_READ_STATUS_LABEL_KEYS: Readonly<Record<BookReadStatusTarget, string>> = {
  UNREAD: 'book.filter.readStatus.unread',
  READING: 'book.filter.readStatus.reading',
  RE_READING: 'book.filter.readStatus.reReading',
  PARTIALLY_READ: 'book.filter.readStatus.partiallyRead',
  PAUSED: 'book.filter.readStatus.paused',
  READ: 'book.filter.readStatus.read',
  WONT_READ: 'book.filter.readStatus.wontRead',
  ABANDONED: 'book.filter.readStatus.abandoned',
};

export const BOOK_READ_STATUS_TARGETS = Object.keys(
  BOOK_READ_STATUS_LABEL_KEYS,
) as readonly BookReadStatusTarget[];

export function isBookReadStatusTarget(status: BookReadStatus): status is BookReadStatusTarget {
  return BOOK_READ_STATUS_TARGETS.some(target => target === status);
}
