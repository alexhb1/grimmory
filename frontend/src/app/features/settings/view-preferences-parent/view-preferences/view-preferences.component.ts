import {Component, computed, DestroyRef, effect, inject, Injector, OnInit} from '@angular/core';
import {injectQuery} from '@tanstack/angular-query-experimental';
import {takeUntilDestroyed} from '@angular/core/rxjs-interop';
import {Button} from 'primeng/button';

import {MessageService} from 'primeng/api';
import {Select} from 'primeng/select';
import {TableModule} from 'primeng/table';
import {SortCriterion, User, UserService} from '../../user-management/user.service';
import {LibraryService} from '../../../book/service/library.service';
import {ShelfService} from '../../../book/service/shelf.service';
import {MagicShelfService} from '../../../magic-shelf/service/magic-shelf.service';
import {FormsModule} from '@angular/forms';

import {Tooltip} from 'primeng/tooltip';
import {ToggleSwitch} from 'primeng/toggleswitch';
import {TranslocoDirective, TranslocoService} from '@jsverse/transloco';
import {take} from 'rxjs/operators';

import {DialogLauncherService} from '../../../../shared/services/dialog-launcher.service';
import {
  EMPTY_FACET_SELECTION,
  isBookQuerySortKey,
  type BookSortTerm,
} from '../../../book/data/book-query-params';
import {BookQueryService} from '../../../book/data/book-query.service';
import {buildSortOptions} from '../../../book/browse/book-browse-sort.config';
import {type MultiSortDialogResult} from '../../../book/browse/multi-sort-dialog.component';
import {MultiSortEditorComponent} from '../../../book/browse/multi-sort-editor.component';

@Component({
  selector: 'app-view-preferences',
  standalone: true,
  imports: [
    Select,
    FormsModule,
    Button,
    TableModule,
    Tooltip,
    ToggleSwitch,
    TranslocoDirective,
    MultiSortEditorComponent
  ],
  templateUrl: './view-preferences.component.html',
  styleUrl: './view-preferences.component.scss'
})
export class ViewPreferencesComponent implements OnInit {
  private t = inject(TranslocoService);

  entityTypeOptions: {label: string; value: string; translationKey: string}[] = [];

  viewModeOptions: {label: string; value: string; translationKey: string}[] = [];

  get libraryOptions(): { label: string; value: number }[] {
    return this.libraryService.libraries()
      .filter(library => library.id !== undefined)
      .map(library => ({label: library.name, value: library.id!}));
  }
  get shelfOptions(): { label: string; value: number }[] {
    return this.shelfService.shelves()
      .filter(shelf => shelf.id !== undefined)
      .map(shelf => ({label: shelf.name, value: shelf.id!}));
  }
  get magicShelfOptions(): { label: string; value: number }[] {
    return this.magicShelfService.shelves()
      .filter(shelf => shelf.id !== undefined)
      .map(shelf => ({label: shelf.name, value: shelf.id!}));
  }

  selectedSort: string = 'title';
  selectedSortDir: 'ASC' | 'DESC' = 'ASC';
  selectedView: 'GRID' | 'TABLE' = 'GRID';
  autoSaveMetadata: boolean = false;
  sortCriteria: SortCriterion[] = [];
  globalSortTerms: readonly BookSortTerm[] = [];

  private readonly bookQuery = inject(BookQueryService);
  private readonly sortVocabularyQuery = injectQuery(() =>
    this.bookQuery.facets({facets: EMPTY_FACET_SELECTION}));
  readonly editorSortOptions = computed(() => {
    const sortGroup = this.sortVocabularyQuery.data()?.find(group => group.rel === 'sort');
    const seen = new Set<string>();
    const tokens = (sortGroup?.values ?? []).flatMap(link => {
      if (!link.value || seen.has(link.value)) {
        return [];
      }
      seen.add(link.value);
      return [link.value];
    });
    return buildSortOptions(tokens);
  });

