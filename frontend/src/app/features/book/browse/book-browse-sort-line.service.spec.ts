import {TestBed} from '@angular/core/testing';
import {TranslocoService} from '@jsverse/transloco';
import {firstValueFrom} from 'rxjs';
import {beforeEach, describe, expect, it} from 'vitest';

import {getTranslocoModule} from '../../../core/testing/transloco-testing';
import {type BookSummary} from '../data/book-response.models';
import {bookBrowseSortLineAvailable} from './book-browse-fields';
import {BookBrowseSortLineService} from './book-browse-sort-line.service';

function book(overrides: Partial<BookSummary> = {}): BookSummary {
  return {id: 1, libraryId: 1, libraryName: 'Library', ...overrides};
}

describe('bookBrowseSortLineAvailable', () => {
  it('skips the keys the card already shows at rest', () => {
    expect(bookBrowseSortLineAvailable('title')).toBe(false);
    expect(bookBrowseSortLineAvailable('seriesNumber')).toBe(false);
  });

  it('offers a line for configured formatter keys', () => {
    expect(bookBrowseSortLineAvailable('addedOn')).toBe(true);
    expect(bookBrowseSortLineAvailable('readStatus')).toBe(true);
    expect(bookBrowseSortLineAvailable('goodreadsRating')).toBe(true);
  });

});

describe('BookBrowseSortLineService', () => {
  let service: BookBrowseSortLineService;

  beforeEach(async () => {
    TestBed.configureTestingModule({imports: [getTranslocoModule()]});
    service = TestBed.inject(BookBrowseSortLineService);
    await firstValueFrom(TestBed.inject(TranslocoService).load('en'));
  });

  it('formats date keys as medium dates', () => {
    const value = service.lineFor('addedOn', book({addedOn: '2026-03-05T10:00:00Z'}));
    expect(value).toContain('Mar');
    expect(value).toContain('2026');
    expect(service.lineFor('lastReadTime', book({lastReadTime: '2025-12-31T23:00:00Z'})))
      .toMatch(/2025|2026/);
    expect(service.lineFor('publishedDate', book({
      metadata: {bookId: 1, publishedDate: '1859-01-01', allMetadataLocked: false},
    }))).toContain('1859');
  });

  it('passes text keys through', () => {
    const value = service.lineFor('publisher', book({
      metadata: {bookId: 1, publisher: 'Chapman & Hall', allMetadataLocked: false},
    }));
    expect(value).toBe('Chapman & Hall');
  });

  it('renders ratings with one decimal and counts as plain numbers', () => {
    const rated = book({
      personalRating: 4,
      metadata: {bookId: 1, goodreadsRating: 4.25, goodreadsReviewCount: 12345, allMetadataLocked: false},
    });
    expect(service.lineFor('personalRating', rated)).toBe('4.0');
    expect(service.lineFor('goodreadsRating', rated)).toBe('4.3');
    expect(service.lineFor('goodreadsReviewCount', rated)).toBe(new Intl.NumberFormat().format(12345));
  });

  it('renders reading progress from the first available source, as the card bar does', () => {
    const reading = book({
      epubProgress: {cfi: null, href: null, contentSourceProgressPercent: null, percentage: 33.6, ttsPositionCfi: null},
      koboProgress: {percentage: 90},
    });
    expect(service.lineFor('readingProgress', reading)).toBe('34%');
    expect(service.lineFor('readingProgress', book({koboProgress: {percentage: 90}}))).toBe('90%');
  });

  it('translates read status through the table vocabulary', () => {
    expect(service.lineFor('readStatus', book({readStatus: 'RE_READING'}))).toBe('Re-reading');
    expect(service.lineFor('readStatus', book({readStatus: 'UNSET'}))).toBe('—');
  });

  it('renders every absent value as the muted dash', () => {
    const bare = book();
    expect(service.lineFor('addedOn', bare)).toBe('—');
    expect(service.lineFor('publisher', bare)).toBe('—');
    expect(service.lineFor('pageCount', bare)).toBe('—');
    expect(service.lineFor('goodreadsRating', bare)).toBe('—');
    expect(service.lineFor('readingProgress', bare)).toBe('—');
    expect(service.lineFor('readStatus', bare)).toBe('—');
  });
});
