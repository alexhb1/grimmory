import {LucideArrowRight, LucideBookOpen, LucidePlay, type LucideIconData} from '@lucide/angular';

import {BookSummary} from './book-response.models';

export type BookReadAction = 'read' | 'continueReading' | 'play' | 'continueListening';

export const BOOK_READ_ACTION_SHORT_KEYS: Readonly<Record<BookReadAction, string>> = {
  read: 'cards.book.read',
  continueReading: 'cards.book.continue',
  play: 'cards.book.play',
  continueListening: 'cards.book.continue',
};

export const BOOK_READ_ACTION_LONG_KEYS: Readonly<Record<BookReadAction, string>> = {
  read: 'book.menu.read',
  continueReading: 'book.menu.continueReading',
  play: 'book.menu.play',
  continueListening: 'book.menu.continueListening',
};

export const BOOK_READ_ACTION_ICONS: Readonly<Record<BookReadAction, LucideIconData>> = {
  read: LucideBookOpen.icon,
  continueReading: LucideArrowRight.icon,
  play: LucidePlay.icon,
  continueListening: LucidePlay.icon,
};

export function bookGrimmoryProgress(book: BookSummary): number | null {
  return (
    book.epubProgress?.percentage ??
    book.pdfProgress?.percentage ??
    book.cbxProgress?.percentage ??
    book.audiobookProgress?.percentage ??
    null
  );
}

export function bookProgressPercentage(book: BookSummary): number | null {
  return bookGrimmoryProgress(book)
    ?? book.koreaderProgress?.percentage
    ?? book.koboProgress?.percentage
    ?? null;
}

export function bookPartlyRead(book: BookSummary): boolean {
  const progress = bookProgressPercentage(book);
  return progress !== null && progress > 0 && progress < 100;
}

export function bookReadAction(book: BookSummary): BookReadAction {
  const audiobook = book.primaryFile?.bookType === 'AUDIOBOOK';
  if (bookPartlyRead(book)) {
    return audiobook ? 'continueListening' : 'continueReading';
  }
  return audiobook ? 'play' : 'read';
}
