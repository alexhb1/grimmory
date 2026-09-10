import {NgTemplateOutlet} from '@angular/common';
import {Component, Injector, afterNextRender, booleanAttribute, effect, inject, input, output, signal} from '@angular/core';
import {TranslocoPipe} from '@jsverse/transloco';
import {LucideCheck, LucideChevronDown, LucideSearch, LucideX} from '@lucide/angular';

import {cn} from '../../ui/cn';
import {IconDisplayComponent} from '../../components/icon-display/icon-display.component';
import {AppButtonComponent} from '../../ui/button/app-button.component';
import {AppInputComponent} from '../../ui/input/app-input.component';
import {AppRatingComponent} from '../../ui/rating/app-rating.component';
import {AppTagComponent} from '../../ui/tag/app-tag.component';
import {normalizeLocalSearchTerm} from '../../util/search-terms';
import {
  checkIndicatorBaseClass,
  checkIndicatorCheckedClass,
  checkIndicatorIconClass,
  checkIndicatorUncheckedClass,
} from '../../ui/checkbox/check-indicator.styles';
import {type BrowseFilterGroup, type BrowseFilterRangeCommit, type BrowseFilterToggle, type BrowseFilterValue} from '../facets';
import {BrowseFacetRangeInputsComponent} from './facet-range-inputs.component';

const COLLAPSED_VALUE_COUNT = 8;
const REVEAL_CLASS = 'grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none';

@Component({
  selector: 'app-browse-filter-rail',
  imports: [
    NgTemplateOutlet,
    TranslocoPipe,
    AppButtonComponent,
    AppInputComponent,
    AppRatingComponent,
    AppTagComponent,
    IconDisplayComponent,
    BrowseFacetRangeInputsComponent,
    LucideCheck,
    LucideChevronDown,
    LucideSearch,
    LucideX,
  ],
  host: {class: 'flex flex-col gap-1 text-[13px] [overflow-anchor:none] pointer-coarse:text-sm'},
  templateUrl: './filter-rail.component.html',
})
export class BrowseFilterRailComponent<K extends string = string> {
  readonly groups = input.required<readonly BrowseFilterGroup<K>[]>();
  readonly alwaysShowBoxes = input(false, {transform: booleanAttribute});
  readonly toggleValue = output<BrowseFilterToggle<K>>();
  readonly commitRange = output<BrowseFilterRangeCommit<K>>();

  private readonly injector = inject(Injector);

  private readonly openKeys = signal<ReadonlySet<string>>(new Set());
  private readonly everOpenedKeys = signal<ReadonlySet<string>>(new Set());
  private readonly expandedKeys = signal<ReadonlySet<string>>(new Set());
  private readonly searchingKeys = signal<ReadonlySet<string>>(new Set());
  private readonly searches = signal<Readonly<Record<string, string>>>({});
  private readonly seenKeys = new Set<string>();


  protected readonly checkIconClass = checkIndicatorIconClass;
  protected readonly expandRowClass =
    'mt-0.5 flex min-h-7 w-full cursor-pointer items-center rounded-sm py-1 pl-7.5 ' +
    'text-left text-xs text-text-muted hover:text-text ' +
    'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary ' +
    'pointer-coarse:min-h-11 pointer-coarse:text-[13px] pointer-coarse:pl-9';

  constructor() {
    effect(() => {
      const groups = this.groups();
      const toOpen = groups.filter(group =>
        !this.seenKeys.has(group.key) &&
        (group.defaultOpen || group.values.some(item => item.selected) || rangeActive(group)));
      for (const group of groups) {
        this.seenKeys.add(group.key);
      }
      if (toOpen.length > 0) {
        this.open(toOpen.map(group => group.key));
      }
    });
  }

  protected isOpen(group: BrowseFilterGroup): boolean {
    return this.openKeys().has(group.key);
  }

  protected wasOpened(group: BrowseFilterGroup): boolean {
    return this.everOpenedKeys().has(group.key);
  }

  protected toggleOpen(key: string): void {
    if (this.openKeys().has(key)) {
      this.openKeys.update(current => toggledSet(current, key));
    } else {
      this.open([key]);
    }
  }

