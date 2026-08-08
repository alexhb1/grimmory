import {describe, expect, it} from 'vitest';

import {
  bookBrowseColumnOptions,
  bookBrowseVisibleColumnOptions,
  normalizeBookBrowseColumnPreferences,
} from './book-browse-fields';

describe('book browse table fields', () => {
  it('uses the table defaults and keeps title visible', () => {
    const preferences = normalizeBookBrowseColumnPreferences(undefined);

    expect(bookBrowseVisibleColumnOptions(preferences).map(column => column.field)).toEqual([
      'title',
      'authors',
      'seriesName',
      'seriesNumber',
      'publishedDate',
      'pageCount',
      'language',
      'readStatus',
    ]);

    const hiddenTitle = preferences.map(preference =>
      preference.field === 'title' ? {...preference, visible: false} : preference,
    );
    expect(bookBrowseColumnOptions(hiddenTitle).find(column => column.field === 'title')?.visible)
      .toBe(true);
  });

  it('drops unknown saved fields and fills missing fields from the central defaults', () => {
    const preferences = normalizeBookBrowseColumnPreferences([
      {field: 'publisher', visible: true, order: 0},
      {field: 'legacyScore', visible: true, order: 1},
    ]);

    expect(preferences.some(preference => preference.field === 'legacyScore')).toBe(false);
    expect(preferences.find(preference => preference.field === 'publisher')).toMatchObject({
      visible: true,
      order: 0,
    });
    expect(preferences.find(preference => preference.field === 'title')?.visible).toBe(true);
  });
});
