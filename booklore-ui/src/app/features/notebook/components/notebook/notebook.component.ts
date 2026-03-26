import {Component, computed, DestroyRef, inject, OnInit, signal} from '@angular/core';
import {DatePipe} from '@angular/common';
import {of, Subject} from 'rxjs';
import {debounceTime, switchMap} from 'rxjs/operators';
import {takeUntilDestroyed} from '@angular/core/rxjs-interop';
import {Popover} from 'primeng/popover';
import {Paginator} from 'primeng/paginator';
import {TranslocoDirective, TranslocoService} from '@jsverse/transloco';
import {NotebookService} from '../../service/notebook.service';
import {NotebookEntry, NotebookPage} from '../../model/notebook.model';
import {UrlHelperService} from '../../../../shared/service/url-helper.service';
import {PageTitleService} from '../../../../shared/service/page-title.service';
import {BrowsePageComponent} from '../../../../shared/components/browse/browse-page.component';
import {BrowseToolbarComponent} from '../../../../shared/components/browse/browse-toolbar.component';
import {SpinnerComponent} from '../../../../shared/components/ui/spinner/spinner';
import {SelectButtonComponent, SelectButtonOption} from '../../../../shared/components/ui/select-button/select-button';

interface BookGroup {
  bookId: number;
  bookTitle: string;
  thumbnailUrl: string;
  entries: NotebookEntry[];
}

interface BookOption {
  label: string;
  value: number;
}

interface SortOption {
  label: string;
  value: string;
}

const ALL_TYPES = ['HIGHLIGHT', 'NOTE', 'BOOKMARK'];

const EMPTY_PAGE: NotebookPage = {
  content: [],
  page: {totalElements: 0, totalPages: 0, number: 0, size: 0},
};

@Component({
  selector: 'app-notebook',
  standalone: true,
  imports: [
    DatePipe,
    Popover,
    Paginator,
    TranslocoDirective,
    BrowsePageComponent,
    BrowseToolbarComponent,
    SpinnerComponent,
    SelectButtonComponent,
  ],
  templateUrl: './notebook.component.html',
})
export class NotebookComponent implements OnInit {
  private readonly destroyRef = inject(DestroyRef);
  private readonly notebookService = inject(NotebookService);
  private readonly urlHelper = inject(UrlHelperService);
  private readonly pageTitle = inject(PageTitleService);
  private readonly t = inject(TranslocoService);

  private readonly loadTrigger$ = new Subject<void>();
  private readonly searchSubject = new Subject<void>();

  readonly searchTerm = signal('');
  readonly activeTypes = signal<string[]>([...ALL_TYPES]);
  readonly sortBy = signal('newest');
  readonly selectedBookId = signal<number | null>(null);
  readonly bookSearchText = signal('');
  readonly page = signal(0);
  readonly pageSize = signal(50);
  readonly first = signal(0);
  readonly loading = signal(true);
  readonly exporting = signal(false);
  readonly filteredGroups = signal<BookGroup[]>([]);
  readonly totalEntries = signal(0);
  readonly bookOptions = signal<BookOption[]>([]);

  typeFilterOptions: SelectButtonOption[] = [];
  sortOptions: SortOption[] = [];
  private collapsedGroups = new Set<number>();

  readonly filteredBookOptions = computed(() => {
    const search = this.bookSearchText().toLowerCase().trim();
    if (!search) return this.bookOptions();
    return this.bookOptions().filter(o => o.label.toLowerCase().includes(search));
  });

  readonly hasActiveFilters = computed(() =>
    this.activeTypes().length !== ALL_TYPES.length ||
    this.selectedBookId() !== null || this.searchTerm().trim().length > 0
  );

  get currentSortLabel(): string {
    return this.sortOptions.find(o => o.value === this.sortBy())?.label ?? 'Sort';
  }

