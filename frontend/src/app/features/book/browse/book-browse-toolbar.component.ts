import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
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
  LucidePlus,
  LucideTableProperties,
  type LucideIconData,
} from '@lucide/angular';

import {type GridDensityDirection} from '../../../shared/components/grid-density-buttons/grid-density-buttons.component';
import {SelectModeControlsComponent} from '../../../shared/components/bulk-actions/select-mode-controls.component';
import {type BookQuerySortKey, type BookSortTerm} from '../data/book-query-params';
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
import {AppMenuTriggerDirective} from '../../../shared/ui/menu/app-menu-trigger.directive';
import {
  BOOK_BROWSE_CARD_DETAIL_OPTIONS,
  bookBrowseColumnSections,
  sortDirectionIcon,
  type BookBrowseColumnOption,
  type BookBrowseColumnSection,
  type BookSortOption,
  type BookSortSelection,
} from './book-browse-fields';
import {type BookBrowseViewMode} from './book-browse.models';
import {
  canManageMagicShelfTarget,
  libraryShelfMenuAvailable,
  type LibraryShelfMenuTarget,
} from '../components/library-shelf-menu/library-shelf-menu.component';
import {LibraryShelfMenuService} from '../service/library-shelf-menu.service';
import {UserService} from '../../settings/user-management/user.service';

export interface BookBrowseColumnVisibilityChange {
  readonly field: string;
  readonly visible: boolean;
}

