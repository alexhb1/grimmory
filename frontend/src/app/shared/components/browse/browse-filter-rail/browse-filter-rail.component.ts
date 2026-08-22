import {NgTemplateOutlet} from '@angular/common';
import {ChangeDetectionStrategy, Component, Injector, afterNextRender, booleanAttribute, effect, inject, input, output, signal} from '@angular/core';
import {TranslocoPipe} from '@jsverse/transloco';
import {LucideCheck, LucideChevronDown, LucideSearch, LucideX} from '@lucide/angular';

import {cn} from '../../../ui/cn';
import {AppButtonComponent} from '../../../ui/button/app-button.component';
import {AppInputComponent} from '../../../ui/input/app-input.component';
import {AppTagComponent} from '../../../ui/tag/app-tag.component';
import {normalizeLocalSearchTerm} from '../../../util/search-terms';
import {
  checkIndicatorBaseClass,
  checkIndicatorCheckedClass,
  checkIndicatorIconClass,
  checkIndicatorUncheckedClass,
} from '../../../ui/checkbox/check-indicator.styles';

export interface FilterRailValue {
  value: string;
  label: string;
  count: number;
  selected: boolean;
}

export interface FilterRailGroup<K extends string = string> {
  key: K;
  labelKey: string;
  defaultOpen: boolean;
  values: FilterRailValue[];
}

export interface FilterRailToggle<K extends string = string> {
  key: K;
  value: string;
  selected: boolean;
  origin?: 'row';
}

const COLLAPSED_VALUE_COUNT = 8;