  ngOnInit(): void {
    this.pageTitle.setPageTitle(this.t.translate('notebook.pageTitle'));

    this.typeFilterOptions = [
      {label: this.t.translate('notebook.filterHighlights'), value: 'HIGHLIGHT', icon: 'pi pi-highlighter'},
      {label: this.t.translate('notebook.filterNotes'), value: 'NOTE', icon: 'pi pi-file-edit'},
      {label: this.t.translate('notebook.filterBookmarks'), value: 'BOOKMARK', icon: 'pi pi-bookmark'},
    ];

    this.sortOptions = [
      {label: this.t.translate('notebook.sortNewest'), value: 'newest'},
      {label: this.t.translate('notebook.sortOldest'), value: 'oldest'},
    ];

    this.loadTrigger$.pipe(
      switchMap(() => {
        const types = this.activeTypes();
        if (types.length === 0) return of(EMPTY_PAGE);
        this.loading.set(true);
        return this.notebookService.getNotebookEntries(
          this.page(), this.pageSize(), types, this.selectedBookId(), this.searchTerm(), this.sortDirection
        );
      }),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(result => {
      this.totalEntries.set(result.page.totalElements);
      this.groupEntries(result.content);
      this.loading.set(false);
    });

    this.searchSubject.pipe(
      debounceTime(300),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(() => {
      this.page.set(0);
      this.first.set(0);
      this.loadTrigger$.next();
    });

    this.loadBooks();
    this.loadTrigger$.next();
  }

  onSearchChange(_value: string): void {
    this.searchSubject.next();
  }

  onTypeFilterChange(): void {
    this.triggerLoad();
  }

  onSortChange(value: string): void {
    this.sortBy.set(value);
    this.page.set(0);
    this.first.set(0);
    this.loadTrigger$.next();
  }

  onBookChange(bookId: number | null): void {
    this.selectedBookId.set(bookId);
    this.triggerLoad();
  }

  onBookSearchInput(event: Event): void {
    this.bookSearchText.set((event.target as HTMLInputElement).value);
  }

  clearBookFilter(): void {
    this.selectedBookId.set(null);
    this.triggerLoad();
  }

  onPageChange(event: {page?: number; first?: number; rows?: number}): void {
    this.page.set(event.page ?? 0);
    this.first.set(event.first ?? 0);
    this.pageSize.set(event.rows ?? this.pageSize());
    this.loadTrigger$.next();
  }

  toggleGroup(bookId: number): void {
    if (this.collapsedGroups.has(bookId)) {
      this.collapsedGroups.delete(bookId);
    } else {
      this.collapsedGroups.add(bookId);
    }
  }

  isGroupCollapsed(bookId: number): boolean {
    return this.collapsedGroups.has(bookId);
  }

  getTypeIcon(type: string): string {
    switch (type) {
      case 'HIGHLIGHT': return 'pi pi-highlighter';
      case 'NOTE': return 'pi pi-file-edit';
      case 'BOOKMARK': return 'pi pi-bookmark';
      default: return 'pi pi-circle';
    }
  }

  getTypeLabel(type: string): string {
    switch (type) {
      case 'HIGHLIGHT': return this.t.translate('notebook.highlight');
      case 'NOTE': return this.t.translate('notebook.note');
      case 'BOOKMARK': return this.t.translate('notebook.bookmark');
      default: return type;
    }
  }

  getTypeBadgeClass(type: string): string {
    switch (type) {
      case 'HIGHLIGHT': return 'text-amber-500 bg-amber-500/15';
      case 'NOTE': return 'text-blue-400 bg-blue-400/15';
      case 'BOOKMARK': return 'text-emerald-400 bg-emerald-400/15';
      default: return 'text-ink-muted bg-surface-hover';
    }
  }

  exportMarkdown(): void {
    const types = this.activeTypes();
    if (types.length === 0) return;

    this.exporting.set(true);
    this.notebookService.getExportEntries(
      types, this.selectedBookId(), this.searchTerm(), this.sortDirection
    ).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(entries => {
      this.generateMarkdownDownload(entries);
      this.exporting.set(false);
    });
  }

  private get sortDirection(): string {
    return this.sortBy() === 'newest' ? 'desc' : 'asc';
  }

  private triggerLoad(): void {
    this.page.set(0);
    this.first.set(0);
    this.loadTrigger$.next();
  }

  private loadBooks(): void {
    this.notebookService.getBooksWithAnnotations()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(books => {
        this.bookOptions.set(books.map(b => ({label: b.bookTitle, value: b.bookId})));
      });
  }

  private groupEntries(entries: NotebookEntry[]): void {
    const groupMap = new Map<number, BookGroup>();
    for (const entry of entries) {
      if (!groupMap.has(entry.bookId)) {
        const isAudiobook = entry.primaryBookType === 'AUDIOBOOK';
        groupMap.set(entry.bookId, {
          bookId: entry.bookId,
          bookTitle: entry.bookTitle,
          thumbnailUrl: isAudiobook
            ? this.urlHelper.getAudiobookThumbnailUrl(entry.bookId)
            : this.urlHelper.getDirectThumbnailUrl(entry.bookId),
          entries: [],
        });
      }
      groupMap.get(entry.bookId)!.entries.push(entry);
    }
    this.filteredGroups.set(Array.from(groupMap.values()));
  }

  private generateMarkdownDownload(entries: NotebookEntry[]): void {
    const groupMap = new Map<number, {bookTitle: string; entries: NotebookEntry[]}>();
    for (const entry of entries) {
      if (!groupMap.has(entry.bookId)) {
        groupMap.set(entry.bookId, {bookTitle: entry.bookTitle, entries: []});
      }
      groupMap.get(entry.bookId)!.entries.push(entry);
    }

    let md = '# Notebook Export\n\n';
    for (const group of groupMap.values()) {
      md += `## ${group.bookTitle}\n\n`;
      let currentChapter = '';
      for (const entry of group.entries) {
        if (entry.chapterTitle && entry.chapterTitle !== currentChapter) {
          currentChapter = entry.chapterTitle;
          md += `### ${currentChapter}\n\n`;
        }
        if (entry.text) {
          md += `> ${entry.text}\n\n`;
        }
        if (entry.note) {
          md += `**Note:** ${entry.note}\n\n`;
        }
        md += '---\n\n';
      }
    }

    const blob = new Blob([md], {type: 'text/markdown'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'notebook-export.md';
    a.click();
    URL.revokeObjectURL(url);
  }
}