  overrides: {
    entityType: 'LIBRARY' | 'SHELF' | 'MAGIC_SHELF';
    library: number;
    sort: string;
    sortDir: 'ASC' | 'DESC';
    sortCriteria: SortCriterion[];
    view: 'GRID' | 'TABLE';
  }[] = [];

  private user: User | null = null;
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);

  private libraryService = inject(LibraryService);
  private shelfService = inject(ShelfService);
  private magicShelfService = inject(MagicShelfService);
  private userService = inject(UserService);
  private messageService = inject(MessageService);
  private readonly dialogLauncher = inject(DialogLauncherService);
  private readonly currentUser = this.userService.currentUser;
  private hasInitializedPreferences = false;

  ngOnInit(): void {
    this.rebuildTranslatedLabels();
    this.t.langChanges$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.rebuildTranslatedLabels();
    });

    effect(() => {
      const user = this.currentUser();
      if (this.hasInitializedPreferences || !user) {
        return;
      }

      this.hasInitializedPreferences = true;
      this.user = user;
      const prefs = user.userSettings?.entityViewPreferences;
      const global = prefs?.global;
      this.selectedSort = global?.sortKey ?? 'title';
      this.selectedSortDir = global?.sortDir ?? 'ASC';
      this.selectedView = global?.view ?? 'GRID';
      this.autoSaveMetadata = user.userSettings?.autoSaveMetadata ?? false;

      if (global?.sortCriteria && global.sortCriteria.length > 0) {
        this.sortCriteria = [...global.sortCriteria];
      } else {
        this.sortCriteria = [{field: this.selectedSort, direction: this.selectedSortDir}];
      }
      this.globalSortTerms = this.toTerms(this.sortCriteria);

      this.overrides = (prefs?.overrides ?? []).map(override => {
        const sortCriteria = override.preferences.sortCriteria?.length
          ? [...override.preferences.sortCriteria]
          : [{field: override.preferences.sortKey, direction: override.preferences.sortDir ?? 'ASC'} as SortCriterion];
        return {
          entityType: override.entityType,
          library: override.entityId,
          sort: override.preferences.sortKey,
          sortDir: override.preferences.sortDir ?? 'ASC',
          sortCriteria,
          view: override.preferences.view ?? 'GRID'
        };
      });
    }, {injector: this.injector});
  }

  private rebuildTranslatedLabels(): void {
    this.entityTypeOptions = [
      {label: this.t.translate('settingsView.librarySort.entityLibrary'), value: 'LIBRARY', translationKey: 'entityLibrary'},
      {label: this.t.translate('settingsView.librarySort.entityShelf'), value: 'SHELF', translationKey: 'entityShelf'},
      {label: this.t.translate('settingsView.librarySort.entityMagicShelf'), value: 'MAGIC_SHELF', translationKey: 'entityMagicShelf'}
    ];
    this.viewModeOptions = [
      {label: this.t.translate('settingsView.librarySort.viewGrid'), value: 'GRID', translationKey: 'viewGrid'},
      {label: this.t.translate('settingsView.librarySort.viewTable'), value: 'TABLE', translationKey: 'viewTable'}
    ];
  }

  getAvailableEntities(index: number, type: 'LIBRARY' | 'SHELF' | 'MAGIC_SHELF') {
    const selected = this.overrides.map((o, i) => i !== index ? o.library : null);
    let source: { label: string; value: number }[];
    switch (type) {
      case 'LIBRARY':
        source = this.libraryOptions;
        break;
      case 'SHELF':
        source = this.shelfOptions;
        break;
      case 'MAGIC_SHELF':
        source = this.magicShelfOptions;
        break;
      default:
        source = [];
    }
    return source.filter(opt => !selected.includes(opt.value) || this.overrides[index]?.library === opt.value);
  }

  get availableLibraries() {
    const used = new Set(this.overrides.map(o => `${o.entityType}_${o.library}`));

    const withEntityType = (options: { label: string; value: number }[], entityType: 'LIBRARY' | 'SHELF' | 'MAGIC_SHELF') =>
      options.map(opt => ({...opt, entityType}));

    return [...withEntityType(this.libraryOptions, 'LIBRARY'),
      ...withEntityType(this.shelfOptions, 'SHELF'),
      ...withEntityType(this.magicShelfOptions, 'MAGIC_SHELF')]
      .filter(opt => !used.has(`${opt.entityType}_${opt.value}`));
  }

  addOverride(): void {
    const next = this.availableLibraries[0];
    if (next) {
      this.overrides.push({
        entityType: next.entityType,
        library: next.value,
        sort: 'title',
        sortDir: 'ASC',
        sortCriteria: [{field: 'title', direction: 'ASC'}],
        view: 'GRID'
      });
    }
  }

  removeOverride(index: number): void {
    this.overrides.splice(index, 1);
  }

  // Conversion helpers
  private toTerms(criteria: SortCriterion[]): BookSortTerm[] {
    return criteria.flatMap((criterion): BookSortTerm[] => isBookQuerySortKey(criterion.field)
      ? [{
          key: criterion.field,
          direction: criterion.direction === 'ASC' ? 'asc' : 'desc',
        }]
      : []);
  }

  private fromTerms(terms: readonly BookSortTerm[]): SortCriterion[] {
    return terms.map(term => ({
      field: term.key,
      direction: term.direction === 'asc' ? 'ASC' as const : 'DESC' as const,
    }));
  }

  onGlobalSortTermsChange(terms: readonly BookSortTerm[]): void {
    this.globalSortTerms = terms;
    this.sortCriteria = this.fromTerms(terms);
    this.syncLegacySort();
  }

  async editOverrideSort(index: number): Promise<void> {
    const override = this.overrides[index];
    const ref = await this.dialogLauncher.openMultiSortDialog({
      terms: this.toTerms(override.sortCriteria),
      options: this.editorSortOptions(),
    });
    ref?.onClose.pipe(take(1)).subscribe((result?: MultiSortDialogResult) => {
      if (!result) {
        return;
      }
      const criteria = this.fromTerms(result.terms);
      override.sortCriteria = criteria;
      override.sort = criteria[0]?.field ?? 'title';
      override.sortDir = criteria[0]?.direction ?? 'ASC';
    });
  }

  private syncLegacySort(): void {
    if (this.sortCriteria.length > 0) {
      this.selectedSort = this.sortCriteria[0].field;
      this.selectedSortDir = this.sortCriteria[0].direction;
    }
  }

  saveSettings(): void {
    if (!this.user) return;

    const prefs = structuredClone(this.user.userSettings.entityViewPreferences ?? {});

    prefs.global = {
      ...prefs.global,
      sortKey: this.selectedSort,
      sortDir: this.selectedSortDir,
      sortCriteria: [...this.sortCriteria],
      view: this.selectedView
    };

    prefs.overrides = this.overrides.map(o => {
      const existing = prefs.overrides?.find(p =>
        p.entityId === o.library && p.entityType === o.entityType
      )?.preferences;

      return {
        entityType: o.entityType,
        entityId: o.library,
        preferences: {
          sortKey: o.sortCriteria[0]?.field ?? o.sort,
          sortDir: o.sortCriteria[0]?.direction ?? o.sortDir,
          sortCriteria: [...o.sortCriteria],
          view: o.view,
          coverSize: existing?.coverSize ?? 1.0,
          seriesCollapsed: existing?.seriesCollapsed ?? false,
          overlayBookType: existing?.overlayBookType ?? true
        }
      };
    });

    this.userService.updateUserSetting(this.user.id, 'entityViewPreferences', prefs);
    this.userService.updateUserSetting(this.user.id, 'autoSaveMetadata', this.autoSaveMetadata);

    this.messageService.add({
      severity: 'success',
      summary: this.t.translate('settingsView.librarySort.saveSuccess'),
      detail: this.t.translate('settingsView.librarySort.saveSuccessDetail')
    });
  }
}