@Component({
  selector: 'app-browse-filter-rail',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet, TranslocoPipe, AppButtonComponent, AppInputComponent, AppTagComponent, LucideCheck, LucideChevronDown, LucideSearch, LucideX],
  host: {class: 'flex flex-col gap-1 text-[13px] [overflow-anchor:none] pointer-coarse:text-sm'},
  template: `
    @for (group of groups(); track group.key) {
      <section class="scroll-mt-[calc(var(--page-stuck-offset,0px)+8px)] border-t border-border/50 pt-2 first:border-t-0 first:pt-0">
        <div class="group/ghead relative mb-1 flex items-center rounded-md px-2 hover:bg-surface-hover">
          <button
            type="button"
            class="flex min-h-9 flex-1 cursor-pointer items-center gap-1.5 pr-8 text-left focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary pointer-coarse:min-h-12 pointer-coarse:pr-12"
            [attr.aria-expanded]="isOpen(group)"
            (click)="toggleOpen(group.key)">
            <h3 class="m-0 text-[13px] font-semibold text-text-secondary group-hover/ghead:text-text pointer-coarse:text-base">{{ group.labelKey | transloco }}</h3>
            @if (!isOpen(group) && selectedCount(group) > 0) {
              <app-tag color="primary" size="sm" styleClass="min-w-4 justify-center px-1! py-px! text-[10px]! tabular-nums">
                {{ selectedCount(group) }}
              </app-tag>
            }
            <svg
              lucideChevronDown
              class="size-3.5 text-text-muted transition-transform duration-200 motion-reduce:transition-none"
              [class.-rotate-90]="!isOpen(group)"
              aria-hidden="true"></svg>
          </button>
          @if (headerSearchable(group)) {
            <app-button
              variant="ghost"
              size="sm"
              iconOnly
              styleClass="absolute inset-y-0 right-1 my-auto size-7 pointer-coarse:size-10 pointer-coarse:text-base"
              [ariaLabel]="'browse.rail.searchValues' | transloco"
              [ariaExpanded]="isSearching(group.key)"
              (clicked)="toggleSearch(group.key, $event)">
              @if (isSearching(group.key)) {
                <svg lucideX aria-hidden="true"></svg>
              } @else {
                <svg lucideSearch aria-hidden="true"></svg>
              }
            </app-button>
          }
        </div>

        <div [class]="groupBodyClass(group)" [attr.inert]="isOpen(group) ? null : ''">
          <div class="min-h-0 overflow-hidden">
        <div [class]="searchWrapClass(group.key)" [attr.inert]="isSearching(group.key) ? null : ''" data-search-wrap>
          <div class="min-h-0 overflow-hidden pt-px">
            <div class="mb-1.5">
              <app-input
                size="sm"
                [placeholder]="'browse.rail.searchValues' | transloco"
                [ariaLabel]="'browse.rail.searchValues' | transloco"
                [value]="searchFor(group.key)"
                (valueChange)="onSearch(group.key, $event)">
                <svg lucideSearch appInputLeading class="size-3.5" aria-hidden="true"></svg>
              </app-input>
            </div>
          </div>
        </div>

        @if (activeQuery(group.key); as query) {
          <ul class="m-0 flex min-h-56 list-none flex-col p-0 pointer-coarse:min-h-[22rem]">
            @for (item of matches(group, query); track item.value) {
              <li><ng-container *ngTemplateOutlet="row; context: {item, group}" /></li>
            } @empty {
              <li class="px-1.5 py-1.5 text-xs text-text-muted pointer-coarse:px-2 pointer-coarse:text-[13px]">
                {{ 'browse.rail.noMatches' | transloco }}
              </li>
            }
          </ul>
        } @else {
          <ul class="m-0 flex list-none flex-col p-0">
            @for (item of foldValues(group); track item.value) {
              <li><ng-container *ngTemplateOutlet="row; context: {item, group}" /></li>
            }
          </ul>
          @if (isExpanded(group.key)) {
            <ul class="m-0 flex list-none flex-col p-0">
              @for (item of extraValues(group); track item.value) {
                <li><ng-container *ngTemplateOutlet="row; context: {item, group}" /></li>
              }
            </ul>
          }
          @if (group.values.length > collapsedCount) {
            <button type="button" [class]="expandRowClass" (click)="onExpandToggle(group.key, $event)">
              {{ (isExpanded(group.key) ? 'browse.rail.showFewer' : 'browse.rail.showAll') | transloco }}
            </button>
          }
        }
            <div class="h-4" aria-hidden="true"></div>
          </div>
        </div>
      </section>
    }

    <ng-template #row let-item="item" let-group="group">
      <button
        type="button"
        [class]="rowClass(item)"
        [disabled]="isZero(item)"
        [attr.title]="item.label"
        [attr.aria-pressed]="item.selected"
        (click)="toggleValue.emit({key: group.key, value: item.value, selected: !item.selected, origin: 'row'})">
        <span [class]="boxClass(item)" aria-hidden="true">
          @if (item.selected) {
            <svg lucideCheck [class]="checkIconClass" aria-hidden="true"></svg>
          }
        </span>
        <span [class]="labelClass(item)">
          {{ item.label }}
        </span>
        <span class="min-w-6 shrink-0 text-right text-[11.5px] tabular-nums text-text-muted pointer-coarse:text-xs">{{ item.count }}</span>
      </button>
    </ng-template>
  `,
})
export class BrowseFilterRailComponent<K extends string = string> {
  readonly groups = input.required<readonly FilterRailGroup<K>[]>();
  readonly alwaysShowBoxes = input(false, {transform: booleanAttribute});
  readonly toggleValue = output<FilterRailToggle<K>>();

  private readonly injector = inject(Injector);

  protected readonly checkIconClass = checkIndicatorIconClass;
  protected readonly collapsedCount = COLLAPSED_VALUE_COUNT;
  protected readonly expandRowClass =
    'mt-0.5 flex min-h-7 w-full cursor-pointer items-center rounded-sm py-1 pl-7.5 ' +
    'text-left text-xs text-text-muted hover:text-text ' +
    'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary ' +
    'pointer-coarse:min-h-11 pointer-coarse:text-[13px] pointer-coarse:pl-9';
  private readonly expandedKeys = signal<ReadonlySet<string>>(new Set());
  private readonly searchingKeys = signal<ReadonlySet<string>>(new Set());
  private readonly searches = signal<Readonly<Record<string, string>>>({});
  private readonly openKeys = signal<ReadonlySet<string>>(new Set());
  private readonly seededKeys = new Set<string>();

  constructor() {
    effect(() => {
      const toOpen = this.groups().filter(
        group =>
          !this.seededKeys.has(group.key) &&
          (group.defaultOpen || group.values.some(item => item.selected)),
      );
      for (const group of this.groups()) {
        this.seededKeys.add(group.key);
      }
      if (toOpen.length > 0) {
        this.openKeys.update(current => {
          const next = new Set(current);
          for (const group of toOpen) {
            next.add(group.key);
          }
          return next;
        });
      }
    });
  }

