import { describe, expect, it } from 'vitest';

import { ReadStatus } from '../../../book/model/book.model';
import { calculateBookFormatStats } from './book-format-stats';

type BookFormatBook = Parameters<typeof calculateBookFormatStats>[0][number];

describe('calculateBookFormatStats', () => {
  it('reports physical books as a format instead of unknown', () => {
    const physical: BookFormatBook = {
      id: 1,
      libraryId: 1,
      libraryName: 'Library',
      readStatus: ReadStatus.UNREAD,
      isPhysical: true,
    };

    expect(calculateBookFormatStats([physical]).formats).toEqual([
      { format: 'PHYSICAL', bookCount: 1 },
    ]);
  });

  it('represents a missing format without inventing a format identifier', () => {
    const missing: BookFormatBook = {
      id: 1,
      libraryId: 1,
      libraryName: 'Library',
      readStatus: ReadStatus.UNREAD,
    };

    expect(calculateBookFormatStats([missing]).formats).toEqual([
      { format: null, bookCount: 1 },
    ]);
  });
});
