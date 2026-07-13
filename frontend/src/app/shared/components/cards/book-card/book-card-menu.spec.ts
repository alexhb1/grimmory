import {describe, expect, it} from 'vitest';

import {BookSummary} from '../../../../features/book/data/book-response.models';
import {bookHasDigitalFile, READ_STATUS_TARGET_LABELS, READ_STATUS_TARGETS} from './book-card-menu';

function makeBook(overrides: Partial<BookSummary> = {}): BookSummary {
  return {
    id: 1,
    libraryId: 1,
    libraryName: 'Library',
    metadata: {bookId: 1, title: 'The Warden', allMetadataLocked: false},
    primaryFile: {id: 10, bookId: 1, book: true, folderBased: false, bookType: 'EPUB'},
    ...overrides,
  };
}

describe('bookHasDigitalFile', () => {
  it('is true for an ebook primary file', () => {
    expect(bookHasDigitalFile(makeBook())).toBe(true);
  });

  it('is false for an audiobook-only book', () => {
    expect(bookHasDigitalFile(makeBook({primaryFile: {id: 10, bookId: 1, book: true, folderBased: false, bookType: 'AUDIOBOOK'}}))).toBe(false);
  });

  it('is true when an alternative format is digital even if the primary is audio', () => {
    expect(
      bookHasDigitalFile(
        makeBook({
          primaryFile: {id: 10, bookId: 1, book: true, folderBased: false, bookType: 'AUDIOBOOK'},
          alternativeFormats: [{id: 11, bookId: 1, book: true, folderBased: false, bookType: 'EPUB'}],
        }),
      ),
    ).toBe(true);
  });
});

describe('READ_STATUS_TARGETS', () => {
  it('lists the read statuses without the Unset sentinel', () => {
    const labels = READ_STATUS_TARGETS.map(status => READ_STATUS_TARGET_LABELS[status]);
    expect(labels).toContain('Read');
    expect(labels).toContain('Reading');
    expect(labels).not.toContain('Unset');
    expect(READ_STATUS_TARGETS).not.toContain('UNSET');
  });
});