  protected isOpen(group: FilterRailGroup): boolean {
    return this.openKeys().has(group.key);
  }

  protected headerSearchable(group: FilterRailGroup): boolean {
    return this.isOpen(group) && group.values.length > this.collapsedCount;
  }

  protected toggleOpen(key: string): void {
    this.openKeys.update(current => toggledSet(current, key));
  }

  protected selectedCount(group: FilterRailGroup): number {
    return group.values.reduce((total, item) => total + (item.selected ? 1 : 0), 0);
  }

  protected groupBodyClass(group: FilterRailGroup): string {
    return cn(
      'grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none',
      this.isOpen(group) ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
    );
  }

  protected searchWrapClass(key: string): string {
    return cn(
      'grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none',
      this.isSearching(key) ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
    );
  }

  protected isExpanded(key: string): boolean {
    return this.expandedKeys().has(key);
  }

  protected isSearching(key: string): boolean {
    return this.searchingKeys().has(key);
  }

  protected isZero(item: FilterRailValue): boolean {
    return item.count === 0 && !item.selected;
  }

  protected onExpandToggle(key: string, event: Event): void {
    const collapsing = this.isExpanded(key);
    this.expandedKeys.update(current => toggledSet(current, key));
    if (collapsing) {
      const section = (event.currentTarget as HTMLElement).closest<HTMLElement>('section')!;
      afterNextRender(() => section.scrollIntoView({block: 'nearest'}), {injector: this.injector});
    }
  }

  protected toggleSearch(key: string, event: Event): void {
    const opening = !this.isSearching(key);
    this.searchingKeys.update(current => toggledSet(current, key));
    if (opening) {
      const wrap = (event.target as HTMLElement)
        .closest<HTMLElement>('section')!
        .querySelector<HTMLElement>('[data-search-wrap]')!;
      wrap.removeAttribute('inert');
      wrap.querySelector<HTMLInputElement>('input')!.focus({preventScroll: true});
    }
  }

  protected searchFor(key: string): string {
    return this.searches()[key] ?? '';
  }

  protected activeQuery(key: string): string | null {
    if (!this.isSearching(key)) {
      return null;
    }
    const query = this.searchFor(key).trim();
    return query.length > 0 ? query : null;
  }

  protected onSearch(key: string, value: string): void {
    this.searches.update(current => ({...current, [key]: value}));
  }

  protected matches(group: FilterRailGroup, query: string): FilterRailValue[] {
    const needle = normalizeLocalSearchTerm(query);
    return group.values.filter(item => normalizeLocalSearchTerm(item.label).includes(needle));
  }

  protected foldValues(group: FilterRailGroup): FilterRailValue[] {
    const visible = group.values.slice(0, COLLAPSED_VALUE_COUNT);
    if (this.isExpanded(group.key)) {
      return visible;
    }
    for (const item of group.values.slice(COLLAPSED_VALUE_COUNT)) {
      if (item.selected) {
        visible.push(item);
      }
    }
    return visible;
  }

  protected extraValues(group: FilterRailGroup): FilterRailValue[] {
    return group.values.slice(COLLAPSED_VALUE_COUNT);
  }

  protected labelClass(item: FilterRailValue): string {
    return cn(
      'min-w-0 flex-1 truncate',
      item.selected && 'font-[550] text-text',
    );
  }

  protected rowClass(item: FilterRailValue): string {
    return cn(
      'group/frow flex min-h-7 w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-left text-text-secondary pointer-coarse:min-h-11 pointer-coarse:gap-2.5',
      'hover:bg-surface-hover hover:text-text',
      'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary',
      this.isZero(item) && 'opacity-45',
    );
  }

  protected boxClass(item: FilterRailValue): string {
    return cn(
      checkIndicatorBaseClass,
      item.selected ? checkIndicatorCheckedClass : checkIndicatorUncheckedClass,
      !this.alwaysShowBoxes() && (item.selected ? 'opacity-100' : 'opacity-0 group-hover/frow:opacity-100'),
    );
  }
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
