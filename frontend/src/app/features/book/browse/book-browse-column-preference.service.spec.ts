import {TestBed} from '@angular/core/testing';
import {beforeEach, describe, expect, it, vi} from 'vitest';

import {getTranslocoModule} from '../../../core/testing/transloco-testing';
import {UserService} from '../../settings/user-management/user.service';
import {BookBrowseColumnPreferenceService} from './book-browse-column-preference.service';

describe('BookBrowseColumnPreferenceService', () => {
  const updateUserSetting = vi.fn();

  beforeEach(() => {
    updateUserSetting.mockReset();
    TestBed.configureTestingModule({
      imports: [getTranslocoModule()],
      providers: [
        BookBrowseColumnPreferenceService,
        {
          provide: UserService,
          useValue: {
            getCurrentUser: () => ({id: 7}),
            updateUserSetting,
          },
        },
      ],
    });
  });

  it('uses the curated table defaults and keeps title structural', () => {
    const service = TestBed.inject(BookBrowseColumnPreferenceService);
    service.initialize(undefined);

    expect(service.visibleColumns.map(column => column.field)).toEqual([
      'title', 'authors', 'seriesName', 'seriesNumber',
      'publishedDate', 'pageCount', 'language', 'readStatus',
    ]);

    service.setVisibility('title', false);
    expect(service.visibleColumns[0]?.field).toBe('title');
    expect(updateUserSetting).not.toHaveBeenCalled();
  });

  it('persists a visibility change using the existing user setting', () => {
    const service = TestBed.inject(BookBrowseColumnPreferenceService);
    service.initialize(undefined);
    service.setVisibility('publisher', true);

    expect(service.visibleColumns.map(column => column.field)).toContain('publisher');
    expect(updateUserSetting).toHaveBeenCalledWith(
      7,
      'tableColumnPreference',
      expect.arrayContaining([expect.objectContaining({field: 'publisher', visible: true})]),
    );
  });
});
