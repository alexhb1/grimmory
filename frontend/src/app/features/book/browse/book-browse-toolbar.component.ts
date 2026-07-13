import {ChangeDetectionStrategy, Component, booleanAttribute, computed, inject, input, output} from '@angular/core';
import {TranslocoPipe} from '@jsverse/transloco';
import {
  LucideArrowDown10,
  LucideArrowDownNarrowWide,
  LucideArrowDownZA,
  LucideArrowUp01,
  LucideArrowUpNarrowWide,
  LucideArrowUpAZ,
  LucideCalendarArrowDown,
  LucideCalendarArrowUp,
  LucideClockArrowDown,
  LucideClockArrowUp,
  LucideDynamicIcon,
  LucideEllipsis,
  LucideFunnel,
  LucideLayoutGrid,
  LucideMinus,
  LucidePlus,
  LucideTableProperties,
  type LucideIconData,
} from '@lucide/angular';

import {type GridDensityDirection} from '../../../shared/components/grid-density-buttons/grid-density-buttons.component';
import {AppButtonComponent} from '../../../shared/ui/button/app-button.component';
import {connectedGroupClass, connectedItemClass} from '../../../shared/ui/connected-group';
import {AppRadioGroupComponent} from '../../../shared/ui/radio-group/app-radio-group.component';
import {AppMenuComponent} from '../../../shared/ui/menu/app-menu.component';
import {AppMenuCheckboxComponent} from '../../../shared/ui/menu/app-menu-checkbox.component';
import {AppMenuItemComponent} from '../../../shared/ui/menu/app-menu-item.component';
import {AppMenuRadioComponent} from '../../../shared/ui/menu/app-menu-radio.component';
import {AppMenuRadioGroupComponent} from '../../../shared/ui/menu/app-menu-radio-group.component';
import {AppMenuSectionComponent} from '../../../shared/ui/menu/app-menu-section.component';
import {AppMenuSeparatorComponent} from '../../../shared/ui/menu/app-menu-separator.component';
import {AppMenuTriggerForDirective} from '../../../shared/ui/menu/app-menu-trigger.directive';
import {
  type BookSortOption,
  type BookSortSelection,
} from './book-browse-sort.config';
import {type BookBrowseViewMode} from './book-browse.models';
import {AdvancedFilteringPreferenceService} from './advanced-filtering-preference.service';

export interface BookBrowseColumnOption {
  readonly field: string;
  readonly header: string;
  readonly visible: boolean;
}

export interface BookBrowseColumnVisibilityChange {
  readonly field: string;
  readonly visible: boolean;
}

type BookBrowseColumnGroupId = 'reading' | 'publishing' | 'file' | 'categorization' | 'ratings';

interface BookBrowseColumnGroup {
  readonly id: BookBrowseColumnGroupId;
  readonly fields: readonly string[];
}

interface BookBrowseColumnSection {
  readonly id: BookBrowseColumnGroupId;
  readonly columns: readonly BookBrowseColumnOption[];
}

const COLUMN_GROUPS: readonly BookBrowseColumnGroup[] = [
  {id: 'reading', fields: ['readStatus', 'lastReadTime', 'addedOn']},
  {
    id: 'publishing',
    fields: [
      'title',
      'authors',
      'publisher',
      'seriesName',
      'seriesNumber',
      'publishedDate',
      'language',
      'isbn',
      'pageCount',
    ],
  },
  {id: 'file', fields: ['fileName', 'fileSizeKb']},
  {id: 'categorization', fields: ['categories']},
  {
    id: 'ratings',
    fields: [
      'amazonRating',
      'amazonReviewCount',
      'goodreadsRating',
      'goodreadsReviewCount',
      'hardcoverRating',
      'hardcoverReviewCount',
      'ranobedbRating',
    ],
  },
];

const ALPHABETICAL_SORT_FIELDS = new Set<BookSortOption['id']>([
  'title',
  'seriesName',
  'publisher',
  'narrator',
  'language',
  'readStatus',
]);
const NUMERIC_SORT_FIELDS = new Set<BookSortOption['id']>([
  'seriesNumber',
  'amazonRating',
  'amazonReviewCount',
  'goodreadsRating',
  'goodreadsReviewCount',
  'hardcoverRating',
  'hardcoverReviewCount',
  'ranobedbRating',
  'pageCount',
  'personalRating',
  'readingProgress',
]);
const CALENDAR_SORT_FIELDS = new Set<BookSortOption['id']>([
  'addedOn',
  'publishedDate',
  'dateFinished',
]);

