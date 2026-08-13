import {Component, effect, ElementRef, inject, viewChild} from '@angular/core';
import {Select} from '@openng/optimus-ui/select';
import {ALL_FILTER_OPTION_VALUES, ALL_FILTER_OPTIONS, BookFilterMode, DEFAULT_VISIBLE_FILTERS, User, UserService, UserSettings, VisibleFilterType} from '../../user-management/user.service';
import {FILTER_LABEL_KEYS} from '../../../book/components/book-browser/book-filter/book-filter.config';
import {MessageService} from '@openng/optimus-ui/api';
import {FormsModule} from '@angular/forms';
import {CdkDrag, CdkDragDrop, CdkDragHandle, CdkDropList, moveItemInArray} from '@angular/cdk/drag-drop';
import {Tooltip} from '@openng/optimus-ui/tooltip';
import {TranslocoDirective, TranslocoPipe, TranslocoService} from '@jsverse/transloco';

const MIN_VISIBLE_FILTERS = 5;
const MAX_VISIBLE_FILTERS = 50;

@Component({
  selector: 'app-filter-preferences',
  imports: [
    Select,
    FormsModule,
    CdkDropList,
    CdkDrag,
    CdkDragHandle,
    Tooltip,
    TranslocoDirective,
    TranslocoPipe
  ],
  templateUrl: './filter-preferences.component.html',
  styleUrl: './filter-preferences.component.scss'
})
export class FilterPreferencesComponent {

  readonly filterModes = [
    {label: 'And', value: 'and'},
    {label: 'Or', value: 'or'},
    {label: 'Single', value: 'single'},
  ];

  readonly allFilterOptions = ALL_FILTER_OPTIONS;
  readonly minFilters = MIN_VISIBLE_FILTERS;
  readonly maxFilters = MAX_VISIBLE_FILTERS;

  selectedFilterMode: BookFilterMode = 'and';
  selectedVisibleFilters: VisibleFilterType[] = [...DEFAULT_VISIBLE_FILTERS];

  private readonly filterList = viewChild<ElementRef<HTMLElement>>('filterList');

  private readonly userService = inject(UserService);
  private readonly messageService = inject(MessageService);
  private readonly t = inject(TranslocoService);

  private currentUser: User | null = null;
  private hasInitialized = false;

  constructor() {
    effect(() => {
      const user = this.userService.currentUser();
      if (!user) return;

      this.currentUser = user;
      if (!this.hasInitialized) {
        this.hasInitialized = true;
        this.loadPreferences(user.userSettings);
      }
    });
  }

  private loadPreferences(settings: UserSettings): void {
    this.selectedFilterMode = settings.filterMode ?? 'and';
    const visibleFilters = Array.isArray(settings.visibleFilters)
      ? settings.visibleFilters.filter(isVisibleFilter)
      : [];
    this.selectedVisibleFilters = visibleFilters.length
      ? visibleFilters
      : [...DEFAULT_VISIBLE_FILTERS];
  }

  private updatePreference(key: 'filterMode' | 'visibleFilters', value: BookFilterMode | VisibleFilterType[]): void {
    if (!this.currentUser) return;

    this.userService.updateUserSetting(this.currentUser.id, key, value);
    this.messageService.add({
      severity: 'success',
      summary: this.t.translate('settingsView.sidebarSort.prefsUpdated'),
      detail: this.t.translate('settingsView.sidebarSort.prefsUpdatedDetail'),
      life: 1500
    });
  }

  onFilterModeChange(): void {
    this.updatePreference('filterMode', this.selectedFilterMode);
  }

  selectedAddFilter: string | null = null;

  get availableFilters(): {label: string; value: string}[] {
    const used = new Set(this.selectedVisibleFilters);
    return ALL_FILTER_OPTION_VALUES
      .filter(v => !used.has(v))
      .map(v => ({label: this.getFilterLabel(v), value: v}));
  }

  getFilterLabel(value: VisibleFilterType): string {
    const key = FILTER_LABEL_KEYS[value];
    return key ? this.t.translate(key) : value;
  }

  onDrop(event: CdkDragDrop<VisibleFilterType[]>): void {
    moveItemInArray(this.selectedVisibleFilters, event.previousIndex, event.currentIndex);
    this.updatePreference('visibleFilters', this.selectedVisibleFilters);
  }

  addFilter(): void {
    if (this.selectedAddFilter && isVisibleFilter(this.selectedAddFilter)) {
      this.selectedVisibleFilters.push(this.selectedAddFilter);
      this.selectedAddFilter = null;
      this.updatePreference('visibleFilters', this.selectedVisibleFilters);
      requestAnimationFrame(() => {
        const el = this.filterList()?.nativeElement;
        if (el) el.scrollTop = el.scrollHeight;
      });
    }
  }

  removeFilter(index: number): void {
    if (this.selectedVisibleFilters.length > MIN_VISIBLE_FILTERS) {
      this.selectedVisibleFilters.splice(index, 1);
      this.updatePreference('visibleFilters', this.selectedVisibleFilters);
    }
  }

  resetToDefaults(): void {
    this.selectedVisibleFilters = [...DEFAULT_VISIBLE_FILTERS];
    this.updatePreference('visibleFilters', this.selectedVisibleFilters);
  }

  get selectionCountText(): string {
    return this.t.translate('settingsView.filter.selectionCount', {count: this.selectedVisibleFilters.length, total: this.allFilterOptions.length});
  }
}

function isVisibleFilter(value: unknown): value is VisibleFilterType {
  return typeof value === 'string' && ALL_FILTER_OPTION_VALUES.some(filter => filter === value);
}
