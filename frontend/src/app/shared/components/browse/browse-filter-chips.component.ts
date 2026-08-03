import {ChangeDetectionStrategy, Component, input, output} from '@angular/core';
import {TranslocoPipe} from '@jsverse/transloco';

import {AppButtonComponent} from '../../ui/button/app-button.component';
import {AppTagComponent} from '../../ui/tag/app-tag.component';
import {type BrowseFacetGroup} from '../../../core/data/browse.models';
import {
  orderedBrowseFacetVocabularyKeys,
  type BrowseFacetSelection,
  type BrowseFacetVocabulary,
  type FrozenFacetOrders,
} from './browse-facets';

export interface BrowseFilterChip<K extends string = string> {
  readonly key: K;
  readonly value: string;
  readonly groupLabelKey: string;
  readonly valueLabel: string;
}

export function buildBrowseFilterChips<K extends string>(
  selections: BrowseFacetSelection<K>,
  served: readonly BrowseFacetGroup[],
  frozen: FrozenFacetOrders | undefined,
  vocabulary: BrowseFacetVocabulary<K>,
): BrowseFilterChip<K>[] {
  const vocabularyKeys = orderedBrowseFacetVocabularyKeys(served, frozen, vocabulary);
  const vocabularySet = new Set<string>(vocabularyKeys);
  const selectionKeys = Object.keys(selections).filter(vocabulary.isKey);
  const keys = [
    ...vocabularyKeys,
    ...selectionKeys.filter(key => !vocabularySet.has(key)),
  ];
  return keys.flatMap(key => {
    const values = selections[key] ?? [];
    if (values.length === 0) {
      return [];
    }
    const frozenGroup = frozen && Object.hasOwn(frozen, key) ? frozen[key] : undefined;
    const frozenIndex = new Map((frozenGroup?.values ?? []).map((item, index) => [item.value, index]));
    return [...values]
      .sort((a, b) => {
        const indexA = frozenIndex.get(a) ?? Number.MAX_SAFE_INTEGER;
        const indexB = frozenIndex.get(b) ?? Number.MAX_SAFE_INTEGER;
        return indexA - indexB || a.localeCompare(b);
      })
      .map(value => ({
        key,
        value,
        groupLabelKey: vocabulary.labelKey(key),
        valueLabel: frozenGroup?.values.find(item => item.value === value)?.label ?? value,
      }));
  });
}

@Component({
  selector: 'app-browse-filter-chips',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoPipe, AppButtonComponent, AppTagComponent],
  host: {class: 'flex min-h-8 flex-wrap items-center gap-2'},
  template: `
    @if (query(); as term) {
      <app-tag
        color="neutral"
        size="sm"
        removable
        [removeLabel]="'browse.chips.removeSearch' | transloco: {query: term}"
        (remove)="removeSearch.emit()">
        <span class="text-text-muted">{{ 'common.search' | transloco }}:</span>
        <span class="max-w-48 truncate">{{ term }}</span>
      </app-tag>
    }
    @for (chip of chips(); track chip.key + ':' + chip.value) {
      <app-tag
        color="neutral"
        size="sm"
        removable
        [removeLabel]="'shared.ui.tag.removeLabel' | transloco: {label: chip.valueLabel}"
        (remove)="removeChip.emit(chip)">
        <span class="text-text-muted">{{ chip.groupLabelKey | transloco }}:</span>
        <span class="max-w-48 truncate">{{ chip.valueLabel }}</span>
      </app-tag>
    }
    <app-button
      variant="ghost"
      size="sm"
      [label]="'browse.chips.clearAll' | transloco"
      (clicked)="clearAll.emit()" />
  `,
})
export class BrowseFilterChipsComponent<K extends string = string> {
  readonly chips = input.required<readonly BrowseFilterChip<K>[]>();
  readonly query = input('');

  readonly removeChip = output<BrowseFilterChip<K>>();
  readonly removeSearch = output<void>();
  readonly clearAll = output<void>();
}