function sortDirectionIcon(selection: BookSortSelection): LucideIconData {
  const ascending = selection.direction === 'asc';
  const field = selection.option.id;

  if (ALPHABETICAL_SORT_FIELDS.has(field)) {
    return ascending ? LucideArrowUpAZ.icon : LucideArrowDownZA.icon;
  }
  if (NUMERIC_SORT_FIELDS.has(field)) {
    return ascending ? LucideArrowUp01.icon : LucideArrowDown10.icon;
  }
  if (CALENDAR_SORT_FIELDS.has(field)) {
    return ascending ? LucideCalendarArrowUp.icon : LucideCalendarArrowDown.icon;
  }
  if (field === 'lastReadTime') {
    return ascending ? LucideClockArrowUp.icon : LucideClockArrowDown.icon;
  }
  return ascending ? LucideArrowUpNarrowWide.icon : LucideArrowDownNarrowWide.icon;
}

@Component({
  selector: 'app-book-browse-toolbar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    TranslocoPipe,
    AppButtonComponent,
    AppRadioGroupComponent,
    AppMenuComponent,
    AppMenuCheckboxComponent,
    AppMenuItemComponent,
    AppMenuRadioComponent,
    AppMenuRadioGroupComponent,
    AppMenuSectionComponent,
    AppMenuSeparatorComponent,
    AppMenuTriggerForDirective,
    LucideDynamicIcon,
    LucideEllipsis,
    LucideFunnel,
    LucideMinus,
    LucidePlus,
  ],
  host: {class: 'contents'},
  template: `
    @if (mobileSelectMode()) {
      <span role="status" class="px-1 text-sm font-semibold tabular-nums text-text">
        {{ 'shared.ui.select.selectedCount' | transloco: {count: selectionCountLabel()} }}
      </span>
      @if (showSelectAll()) {
        <app-button
          class="ml-auto"
          variant="soft"
          [label]="'shared.ui.bulkActions.selectAll' | transloco"
          (clicked)="selectAllRequested.emit()" />
      }
      <app-button
        [class]="showSelectAll() ? '' : 'ml-auto'"
        variant="soft"
        [label]="'browse.toolbar.cancel' | transloco"
        (clicked)="mobileSelectToggle.emit()" />
    } @else {
    <app-radio-group
      class="hidden sm:block"
      variant="segmented"
      size="md"
      [ariaLabel]="'browse.toolbar.viewMode' | transloco"
      [options]="[
        {value: 'grid', label: ('browse.toolbar.grid' | transloco), icon: gridIcon},
        {value: 'table', label: ('browse.toolbar.table' | transloco), icon: tableIcon}
      ]"
      [value]="viewMode()"
      (valueChange)="onViewModeValue($event)" />

    <span
      role="group"
      [class]="sortGroupClass"
      [attr.aria-label]="'browse.toolbar.sort' | transloco">
      <app-button
        variant="soft"
        [styleClass]="sortFieldButtonClass"
        [label]="activeSort().option.labelKey
          ? (activeSort().option.labelKey! | transloco)
          : activeSort().option.fallbackLabel"
        [ariaLabel]="'browse.toolbar.sortAria' | transloco: {
          field: activeSort().option.labelKey
            ? (activeSort().option.labelKey! | transloco)
            : activeSort().option.fallbackLabel
        }"
        [appMenuTriggerFor]="sortMenu" />
      <app-button
        variant="soft"
        iconOnly
        [styleClass]="sortDirectionButtonClass"
        [ariaLabel]="(activeSort().direction === 'asc' ? 'browse.toolbar.sortDescending' : 'browse.toolbar.sortAscending') | transloco"
        [title]="(activeSort().direction === 'asc' ? 'browse.toolbar.sortDescending' : 'browse.toolbar.sortAscending') | transloco"
        (clicked)="toggleSortDirection()">
        <svg [lucideIcon]="activeSortIcon()" aria-hidden="true"></svg>
      </app-button>
    </span>
    <app-menu #sortMenu [ariaLabel]="'browse.toolbar.sort' | transloco">
      @for (option of commonOptions(); track option.id) {
        <app-menu-item [icon]="directionIconFor(option)" inset (selected)="onSelect(option)">
          @if (option.labelKey; as labelKey) {
            {{ labelKey | transloco }}
          } @else {
            {{ option.fallbackLabel }}
          }
        </app-menu-item>
      }
      @if (moreOptions().length > 0) {
        <app-menu-separator />
        @for (option of moreOptions(); track option.id) {
          <app-menu-item [icon]="directionIconFor(option)" inset (selected)="onSelect(option)">
            @if (option.labelKey; as labelKey) {
              {{ labelKey | transloco }}
            } @else {
              {{ option.fallbackLabel }}
            }
          </app-menu-item>
        }
      }
    </app-menu>

    <app-button
      variant="soft"
      [label]="'browse.toolbar.filter' | transloco"
      [ariaExpanded]="filtersOpen()"
      (clicked)="filtersToggle.emit()">
      <svg
        lucideFunnel
        [attr.fill]="filtersOpen() ? 'currentColor' : 'none'"
        aria-hidden="true"></svg>
    </app-button>

    <app-button
      class="sm:hidden"
      variant="soft"
      [label]="'browse.toolbar.select' | transloco"
      (clicked)="mobileSelectToggle.emit()" />

    <app-button
      class="ml-auto sm:ml-0"
      variant="ghost"
      iconOnly
      [ariaLabel]="'browse.toolbar.more' | transloco"
      [appMenuTriggerFor]="moreMenu">
      <svg lucideEllipsis aria-hidden="true"></svg>
    </app-button>
    <app-menu #moreMenu [ariaLabel]="'browse.toolbar.more' | transloco">
      <div class="contents sm:hidden">
        <app-menu-section>{{ 'browse.toolbar.viewMode' | transloco }}</app-menu-section>
        <app-menu-radio-group [value]="viewMode()" (valueSelected)="selectView($event)">
          <app-menu-radio value="grid">{{ 'browse.toolbar.grid' | transloco }}</app-menu-radio>
          <app-menu-radio value="table">{{ 'browse.toolbar.table' | transloco }}</app-menu-radio>
        </app-menu-radio-group>
        <app-menu-separator />
      </div>
      @if (viewMode() === 'grid') {
        <div class="flex min-h-7 w-full select-none items-center gap-2 py-1 pl-2 pr-0 text-sm leading-5 text-text pointer-coarse:min-h-11 pointer-coarse:pl-3">
          <span class="min-w-0 flex-1 truncate">{{ 'browse.toolbar.density' | transloco }}</span>
          <span class="flex items-center gap-0.5 self-stretch">
            <button type="button" [class]="stepperClass" [disabled]="densitySmallerDisabled()"
              [attr.aria-label]="'browse.toolbar.smallerCards' | transloco"
              (click)="densityChange.emit('smaller')">
              <svg lucideMinus aria-hidden="true"></svg>
            </button>
            <button type="button" [class]="stepperClass" [disabled]="densityLargerDisabled()"
              [attr.aria-label]="'browse.toolbar.largerCards' | transloco"
              (click)="densityChange.emit('larger')">
              <svg lucidePlus aria-hidden="true"></svg>
            </button>
          </span>
        </div>
        <app-menu-checkbox [checked]="seriesCollapsed()" (selected)="seriesCollapsedChange.emit($event)">
          {{ 'browse.toolbar.collapseSeries' | transloco }}
        </app-menu-checkbox>
      } @else {
        <app-menu-item [submenu]="columnsMenu">{{ 'browse.toolbar.columns' | transloco }}</app-menu-item>
      }
      <app-menu-separator />
      <app-menu-checkbox
        [checked]="advancedFiltering.enabled()"
        (selected)="advancedFiltering.setEnabled($event)">
        {{ 'browse.toolbar.advancedFiltering' | transloco }}
      </app-menu-checkbox>
    </app-menu>

    <app-menu
      #columnsMenu="ngMenu"
      menuClass="w-[34rem] max-w-[calc(100vw-1rem)]"
      [ariaLabel]="'browse.toolbar.columns' | transloco">
      <div class="columns-1 gap-3 min-[600px]:max-h-[min(32rem,calc(100vh-2rem))] min-[600px]:overflow-y-auto sm:columns-2">
        @for (section of columnSections(); track section.id) {
          <div class="min-w-0 break-inside-avoid">
            <app-menu-section>{{ 'browse.toolbar.columnGroups.' + section.id | transloco }}</app-menu-section>
            @for (column of section.columns; track column.field) {
              <app-menu-checkbox
                [checked]="column.field === 'title' || column.visible"
                [disabled]="column.field === 'title'"
                [closeOnSelect]="false"
                (selected)="setColumnVisibility(column.field, $event)">
                {{ column.header }}
              </app-menu-checkbox>
            }
          </div>
        }
      </div>
    </app-menu>
    }
  `,
})
export class BookBrowseToolbarComponent {
  protected readonly advancedFiltering = inject(AdvancedFilteringPreferenceService);
  readonly activeSort = input.required<BookSortSelection>();
  readonly sortOptions = input.required<readonly BookSortOption[]>();
  readonly viewMode = input<BookBrowseViewMode>('grid');
  readonly columnOptions = input<readonly BookBrowseColumnOption[]>([]);
  readonly densitySmallerDisabled = input(false, {transform: booleanAttribute});
  readonly densityLargerDisabled = input(false, {transform: booleanAttribute});
  readonly seriesCollapsed = input(false, {transform: booleanAttribute});
  readonly filtersOpen = input(false, {transform: booleanAttribute});
  readonly mobileSelectMode = input(false, {transform: booleanAttribute});
  readonly selectionCount = input(0);
  readonly selectionTotal = input<number | null>(null);

