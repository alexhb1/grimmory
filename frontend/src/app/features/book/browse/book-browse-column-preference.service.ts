import {Injectable, inject, signal} from '@angular/core';
import {TranslocoService} from '@jsverse/transloco';

import {type TableColumnPreference, UserService} from '../../settings/user-management/user.service';

export interface BookBrowseColumn {
  field: string;
  header: string;
}

const FIELDS = [
  'readStatus', 'title', 'authors', 'publisher', 'seriesName', 'seriesNumber',
  'categories', 'publishedDate', 'lastReadTime', 'addedOn', 'fileName', 'fileSizeKb',
  'language', 'isbn', 'pageCount', 'amazonRating', 'amazonReviewCount',
  'goodreadsRating', 'goodreadsReviewCount', 'hardcoverRating', 'hardcoverReviewCount',
  'ranobedbRating',
] as const;

const DEFAULT_ORDER = [
  'title', 'authors', 'seriesName', 'seriesNumber', 'publishedDate',
  'pageCount', 'language', 'readStatus',
] as const;
const DEFAULT_VISIBLE_FIELDS = new Set<string>(DEFAULT_ORDER);

const DEFAULTS: TableColumnPreference[] = [
  ...DEFAULT_ORDER,
  ...FIELDS.filter(field => !DEFAULT_VISIBLE_FIELDS.has(field)),
].map((field, order) => ({field, visible: DEFAULT_VISIBLE_FIELDS.has(field), order}));

@Injectable({providedIn: 'root'})
export class BookBrowseColumnPreferenceService {
  private readonly users = inject(UserService);
  private readonly transloco = inject(TranslocoService);
  private readonly state = signal<TableColumnPreference[]>([]);

  readonly preferences = this.state.asReadonly();

  initialize(saved: TableColumnPreference[] | undefined): void {
    const savedByField = new Map((saved?.length ? saved : DEFAULTS).map(preference => [preference.field, preference]));
    this.state.set(FIELDS.map((field, fallbackOrder) => {
      const preference = savedByField.get(field);
      return {
        field,
        visible: field === 'title' || (preference?.visible ?? false),
        order: preference?.order ?? fallbackOrder,
      };
    }));
  }

  get allColumns(): BookBrowseColumn[] {
    return FIELDS.map(field => ({field, header: this.transloco.translate(`book.columnPref.columns.${field}`)}));
  }

  get visibleColumns(): BookBrowseColumn[] {
    return this.preferences()
      .filter(preference => preference.visible)
      .sort((first, second) => first.order - second.order)
      .map(preference => ({
        field: preference.field,
        header: this.transloco.translate(`book.columnPref.columns.${preference.field}`),
      }));
  }

  setVisibility(field: string, visible: boolean): void {
    if (!FIELDS.includes(field as typeof FIELDS[number]) || field === 'title') return;

    this.state.update(preferences => preferences.map(preference =>
      preference.field === field ? {...preference, visible} : preference,
    ));
    const user = this.users.getCurrentUser();
    if (user) {
      this.users.updateUserSetting(user.id, 'tableColumnPreference', this.preferences());
    }
  }
}
