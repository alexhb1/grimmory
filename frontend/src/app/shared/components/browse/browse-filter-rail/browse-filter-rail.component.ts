import {NgTemplateOutlet} from '@angular/common';
import {ChangeDetectionStrategy, Component, booleanAttribute, effect, input, output, signal} from '@angular/core';
import {TranslocoPipe} from '@jsverse/transloco';
import {LucideCheck, LucideChevronDown, LucideMinus, LucideSearch, LucideX} from '@lucide/angular';

import {cn} from '../../../ui/cn';
import {AppButtonComponent} from '../../../ui/button/app-button.component';
import {AppInputComponent} from '../../../ui/input/app-input.component';
import {AppTagComponent} from '../../../ui/tag/app-tag.component';
import {
  checkIndicatorBaseClass,
  checkIndicatorCheckedClass,
  checkIndicatorIconClass,
  checkIndicatorUncheckedClass,
} from '../../../ui/checkbox/check-indicator.styles';

export type FilterRailValueState = 'any' | 'must' | 'not';

export interface FilterRailValue {
  value: string;
  label: string;
  count: number | null;
  selected: boolean;
  state?: FilterRailValueState | null;
}

export interface FilterRailGroup {
  key: string;
  label: string;
  defaultOpen: boolean;
  values: FilterRailValue[];
}

export interface FilterRailToggle {
  key: string;
  value: string;
  selected: boolean;
  origin?: 'row';
}

const COLLAPSED_VALUE_COUNT = 8;

@Component({
  selector: 'app-browse-filter-rail',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet, TranslocoPipe, AppButtonComponent, AppInputComponent, AppTagComponent, LucideCheck, LucideChevronDown, LucideMinus, LucideSearch, LucideX],
  host: {class: 'flex flex-col gap-1 text-[13px] [overflow-anchor:none] pointer-coarse:text-sm'},
  template: `
    @for (group of groups(); track group.key) {
      <section>
        <div class="relative mb-1 flex items-center">
          <button
            type="button"
            class="group/ghead -mx-1.5 flex min-h-8 w-[calc(100%+0.75rem)] cursor-pointer items-center gap-1.5 px-1.5 pr-8 text-left pointer-coarse:min-h-11 pointer-coarse:px-2 pointer-coarse:pr-12"
            [attr.aria-expanded]="isOpen(group)"
            (click)="toggleOpen(group.key)">
            <h3 class="m-0 text-xs font-semibold text-text-muted group-hover/ghead:text-text pointer-coarse:text-sm">{{ group.label }}</h3>
            @if (!isOpen(group) && selectedCount(group) > 0) {
              @if (stateCounts(group); as counts) {
                <app-tag color="primary" size="sm" styleClass="min-w-4 justify-center px-1! py-px! text-[10px]! tabular-nums">
                  @if (counts.must > 0 || counts.not > 0) {
                    <span [class.opacity-45]="counts.any === 0">{{ counts.any }}</span>
                    <span class="opacity-45">·</span>
                    <span [class.opacity-45]="counts.must === 0">{{ counts.must }}</span>
                    <span class="opacity-45">·</span>
                    <span [class]="counts.not > 0 ? 'text-danger' : 'opacity-45'">{{ counts.not }}</span>
                  } @else {
                    {{ counts.any }}
                  }
                </app-tag>
              }
            }
            <svg
              lucideChevronDown
              class="size-3 text-text-muted transition-transform duration-200 motion-reduce:transition-none"
              [class.-rotate-90]="!isOpen(group)"
              aria-hidden="true"></svg>
          </button>
          @if (isOpen(group) && group.values.length > collapsedCount) {
            <app-button
              variant="ghost"
              size="sm"
              iconOnly
              styleClass="absolute inset-y-0 -right-1.5 my-auto size-8 pointer-coarse:text-base"
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

        <div [class]="groupBodyClass(group)">
          <div class="-mx-1.5 min-h-0 overflow-hidden px-1.5">
        <div [class]="searchWrapClass(group.key)" [attr.inert]="isSearching(group.key) ? null : ''" data-search-wrap>
          <div class="-mx-1.5 min-h-0 overflow-hidden px-1.5 pt-px">
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
            }
          </ul>
        } @else {
          <ul class="m-0 flex list-none flex-col p-0">
            @for (item of foldValues(group); track item.value) {
              <li><ng-container *ngTemplateOutlet="row; context: {item, group}" /></li>
            }
          </ul>
          <div [class]="extrasWrapClass(group.key)">
            <ul class="-mx-1.5 m-0 flex min-h-0 list-none flex-col overflow-hidden px-1.5">
              @for (item of extraValues(group); track item.value) {
                <li><ng-container *ngTemplateOutlet="row; context: {item, group}" /></li>
              }
            </ul>
          </div>
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
        [attr.aria-pressed]="item.selected"
        (click)="toggleValue.emit({key: group.key, value: item.value, selected: !item.selected, origin: 'row'})">
        <span [class]="boxClass(item)" aria-hidden="true">
          @if (item.state === 'not') {
            <svg lucideMinus [class]="checkIconClass" aria-hidden="true"></svg>
          } @else if (item.selected) {
            <svg lucideCheck [class]="checkIconClass" aria-hidden="true"></svg>
          }
        </span>
        <span [class]="labelClass(item)">
          {{ item.label }}
        </span>
        @if (item.count !== null) {
          <span class="w-6 shrink-0 text-right text-[11.5px] tabular-nums text-text-muted pointer-coarse:text-xs">{{ item.count }}</span>
        }
      </button>
    </ng-template>
  `,
})
export class BrowseFilterRailComponent {
  readonly groups = input<readonly FilterRailGroup[]>([]);
  readonly alwaysShowBoxes = input(false, {transform: booleanAttribute});
  readonly toggleValue = output<FilterRailToggle>();