  readonly sortChange = output<BookSortSelection>();
  readonly viewModeChange = output<BookBrowseViewMode>();
  readonly columnVisibilityChange = output<BookBrowseColumnVisibilityChange>();
  readonly densityChange = output<GridDensityDirection>();
  readonly seriesCollapsedChange = output<boolean>();
  readonly filtersToggle = output<void>();
  readonly mobileSelectToggle = output<void>();
  readonly selectAllRequested = output<void>();

  protected readonly stepperClass =
    'flex h-full min-h-7 w-10 items-center justify-center rounded-sm text-text-muted ' +
    'hover:bg-surface-hover hover:text-text disabled:pointer-events-none disabled:opacity-40 ' +
    'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary ' +
    'pointer-coarse:min-h-11 pointer-coarse:w-12 [&>svg]:size-4';
  protected readonly sortGroupClass = connectedGroupClass;
  protected readonly sortFieldButtonClass = connectedItemClass({first: true, last: false});
  protected readonly sortDirectionButtonClass = connectedItemClass({first: false, last: true});

  protected readonly commonOptions = computed(() =>
    this.sortOptions().filter(option => option.group === 'common'));
  protected readonly moreOptions = computed(() =>
    this.sortOptions().filter(option => option.group === 'more'));

  protected readonly gridIcon: LucideIconData = LucideLayoutGrid.icon;
  protected readonly tableIcon: LucideIconData = LucideTableProperties.icon;