  private open(keys: readonly string[]): void {
    this.openKeys.update(current => new Set([...current, ...keys]));
    this.everOpenedKeys.update(current => new Set([...current, ...keys]));
  }

  protected selectedCount(group: BrowseFilterGroup): number {
    return group.values.reduce((total, item) => total + (item.selected ? 1 : 0), 0)
      + (rangeActive(group) ? 1 : 0);
  }

  protected revealClass(open: boolean): string {
    return cn(REVEAL_CLASS, open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]');
  }

  protected rangeRowClass(group: BrowseFilterGroup): string {
    return cn('px-2', group.values.length > 0 ? 'pt-3' : 'pt-1');
  }

  protected foldLimit(group: BrowseFilterGroup): number {
    return group.showAllValues ? Infinity : COLLAPSED_VALUE_COUNT;
  }

  protected isExpanded(key: string): boolean {
    return this.expandedKeys().has(key);
  }

  protected visibleValues(group: BrowseFilterGroup): BrowseFilterValue[] {
    if (this.isExpanded(group.key)) {
      return group.values;
    }
    const limit = this.foldLimit(group);
    return group.values.filter((item, index) => index < limit || item.selected);
  }

  protected onExpandToggle(key: string, section: HTMLElement): void {
    const collapsing = this.isExpanded(key);
    this.expandedKeys.update(current => toggledSet(current, key));
    if (collapsing) {
      afterNextRender(() => section.scrollIntoView({block: 'nearest'}), {injector: this.injector});
    }
  }

  protected headerSearchable(group: BrowseFilterGroup): boolean {
    return this.isOpen(group) && group.values.length > this.foldLimit(group);
  }

  protected isSearching(key: string): boolean {
    return this.searchingKeys().has(key);
  }

  protected toggleSearch(key: string, input: AppInputComponent): void {
    const opening = !this.isSearching(key);
    this.searchingKeys.update(current => toggledSet(current, key));
    if (opening) {
      afterNextRender(() => input.focus({preventScroll: true}), {injector: this.injector});
    }
  }

  protected searchFor(key: string): string {
    return this.searches()[key] ?? '';
  }

  protected onSearch(key: string, value: string): void {
    this.searches.update(current => ({...current, [key]: value}));
  }

  protected activeQuery(key: string): string | null {
    if (!this.isSearching(key)) {
      return null;
    }
    const query = this.searchFor(key).trim();
    return query.length > 0 ? query : null;
  }

  protected matches(group: BrowseFilterGroup, query: string): BrowseFilterValue[] {
    const needle = normalizeLocalSearchTerm(query);
    return group.values.filter(item => normalizeLocalSearchTerm(item.label).includes(needle));
  }

  protected onRowToggle(group: BrowseFilterGroup<K>, item: BrowseFilterValue): void {
    this.toggleValue.emit({key: group.key, value: item.value, selected: !item.selected});
  }

  protected isZero(item: BrowseFilterValue): boolean {
    return item.count === 0 && !item.selected;
  }

  protected rowClass(item: BrowseFilterValue): string {
    return cn(
      'group/frow flex min-h-7 w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-left text-text-secondary pointer-coarse:min-h-11 pointer-coarse:gap-2.5',
      'hover:bg-surface-hover hover:text-text',
      'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary',
      this.isZero(item) && 'opacity-45',
    );
  }

  protected boxClass(item: BrowseFilterValue): string {
    return cn(
      checkIndicatorBaseClass,
      item.selected ? checkIndicatorCheckedClass : checkIndicatorUncheckedClass,
      !this.alwaysShowBoxes() && (item.selected ? 'opacity-100' : 'opacity-0 group-hover/frow:opacity-100'),
    );
  }

  protected labelClass(item: BrowseFilterValue): string {
    return cn(
      'min-w-0 flex-1 truncate',
      item.stars && 'flex items-center',
      item.selected && 'font-[550] text-text',
    );
  }
}

function rangeActive(group: BrowseFilterGroup): boolean {
  return group.range?.min != null || group.range?.max != null;
}

function toggledSet(current: ReadonlySet<string>, key: string): ReadonlySet<string> {
  const next = new Set(current);
  if (next.has(key)) {
    next.delete(key);
  } else {
    next.add(key);
  }
  return next;
}
