import { type BookSummary } from '../../book/data/book-response.models';
import { ReadStatus } from '../../book/model/book.model';
import { describe, expect, it } from 'vitest';

import { bookProgress, bookReadStatus } from './book-stats';

describe('book stats fields', () => {
  it('treats missing and unknown read statuses as unset', () => {
    expect(bookReadStatus(book())).toBe(ReadStatus.UNSET);
    expect(bookReadStatus(book({ readStatus: 'FUTURE_STATUS' }))).toBe(ReadStatus.UNSET);
  });

  it('uses the greatest progress reported by any reader', () => {
    expect(bookProgress(book({
      pdfProgress: { page: null, percentage: 25 },
      epubProgress: {
        cfi: null,
        href: null,
        contentSourceProgressPercent: null,
        percentage: 75.5,
        ttsPositionCfi: null,
      },
      koreaderProgress: { percentage: 50 },
    }))).toBe(75.5);
  });

  it('includes audiobook progress', () => {
    expect(bookProgress(book({
      readStatus: ReadStatus.READING,
      audiobookProgress: {
        positionMs: 1,
        trackIndex: 0,
        trackPositionMs: 1,
        percentage: 80,
      },
    }))).toBe(80);
  });

  it('reports read books as complete and clamps reader progress', () => {
    expect(bookProgress(book({ readStatus: ReadStatus.READ }))).toBe(100);
    expect(bookProgress(book({
      readStatus: ReadStatus.READING,
      pdfProgress: { page: null, percentage: 110 },
    }))).toBe(100);
    expect(bookProgress(book({
      readStatus: ReadStatus.READING,
      pdfProgress: { page: null, percentage: -10 },
    }))).toBe(0);
  });

});

function book(overrides: Partial<BookSummary> = {}): BookSummary {
  return {
    id: 1,
    libraryId: 1,
    libraryName: 'Library',
    ...overrides,
  };
}
