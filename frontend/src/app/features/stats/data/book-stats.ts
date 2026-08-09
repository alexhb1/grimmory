import {
  BOOK_READ_STATUSES,
  type BookSummary,
  type KnownBookReadStatus,
} from '../../book/data/book-response.models';

export function bookReadStatus(book: BookSummary): KnownBookReadStatus {
  return BOOK_READ_STATUSES.some((status) => status === book.readStatus)
    ? book.readStatus as KnownBookReadStatus
    : 'UNSET';
}

export function bookProgress(book: BookSummary): number {
  if (bookReadStatus(book) === 'READ') return 100;

  return Math.min(100, Math.max(0,
    book.pdfProgress?.percentage ?? 0,
    book.epubProgress?.percentage ?? 0,
    book.cbxProgress?.percentage ?? 0,
    book.audiobookProgress?.percentage ?? 0,
    book.koreaderProgress?.percentage ?? 0,
    book.koboProgress?.percentage ?? 0,
  ));
}