  protected readonly activeId = computed(() => this.activeSort().option.id);
  protected readonly activeSortIcon = computed(() => sortDirectionIcon(this.activeSort()));
  protected readonly selectionCountLabel = computed(() => this.selectionCount().toLocaleString());
  protected readonly showSelectAll = computed(() => {
    const total = this.selectionTotal();
    return total !== null && this.selectionCount() < total;
  });
  protected readonly columnSections = computed<readonly BookBrowseColumnSection[]>(() => {
    const columnsByField = new Map(this.columnOptions().map(column => [column.field, column]));
    return COLUMN_GROUPS
      .map(group => ({
        id: group.id,
        columns: group.fields.flatMap(field => {
          const column = columnsByField.get(field);
          return column ? [column] : [];
        }),
      }))
      .filter(section => section.columns.length > 0);
  });

  protected selectView(viewMode: BookBrowseViewMode): void {
    if (viewMode !== this.viewMode()) {
      this.viewModeChange.emit(viewMode);
    }
  }

  protected onViewModeValue(viewMode: string | null): void {
    if (viewMode === 'grid' || viewMode === 'table') this.selectView(viewMode);
  }

  protected setColumnVisibility(field: string, visible: boolean): void {
    if (field !== 'title') {
      this.columnVisibilityChange.emit({field, visible});
    }
  }

  protected directionIconFor(option: BookSortOption): LucideIconData | undefined {
    if (option.id !== this.activeId()) {
      return undefined;
    }
    return this.activeSortIcon();
  }

  protected onSelect(option: BookSortOption): void {
    const active = this.activeSort();
    if (option.id === active.option.id) {
      this.sortChange.emit({option, direction: active.direction === 'asc' ? 'desc' : 'asc'});
    } else {
      this.sortChange.emit({option, direction: option.defaultDirection});
    }
  }

  protected toggleSortDirection(): void {
    const active = this.activeSort();
    this.sortChange.emit({
      option: active.option,
      direction: active.direction === 'asc' ? 'desc' : 'asc',
    });
  }
}