  protected readonly checkIconClass = checkIndicatorIconClass;
  protected readonly collapsedCount = COLLAPSED_VALUE_COUNT;
  protected readonly expandRowClass =
    '-mx-1.5 mt-0.5 flex min-h-7 w-[calc(100%+0.75rem)] cursor-pointer items-center rounded-md px-1.5 py-1 ' +
    'text-left text-xs text-text-muted hover:bg-surface-hover hover:text-text pointer-coarse:min-h-11 pointer-coarse:text-[13px]';
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

  protected toggleOpen(key: string): void {
    this.openKeys.update(current => toggledSet(current, key));
  }

  protected selectedCount(group: FilterRailGroup): number {
    return group.values.reduce((total, item) => total + (item.selected ? 1 : 0), 0);
  }

  protected stateCounts(group: FilterRailGroup): {any: number; must: number; not: number} {
    const counts = {any: 0, must: 0, not: 0};
    for (const item of group.values) {
      if (item.state === 'must') {
        counts.must++;
      } else if (item.state === 'not') {
        counts.not++;
      } else if (item.selected) {
        counts.any++;
      }
    }
    return counts;
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
      this.reseatAtGroup((event.currentTarget as HTMLElement).closest('section'));
    }
  }

  private reseatAtGroup(section: HTMLElement | null): void {
    if (!section) {
      return;
    }
    const scroller = nearestScroller(section);
    const stuckOffset =
      scroller === document.scrollingElement
        ? parseFloat(getComputedStyle(section).getPropertyValue('--page-stuck-offset')) || 0
        : scroller.getBoundingClientRect().top;
    const viewportTop = stuckOffset + 8;
    const sectionTop = section.getBoundingClientRect().top;
    if (sectionTop < viewportTop) {
      scroller.scrollTop += sectionTop - viewportTop;
    }
  }

  protected toggleSearch(key: string, event: Event): void {
    const opening = !this.isSearching(key);
    this.searchingKeys.update(current => toggledSet(current, key));
    if (opening) {
      const wrap = (event.target as HTMLElement)
        .closest('section')
        ?.querySelector<HTMLElement>('[data-search-wrap]');
      wrap?.removeAttribute('inert');
      wrap?.querySelector('input')?.focus({preventScroll: true});
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
    const needle = query.toLowerCase();
    return group.values
      .filter(item => item.label.toLowerCase().includes(needle))
      .slice(0, COLLAPSED_VALUE_COUNT);
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
    const rest = group.values.slice(COLLAPSED_VALUE_COUNT);
    return this.isExpanded(group.key) ? rest : rest.filter(item => !item.selected);
  }

  protected extrasWrapClass(key: string): string {
    return cn(
      'grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none',
      this.isExpanded(key) ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
    );
  }

  protected labelClass(item: FilterRailValue): string {
    return cn(
      'min-w-0 flex-1 truncate',
      item.state === 'must'
        ? 'font-[550] text-primary'
        : item.selected && 'font-[550] text-text',
    );
  }

  protected rowClass(item: FilterRailValue): string {
    return cn(
      'group/frow -mx-1.5 flex min-h-7 w-[calc(100%+0.75rem)] cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-left text-text-secondary pointer-coarse:min-h-11 pointer-coarse:gap-2.5 pointer-coarse:px-2',
      item.state === 'must'
        ? 'bg-active-surface text-text'
        : 'hover:bg-surface-hover hover:text-text',
      this.isZero(item) && 'opacity-45',
    );
  }

  protected boxClass(item: FilterRailValue): string {
    return cn(
      checkIndicatorBaseClass,
      item.state === 'not'
        ? 'border-transparent bg-danger text-white'
        : item.selected
          ? checkIndicatorCheckedClass
          : checkIndicatorUncheckedClass,
      !this.alwaysShowBoxes() && (item.selected ? 'opacity-100' : 'opacity-0 group-hover/frow:opacity-100'),
    );
  }
}

function nearestScroller(element: HTMLElement): HTMLElement {
  for (let node = element.parentElement; node; node = node.parentElement) {
    const overflowY = getComputedStyle(node).overflowY;
    if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) {
      return node;
    }
  }
  return (document.scrollingElement ?? document.documentElement) as HTMLElement;
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
