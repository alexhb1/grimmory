import {ChangeDetectionStrategy, Component, inject, signal} from '@angular/core';
import {DynamicDialogConfig, DynamicDialogRef} from '@openng/optimus-ui/dynamicdialog';
import {TranslocoPipe} from '@jsverse/transloco';

import {type BrowseSortTerm} from '../../../core/data/browse.models';
import {AppButtonComponent} from '../../ui/button/app-button.component';
import {AppCheckboxComponent} from '../../ui/checkbox/app-checkbox.component';
import {type BrowseSortField, type BrowseSortOption} from './browse-sort';
import {MultiSortEditorComponent} from './multi-sort-editor.component';

export interface MultiSortDialogData {
  readonly terms: readonly BrowseSortTerm[];
  readonly options: readonly BrowseSortOption[];
  readonly saveDefaultLabelKey?: string;
  readonly resolveField?: (key: string) => BrowseSortField | null;
}

export interface MultiSortDialogResult {
  readonly terms: readonly BrowseSortTerm[];
  readonly saveAsDefault: boolean;
}

@Component({
  selector: 'app-multi-sort-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoPipe, AppButtonComponent, AppCheckboxComponent, MultiSortEditorComponent],
  template: `
    <div class="flex flex-col gap-4 rounded-[var(--p-dialog-border-radius)] border border-border bg-page p-5">
      <h2 class="text-lg font-semibold text-text">{{ 'browse.sort.multiSort' | transloco }}</h2>
      <app-multi-sort-editor [(terms)]="draft" [options]="data.options" [resolveField]="data.resolveField" />
      @if (data.saveDefaultLabelKey; as labelKey) {
        <label for="save-as-default" class="flex cursor-pointer select-none items-center gap-2 text-sm text-text">
          <app-checkbox inputId="save-as-default" [(checked)]="saveAsDefault" />
          {{ labelKey | transloco }}
        </label>
      }
      <div class="flex justify-end gap-2">
        <app-button variant="ghost" [label]="'common.cancel' | transloco" (clicked)="cancel()" />
        <app-button variant="soft" tone="primary" [label]="'browse.sort.apply' | transloco" (clicked)="apply()" />
      </div>
    </div>
  `,
})
export class MultiSortDialogComponent {
  private readonly ref = inject(DynamicDialogRef);
  protected readonly data = inject(DynamicDialogConfig).data as MultiSortDialogData;
  protected readonly draft = signal<readonly BrowseSortTerm[]>([...this.data.terms]);
  protected readonly saveAsDefault = signal(false);

  protected apply(): void {
    const result: MultiSortDialogResult = {
      terms: [...this.draft()],
      saveAsDefault: this.saveAsDefault(),
    };
    this.ref.close(result);
  }

  protected cancel(): void {
    this.ref.close();
  }
}