@Component({
  selector: 'app-book-browse-toolbar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    TranslocoPipe,
    AppButtonComponent,
    SelectModeControlsComponent,
    AppRadioGroupComponent,
    AppMenuComponent,
    AppMenuCheckboxComponent,
    AppMenuItemComponent,
    AppMenuRadioComponent,
    AppMenuRadioGroupComponent,
    AppMenuSectionComponent,
    AppMenuSeparatorComponent,
    AppMenuTriggerDirective,
    LucideDynamicIcon,
    LucideEllipsis,
    LucideFunnel,
    LucideMinus,
    LucidePlus,
  ],
  host: {class: 'contents'},
  template: `
    @if (mobileSelectMode()) {
      <app-select-mode-controls
        [count]="selectionCount()"
        [total]="selectionTotal()"
        (selectAll)="selectAllRequested.emit()"
        (cancelled)="mobileSelectToggle.emit()" />
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
        [label]="(activeSort().option.labelKey | transloco) + multiSortSuffix()"
        [ariaLabel]="'browse.toolbar.sortAria' | transloco: {
          field: activeSort().option.labelKey | transloco
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
          {{ option.labelKey | transloco }}
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
                  {{ option.labelKey | transloco }}
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
      @if (viewMode() === 'grid') {
        <div class="flex min-h-8 w-full select-none items-center gap-2 pl-2 pr-0 text-sm leading-5 text-text pointer-coarse:min-h-11 pointer-coarse:pl-3">
          <span class="min-w-0 flex-1 truncate">{{ 'browse.toolbar.density' | transloco }}</span>
          <span class="flex items-center gap-0.5">
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
        <app-menu-separator />
      }
      <div class="contents sm:hidden">
        <app-menu-radio-group [value]="viewMode()" (valueSelected)="selectView($event)">
          <app-menu-radio value="grid">{{ 'browse.toolbar.grid' | transloco }}</app-menu-radio>
          <app-menu-radio value="table">{{ 'browse.toolbar.table' | transloco }}</app-menu-radio>
        </app-menu-radio-group>
        <app-menu-separator />
      </div>
      @if (viewMode() === 'grid') {
        <app-menu-item [submenu]="cardDetailMenu">
          {{ 'browse.toolbar.cardDetail' | transloco }}
        </app-menu-item>
      } @else {
        <app-menu-item [submenu]="columnsMenu">{{ 'browse.toolbar.columns' | transloco }}</app-menu-item>
      }
      @if (actionTarget(); as target) {
        @if (actionAvailable()) {
          <app-menu-separator />
          @switch (target.type) {
            @case ('library') {
              <app-menu-item (selected)="actions.addPhysicalBook(target.entity.id)">
                {{ 'book.shelfMenuService.library.addPhysicalBook' | transloco }}
              </app-menu-item>
              <app-menu-item (selected)="actions.importIsbns(target.entity.id)">
                {{ 'book.shelfMenuService.library.bulkIsbnImport' | transloco }}
              </app-menu-item>
              <app-menu-item (selected)="actions.rescanLibrary(target.entity)">
                {{ 'book.shelfMenuService.library.rescanLibrary' | transloco }}
              </app-menu-item>
              <app-menu-separator />
              <app-menu-item [submenu]="manageLibraryMenu">
                {{ 'book.shelfMenuService.library.manageLibrary' | transloco }}
              </app-menu-item>

              <app-menu
                #manageLibraryMenu="ngMenu"
                [ariaLabel]="'book.shelfMenuService.library.manageLibrary' | transloco">
                <app-menu-item
                  (selected)="actions.editLibrary(target.entity.id)">
                  {{ 'book.shelfMenuService.library.editLibrary' | transloco }}
                </app-menu-item>
                <app-menu-item (selected)="actions.customFetchLibraryMetadata(target.entity.id)">
                  {{ 'book.shelfMenuService.library.customFetchMetadata' | transloco }}
                </app-menu-item>
                <app-menu-item (selected)="actions.autoFetchLibraryMetadata(target.entity.id)">
                  {{ 'book.shelfMenuService.library.autoFetchMetadata' | transloco }}
                </app-menu-item>
                <app-menu-item (selected)="actions.findLibraryDuplicates(target.entity.id)">
                  {{ 'book.shelfMenuService.library.findDuplicates' | transloco }}
                </app-menu-item>
                <app-menu-separator />
                <app-menu-item
                  variant="destructive"
                  (selected)="actions.deleteLibrary(target.entity)">
                  {{ 'book.shelfMenuService.library.deleteLibrary' | transloco }}
                </app-menu-item>
              </app-menu>
            }
            @case ('shelf') {
              <app-menu-item
                (selected)="actions.editShelf(target.entity.id)">
                {{ 'book.shelfMenuService.shelf.editShelf' | transloco }}
              </app-menu-item>
              <app-menu-separator />
              <app-menu-item
                variant="destructive"
                (selected)="actions.deleteShelf(target.entity)">
                {{ 'book.shelfMenuService.shelf.deleteShelf' | transloco }}
              </app-menu-item>
            }
            @case ('magicShelf') {
              @if (canManageMagicShelf()) {
                <app-menu-item
                  (selected)="actions.editMagicShelf(target.entity.id)">
                  {{ 'book.shelfMenuService.magicShelf.editMagicShelf' | transloco }}
                </app-menu-item>
              }
              <app-menu-item
                (selected)="actions.copyMagicShelfJson(target.entity.filterJson)">
                {{ 'book.shelfMenuService.magicShelf.exportJson' | transloco }}
              </app-menu-item>
              @if (canManageMagicShelf()) {
                <app-menu-separator />
                <app-menu-item
                  variant="destructive"
                  (selected)="actions.deleteMagicShelf(target.entity)">
                  {{ 'book.shelfMenuService.magicShelf.deleteMagicShelf' | transloco }}
                </app-menu-item>
              }
            }
          }
        }
      }
    </app-menu>

    <app-menu
      #cardDetailMenu="ngMenu"
      menuClass="w-60 max-h-[min(32rem,calc(100vh-2rem))] overflow-y-auto"
      [ariaLabel]="'browse.toolbar.cardDetail' | transloco">
      <app-menu-radio-group
        [value]="cardDetail() ?? ''"
        (valueSelected)="setCardDetail($event)">
        <app-menu-radio value="">{{ 'browse.toolbar.noCardDetail' | transloco }}</app-menu-radio>
        @for (option of cardDetailOptions; track option.id) {
          <app-menu-radio [value]="option.id">{{ option.labelKey | transloco }}</app-menu-radio>
        }
      </app-menu-radio-group>
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
                [checked]="!column.hideable || column.visible"
                [disabled]="!column.hideable"
                [closeOnSelect]="false"
                (selected)="setColumnVisibility(column.field, $event)">
                {{ column.labelKey | transloco }}
              </app-menu-checkbox>
            }
          </div>
        }
      </div>
      <app-menu-separator />
      <app-menu-item (selected)="columnsReset.emit()">
        {{ 'browse.toolbar.resetColumns' | transloco }}
      </app-menu-item>
    </app-menu>
    }
  `,
})
export class BookBrowseToolbarComponent {
  private readonly currentUser = inject(UserService).currentUser;
  protected readonly actions = inject(LibraryShelfMenuService);

