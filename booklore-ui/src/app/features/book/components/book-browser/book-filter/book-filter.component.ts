import {ChangeDetectionStrategy, Component, effect, EventEmitter, inject, Input, OnDestroy, OnInit, Output, Signal, signal} from '@angular/core';
import {Subject, takeUntil} from 'rxjs';
import {Library} from '../../../model/library.model';
import {Shelf} from '../../../model/shelf.model';
import {EntityType} from '../book-browser.component';
import {BookFilterMode, DEFAULT_VISIBLE_FILTERS, UserService, VisibleFilterType} from '../../../../settings/user-management/user.service';
import {MagicShelf} from '../../../../magic-shelf/service/magic-shelf.service';
import {Filter, FILTER_LABEL_KEYS, FilterType} from './book-filter.config';
import {BookFilterService} from './book-filter.service';
import {TranslocoDirective, TranslocoService} from '@jsverse/transloco';

interface FilterModeOption {
  label: string;
  value: BookFilterMode;
}

@Component({
  selector: 'app-book-filter',
  templateUrl: './book-filter.component.html',
  styleUrls: ['./book-filter.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [TranslocoDirective]
})
export class BookFilterComponent implements OnInit, OnDestroy {
  @Input() set entity(value: Library | Shelf | MagicShelf | null | undefined) {
    this.entitySignal.set(value ?? null);
  }
  @Input() set entityType(value: EntityType | undefined) {
    this.entityTypeSignal.set(value ?? EntityType.ALL_BOOKS);
  }
  @Input() resetFilter$!: Subject<void>;
  @Input() showFilter = false;

  @Output() filterSelected = new EventEmitter<Record<string, unknown> | null>();
  @Output() filterModeChanged = new EventEmitter<BookFilterMode>();

  private readonly filterService = inject(BookFilterService);
  private readonly userService = inject(UserService);
  private readonly t = inject(TranslocoService);
  private readonly destroy$ = new Subject<void>();

  private readonly entitySignal = signal<Library | Shelf | MagicShelf | null>(null);
  private readonly entityTypeSignal = signal<EntityType>(EntityType.ALL_BOOKS);
  private readonly activeFiltersSignal = signal<Record<string, unknown[]> | null>(null);
  private readonly filterModeSignal = signal<BookFilterMode>('and');

  readonly activeFilters = signal<Record<string, unknown[]>>({});
  filterSignals: Record<FilterType, Signal<Filter[]>> = this.filterService.createFilterSignals(
    this.entitySignal,
    this.entityTypeSignal,
    this.activeFiltersSignal,
    this.filterModeSignal
  );
  filterTypes: FilterType[] = Object.keys(this.filterSignals) as FilterType[];
  readonly visibleFilterTypes = signal<FilterType[]>([]);
  readonly expandedPanels = signal<number[]>([0]);
  truncatedFilters: Record<string, boolean> = {};

  private _selectedFilterMode: BookFilterMode = 'and';
  private _visibleFilters: VisibleFilterType[] = [...DEFAULT_VISIBLE_FILTERS];

  private readonly userSettingsEffect = effect(() => {
    const user = this.userService.currentUser();
    if (!user) return;
    this._visibleFilters = user.userSettings.visibleFilters ?? [...DEFAULT_VISIBLE_FILTERS];
    this.updateVisibleFilterTypes();
  }, {allowSignalWrites: true});

  readonly filterLabelKeys = FILTER_LABEL_KEYS;

  getFilterLabel(type: FilterType): string {
    const key = this.filterLabelKeys[type];
    return key ? this.t.translate(key) : type;
  }
  readonly filterModeOptions: FilterModeOption[] = [
    {label: 'AND', value: 'and'},
    {label: 'OR', value: 'or'},
    {label: 'NOT', value: 'not'},
    {label: '1', value: 'single'}
  ];

  get selectedFilterMode(): BookFilterMode {
    return this._selectedFilterMode;
  }

  set selectedFilterMode(mode: BookFilterMode) {
    if (mode === this._selectedFilterMode) return;
    this._selectedFilterMode = mode;
    this.filterModeSignal.set(mode);
    this.filterModeChanged.emit(mode);
    this.emitFilters();
  }

  ngOnInit(): void {
    this.updateVisibleFilterTypes();
    this.updateExpandedPanels();
    this.subscribeToReset();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  handleFilterClick(filterType: string, value: unknown): void {
    if (this._selectedFilterMode === 'single') {
      this.handleSingleMode(filterType, value);
    } else {
      this.handleMultiMode(filterType, value);
    }
    this.emitFilters();
  }

  setFilters(filters: Record<string, unknown>): void {
    const newFilters: Record<string, unknown[]> = {};
    for (const [key, value] of Object.entries(filters)) {
      const values = Array.isArray(value) ? value : [value];
      newFilters[key] = values.map(v => this.filterService.processFilterValue(key, v));
    }
    this.activeFilters.set(newFilters);
    this.emitFilters();
  }

  clearActiveFilter(): void {
    this.activeFilters.set({});
    this.expandedPanels.set([0]);
    this.activeFiltersSignal.set(null);
    this.filterSelected.emit(null);
  }

  togglePanel(index: number): void {
    const panels = this.expandedPanels();
    if (panels.includes(index)) {
      this.expandedPanels.set(panels.filter(p => p !== index));
    } else {
      this.expandedPanels.set([...panels, index]);
    }
  }

  getVirtualScrollHeight = (itemCount: number): number => Math.min(itemCount * 28, 440);

  trackByFilterType = (_: number, type: FilterType): string => type;

  trackByFilter = (_: number, f: Filter): unknown => this.getFilterValueId(f);

  getFilterValueId(f: Filter): unknown {
    const value = f.value;
    return typeof value === 'object' && value !== null && 'id' in value
      ? value.id
      : f.value;
  }

  getFilterValueDisplay(f: Filter): string {
    const value = f.value;
    if (typeof value === 'object' && value !== null && 'name' in value) {
      return String(value.name ?? '');
    }
    return String(value ?? '');
  }

  private updateVisibleFilterTypes(): void {
    this.visibleFilterTypes.set(
      this._visibleFilters.filter(
        vf => this.filterTypes.includes(vf as FilterType)
      ) as FilterType[]
    );
  }

  private subscribeToReset(): void {
    this.resetFilter$?.pipe(takeUntil(this.destroy$)).subscribe(() => this.clearActiveFilter());
  }

  private handleSingleMode(filterType: string, value: unknown): void {
    const id = this.extractId(value);
    const current = this.activeFilters()[filterType];
    const isSame = current?.length === 1 && this.valuesMatch(current[0], id);

    this.activeFilters.set(isSame ? {} : {[filterType]: [id]});
  }

  private handleMultiMode(filterType: string, value: unknown): void {
    const id = this.extractId(value);
    const current = this.activeFilters();
    const arr = current[filterType] ?? [];
    const index = arr.findIndex(v => this.valuesMatch(v, id));

    if (index > -1) {
      const newArr = arr.filter((_, i) => i !== index);
      if (newArr.length === 0) {
        const {[filterType]: _, ...rest} = current;
        this.activeFilters.set(rest);
      } else {
        this.activeFilters.set({...current, [filterType]: newArr});
      }
    } else {
      this.activeFilters.set({...current, [filterType]: [...arr, id]});
    }
  }

  private extractId(value: unknown): unknown {
    return typeof value === 'object' && value !== null && 'id' in value
      ? (value as { id: unknown }).id
      : value;
  }

  private valuesMatch(a: unknown, b: unknown): boolean {
    return a === b || String(a) === String(b);
  }

  private emitFilters(): void {
    const filters = this.activeFilters();
    const hasFilters = Object.keys(filters).length > 0;
    const filtersToEmit = hasFilters ? {...filters} : null;
    this.activeFiltersSignal.set(filtersToEmit);
    this.filterSelected.emit(filtersToEmit);
  }

  private updateExpandedPanels(): void {
    const panels = new Set(this.expandedPanels());
    const filters = this.activeFilters();
    this.visibleFilterTypes().forEach((type, i) => {
      if (filters[type]?.length) panels.add(i);
    });
    this.expandedPanels.set(panels.size > 0 ? [...panels] : [0]);
  }
}
