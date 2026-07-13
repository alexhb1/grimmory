import {TestBed} from '@angular/core/testing';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {BookBrowseColumnWidthPreferenceService} from './book-browse-column-width-preference.service';

const STORAGE_KEY = 'browseTableColumnWidths';

describe('BookBrowseColumnWidthPreferenceService', () => {
  let service: BookBrowseColumnWidthPreferenceService;

  beforeEach(() => {
    localStorage.removeItem(STORAGE_KEY);
    service = TestBed.inject(BookBrowseColumnWidthPreferenceService);
  });

  afterEach(() => {
    localStorage.removeItem(STORAGE_KEY);
  });

  it('round-trips saved widths', () => {
    service.save({title: 400, authors: 260});
    expect(service.load()).toEqual({title: 400, authors: 260});
  });

  it('returns no widths when nothing is stored', () => {
    expect(service.load()).toEqual({});
  });

  it('drops malformed entries instead of feeding them to the table', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({title: 400, authors: 'wide', pageCount: -5, isbn: null}),
    );
    expect(service.load()).toEqual({title: 400});
  });

  it('ignores a corrupted non-object payload', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([420]));
    expect(service.load()).toEqual({});
  });
});