  readonly activeSort = input.required<BookSortSelection>();
  readonly sortOptions = input.required<readonly BookSortOption[]>();
  readonly sortTerms = input<readonly BookSortTerm[]>([]);
  readonly viewMode = input<BookBrowseViewMode>('grid');
  readonly columnOptions = input<readonly BookBrowseColumnOption[]>([]);
  readonly cardDetail = input<BookQuerySortKey | null>(null);
  readonly densitySmallerDisabled = input(false, {transform: booleanAttribute});
  readonly densityLargerDisabled = input(false, {transform: booleanAttribute});
  readonly filtersOpen = input(false, {transform: booleanAttribute});
  readonly mobileSelectMode = input(false, {transform: booleanAttribute});
  readonly selectionCount = input(0);
  readonly selectionTotal = input<number | null>(null);
  readonly actionTarget = input<LibraryShelfMenuTarget | null>(null);

  readonly sortChange = output<BookSortSelection>();
  readonly sortDirectionChange = output<BookSortSelection>();
  readonly multiSortRequested = output();
  readonly viewModeChange = output<BookBrowseViewMode>();
  readonly columnVisibilityChange = output<BookBrowseColumnVisibilityChange>();
  readonly columnsReset = output();
  readonly cardDetailChange = output<BookQuerySortKey | null>();
  readonly densityChange = output<GridDensityDirection>();
  readonly filtersToggle = output();
  readonly mobileSelectToggle = output();
  readonly selectAllRequested = output();

  protected readonly cardDetailOptions = BOOK_BROWSE_CARD_DETAIL_OPTIONS;
  protected readonly actionAvailable = computed(() => {
    const target = this.actionTarget();
    return target !== null && libraryShelfMenuAvailable(target, this.currentUser());
  });
  protected readonly canManageMagicShelf = computed(() => {
    const target = this.actionTarget();
    return target !== null && canManageMagicShelfTarget(target, this.currentUser());
  });

  protected readonly stepperClass =
    'flex h-7 w-10 items-center justify-center rounded-sm text-text-muted ' +
    'hover:bg-surface-hover hover:text-text disabled:pointer-events-none disabled:opacity-40 ' +
    'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary ' +
    'pointer-coarse:h-10 pointer-coarse:w-12 [&>svg]:size-4';
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
  protected readonly activeSortIcon = computed(() =>
    sortDirectionIcon(this.activeSort().option.id, this.activeSort().direction));
  protected readonly columnSections = computed<readonly BookBrowseColumnSection[]>(() => {
    return bookBrowseColumnSections(this.columnOptions());
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
    if (this.columnOptions().find(column => column.field === field)?.hideable) {
      this.columnVisibilityChange.emit({field, visible});
    }
  }

  protected setCardDetail(value: string): void {
    const option = this.cardDetailOptions.find(candidate => candidate.id === value);
    this.cardDetailChange.emit(option?.id ?? null);
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
      const nextDirection = option.directions.find(direction => direction !== active.direction)!;
      this.sortChange.emit({option, direction: nextDirection});
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
