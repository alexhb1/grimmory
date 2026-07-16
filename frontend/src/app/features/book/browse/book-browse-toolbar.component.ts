import {ChangeDetectionStrategy, Component, booleanAttribute, computed, inject, input, output, signal} from '@angular/core';
import {TranslocoPipe} from '@jsverse/transloco';
import {
  LucideChevronDown,
  LucideChevronUp,
  LucideDynamicIcon,
  LucideEllipsis,
  LucideFunnel,
  LucideLayoutGrid,
  LucideListOrdered,
  LucideMinus,
  LucidePencil,
  LucidePlus,
  LucideTableProperties,
  LucideTrash2,
  type LucideIconData,
} from '@lucide/angular';

import {type GridDensityDirection} from '../../../shared/components/grid-density-buttons/grid-density-buttons.component';
import {type BookSortTerm} from '../data/book-query-params';
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
  sortDirectionIcon,
  type BookSortOption,
  type BookSortSelection,
} from './book-browse-sort.config';
import {type BookBrowseViewMode} from './book-browse.models';
import {
  LibraryShelfMenuService,
  type LibraryShelfMenuType,
} from '../service/library-shelf-menu.service';

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
    LucidePencil,
    LucidePlus,
    LucideTrash2,
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
        [label]="'common.cancel' | transloco"
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
        [label]="(activeSort().option.labelKey
          ? (activeSort().option.labelKey! | transloco)
          : activeSort().option.fallbackLabel) + multiSortSuffix()"
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
        [disabled]="!activeSortCanToggle()"
        [ariaLabel]="(activeSort().direction === 'asc' ? 'browse.toolbar.sortDescending' : 'browse.toolbar.sortAscending') | transloco"
        [title]="(activeSort().direction === 'asc' ? 'browse.toolbar.sortDescending' : 'browse.toolbar.sortAscending') | transloco"
        (clicked)="toggleSortDirection()">
        <svg [lucideIcon]="activeSortIcon()" aria-hidden="true"></svg>
      </app-button>
    </span>
    <app-menu #sortMenu menuClass="w-60" [ariaLabel]="'browse.toolbar.sort' | transloco" (opened)="onSortMenuOpened()">
      @for (option of commonOptions(); track option.id) {
        <app-menu-item
          [icon]="directionIconFor(option)"
          [badge]="sortRankFor(option)"
          inset
          (selected)="onSelect(option)">
          @if (option.labelKey; as labelKey) {
            {{ labelKey | transloco }}
          } @else {
            {{ option.fallbackLabel }}
          }
        </app-menu-item>
      }
      @if (moreOptions().length > 0) {
        @if (moreSortsExpanded()) {
          <div class="grid grid-rows-[1fr] transition-[grid-template-rows] duration-200 ease-out starting:grid-rows-[0fr] motion-reduce:transition-none">
            <div class="min-h-0 overflow-hidden">
              @for (option of moreOptions(); track option.id) {
                <app-menu-item
                  [icon]="directionIconFor(option)"
                  [badge]="sortRankFor(option)"
                  inset
                  (selected)="onSelect(option)">
                  @if (option.labelKey; as labelKey) {
                    {{ labelKey | transloco }}
                  } @else {
                    {{ option.fallbackLabel }}
                  }
                </app-menu-item>
              }
            </div>
          </div>
        }
        <app-menu-item [icon]="moreSortsToggleIcon()" [closeOnSelect]="false" (selected)="moreSortsExpanded.set(!moreSortsExpanded())">
          <span class="text-text-muted">
            {{ (moreSortsExpanded() ? 'browse.sort.showFewer' : 'browse.sort.showAll') | transloco }}
          </span>
        </app-menu-item>
      }
      @if (sortOptions().length > 0) {
        <app-menu-separator />
        <app-menu-item
          [class]="multiSortActive() ? 'bg-active-surface text-primary! [&_svg]:text-primary!' : ''"
          [icon]="multiSortIcon"
          [shortcut]="multiSortShortcut()"
          (selected)="multiSortRequested.emit()">
          {{ 'browse.sort.multiSort' | transloco }}
        </app-menu-item>
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
      [label]="'common.select' | transloco"
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
      <app-menu-section>{{ 'browse.toolbar.viewMode' | transloco }}</app-menu-section>
      <div class="contents sm:hidden">
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
          {{ 'book.browser.labels.collapseSeries' | transloco }}
        </app-menu-checkbox>
      } @else {
        <app-menu-item [submenu]="columnsMenu">{{ 'browse.toolbar.columns' | transloco }}</app-menu-item>
      }
      @if (actionType() !== null && actionId() !== null) {
        <app-menu-separator />
        @switch (actionType()) {
          @case ('library') {
            <app-menu-section>{{ 'settingsView.librarySort.entityLibrary' | transloco }}</app-menu-section>
            <app-menu-item (selected)="menuService.addPhysicalBook(actionId()!)">
              {{ 'book.shelfMenuService.library.addPhysicalBook' | transloco }}
            </app-menu-item>
            <app-menu-item (selected)="menuService.importIsbns(actionId()!)">
              {{ 'book.shelfMenuService.library.bulkIsbnImport' | transloco }}
            </app-menu-item>
            <app-menu-separator />
            <app-menu-item (selected)="menuService.editLibrary(actionId()!)">
              <svg lucidePencil class="mr-1.5 inline size-4 shrink-0 align-[-0.125em] text-text-muted" aria-hidden="true"></svg>
              {{ 'book.shelfMenuService.library.editLibrary' | transloco }}
            </app-menu-item>
            <app-menu-item (selected)="menuService.rescanLibrary(actionId()!)">
              {{ 'book.shelfMenuService.library.rescanLibrary' | transloco }}
            </app-menu-item>
            <app-menu-item (selected)="menuService.customFetchLibraryMetadata(actionId()!)">
              {{ 'book.shelfMenuService.library.customFetchMetadata' | transloco }}
            </app-menu-item>
            <app-menu-item (selected)="menuService.autoFetchLibraryMetadata(actionId()!)">
              {{ 'book.shelfMenuService.library.autoFetchMetadata' | transloco }}
            </app-menu-item>
            <app-menu-item (selected)="menuService.findLibraryDuplicates(actionId()!)">
              {{ 'book.shelfMenuService.library.findDuplicates' | transloco }}
            </app-menu-item>
            <app-menu-separator />
            <app-menu-item
              variant="destructive"
              (selected)="menuService.deleteLibrary(actionId()!)">
              <svg lucideTrash2 class="mr-1.5 inline size-4 shrink-0 align-[-0.125em] text-text-muted" aria-hidden="true"></svg>
              {{ 'book.shelfMenuService.library.deleteLibrary' | transloco }}
            </app-menu-item>
          }
          @case ('shelf') {
            <app-menu-section>{{ 'settingsView.librarySort.entityShelf' | transloco }}</app-menu-section>
            <app-menu-item
              [disabled]="!menuService.canManageShelf(actionId()!)"
              (selected)="menuService.editShelf(actionId()!)">
              <svg lucidePencil class="mr-1.5 inline size-4 shrink-0 align-[-0.125em] text-text-muted" aria-hidden="true"></svg>
              {{ 'book.shelfMenuService.shelf.editShelf' | transloco }}
            </app-menu-item>
            <app-menu-separator />
            <app-menu-item
              [disabled]="!menuService.canManageShelf(actionId()!)"
              variant="destructive"
              (selected)="menuService.deleteShelf(actionId()!)">
              <svg lucideTrash2 class="mr-1.5 inline size-4 shrink-0 align-[-0.125em] text-text-muted" aria-hidden="true"></svg>
              {{ 'book.shelfMenuService.shelf.deleteShelf' | transloco }}
            </app-menu-item>
          }
          @case ('magicShelf') {
            <app-menu-section>{{ 'settingsView.librarySort.entityMagicShelf' | transloco }}</app-menu-section>
            <app-menu-item
              [disabled]="!menuService.canManageMagicShelf(actionId()!)"
              (selected)="menuService.editMagicShelf(actionId()!)">
              <svg lucidePencil class="mr-1.5 inline size-4 shrink-0 align-[-0.125em] text-text-muted" aria-hidden="true"></svg>
              {{ 'book.shelfMenuService.magicShelf.editMagicShelf' | transloco }}
            </app-menu-item>
            <app-menu-item (selected)="menuService.copyMagicShelfJson(actionId()!)">
              {{ 'book.shelfMenuService.magicShelf.exportJson' | transloco }}
            </app-menu-item>
            <app-menu-separator />
            <app-menu-item
              [disabled]="!menuService.canManageMagicShelf(actionId()!)"
              variant="destructive"
              (selected)="menuService.deleteMagicShelf(actionId()!)">
              <svg lucideTrash2 class="mr-1.5 inline size-4 shrink-0 align-[-0.125em] text-text-muted" aria-hidden="true"></svg>
              {{ 'book.shelfMenuService.magicShelf.deleteMagicShelf' | transloco }}
            </app-menu-item>
          }
        }
      }
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
  protected readonly menuService = inject(LibraryShelfMenuService);

  readonly activeSort = input.required<BookSortSelection>();
  readonly sortOptions = input.required<readonly BookSortOption[]>();
  readonly sortTerms = input<readonly BookSortTerm[]>([]);
  readonly viewMode = input<BookBrowseViewMode>('grid');
  readonly columnOptions = input<readonly BookBrowseColumnOption[]>([]);
  readonly densitySmallerDisabled = input(false, {transform: booleanAttribute});
  readonly densityLargerDisabled = input(false, {transform: booleanAttribute});
  readonly seriesCollapsed = input(false, {transform: booleanAttribute});
  readonly filtersOpen = input(false, {transform: booleanAttribute});
  readonly mobileSelectMode = input(false, {transform: booleanAttribute});
  readonly selectionCount = input(0);
  readonly selectionTotal = input<number | null>(null);
  readonly actionType = input<LibraryShelfMenuType | null>(null);
  readonly actionId = input<number | null>(null);

  readonly sortChange = output<BookSortSelection>();
  readonly sortDirectionChange = output<BookSortSelection>();
  readonly multiSortRequested = output<void>();
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
  protected readonly multiSortSuffix = computed(() => {
    const extra = this.sortTerms().length - 1;
    return extra > 0 ? ` +${extra}` : '';
  });
  protected readonly multiSortActive = computed(() => this.sortTerms().length > 1);
  protected readonly multiSortShortcut = computed(() => {
    const extra = this.sortTerms().length - 1;
    return extra > 0 ? `+${extra}` : '';
  });
  protected readonly moreSortsExpanded = signal(false);
  protected readonly moreSortsToggleIcon = computed<LucideIconData>(() =>
    this.moreSortsExpanded() ? LucideChevronUp.icon : LucideChevronDown.icon);

  protected onSortMenuOpened(): void {
    this.moreSortsExpanded.set(this.moreOptions().some(option => option.id === this.activeId()));
  }

  protected readonly gridIcon: LucideIconData = LucideLayoutGrid.icon;
  protected readonly tableIcon: LucideIconData = LucideTableProperties.icon;
  protected readonly multiSortIcon: LucideIconData = LucideListOrdered.icon;

  protected readonly activeId = computed(() => this.activeSort().option.id);
  protected readonly activeSortCanToggle = computed(() =>
    this.sortOptions().length === 0 || this.activeSort().option.directions.length > 1);
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

  protected sortRankFor(option: BookSortOption): string {
    if (!this.multiSortActive()) {
      return '';
    }
    const index = this.sortTerms().findIndex(term => term.key === option.id);
    return index === -1 ? '' : `${index + 1}`;
  }

  protected directionIconFor(option: BookSortOption): LucideIconData | undefined {
    if (this.multiSortActive() || option.id !== this.activeId()) {
      return undefined;
    }
    return this.activeSortIcon();
  }

  protected onSelect(option: BookSortOption): void {
    const active = this.activeSort();
    if (!this.multiSortActive() && option.id === active.option.id) {
      const nextDirection = option.directions.find(direction => direction !== active.direction);
      this.sortChange.emit({option, direction: nextDirection ?? active.direction});
    } else {
      this.sortChange.emit({option, direction: option.defaultDirection});
    }
  }

  protected toggleSortDirection(): void {
    const active = this.activeSort();
    const nextDirection = active.option.directions.find(direction => direction !== active.direction);
    if (!nextDirection) {
      return;
    }
    this.sortDirectionChange.emit({
      option: active.option,
      direction: nextDirection,
    });
  }
}
