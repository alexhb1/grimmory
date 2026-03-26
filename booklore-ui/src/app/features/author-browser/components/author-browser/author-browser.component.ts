import {Component, computed, DestroyRef, effect, inject, OnInit, signal} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {Slider} from 'primeng/slider';
import {Popover} from 'primeng/popover';
import {Paginator} from 'primeng/paginator';
import {Select} from 'primeng/select';
import {Tooltip} from 'primeng/tooltip';
import {TranslocoDirective, TranslocoService} from '@jsverse/transloco';
import {MessageService} from 'primeng/api';
import {AuthorService} from '../../service/author.service';
import {AuthorSummary, EnrichedAuthor, AuthorFilters, DEFAULT_AUTHOR_FILTERS} from '../../model/author.model';
import {AuthorCardComponent} from '../author-card/author-card.component';
import {AuthorScalePreferenceService} from '../../service/author-scale-preference.service';
import {AuthorSelectionService, AuthorCheckboxClickEvent} from '../../service/author-selection.service';
import {PageTitleService} from '../../../../shared/service/page-title.service';
import {ActivatedRoute, Router} from '@angular/router';
import {UserService} from '../../../settings/user-management/user.service';
import {BookService} from '../../../book/service/book.service';
import {Book, ReadStatus} from '../../../book/model/book.model';
import {BrowsePageComponent} from '../../../../shared/components/browse/browse-page.component';
import {BrowseToolbarComponent} from '../../../../shared/components/browse/browse-toolbar.component';
import {BrowseGridComponent} from '../../../../shared/components/browse/browse-grid.component';
import {SpinnerComponent} from '../../../../shared/components/ui/spinner/spinner';

interface SortOption {
  label: string;
  value: string;
}

interface FilterOption {
  label: string;
  value: string;
}

@Component({
  selector: 'app-author-browser',
  standalone: true,
  templateUrl: './author-browser.component.html',
  imports: [
    FormsModule,
    Slider,
    Popover,
    Paginator,
    Select,
    Tooltip,
    TranslocoDirective,
    AuthorCardComponent,
    BrowsePageComponent,
    BrowseToolbarComponent,
    BrowseGridComponent,
    SpinnerComponent
  ]
})
export class AuthorBrowserComponent implements OnInit {

  private authorService = inject(AuthorService);
  private bookService = inject(BookService);
  private messageService = inject(MessageService);
  private pageTitle = inject(PageTitleService);
  private t = inject(TranslocoService);
  private router = inject(Router);
  private activatedRoute = inject(ActivatedRoute);
  private destroyRef = inject(DestroyRef);
  protected userService = inject(UserService);
  protected authorScaleService = inject(AuthorScalePreferenceService);
  protected selectionService = inject(AuthorSelectionService);

  thumbnailCacheBusters = new Map<number, number>();
  private selectedAuthors = this.selectionService.selectedAuthors;
  private allAuthorsState = signal<AuthorSummary[] | null>(null);

  loading = computed(() => this.allAuthorsState() === null || this.bookService.isBooksLoading());
  protected currentUser = this.userService.currentUser;
  selectedCount = computed(() => this.selectedAuthors().size);

  readonly searchTerm = signal('');
  readonly sortBy = signal('name-asc');
  readonly filters = signal<AuthorFilters>({...DEFAULT_AUTHOR_FILTERS});
  readonly pageFirst = signal(0);
  readonly pageRows = signal(50);

  sortOptions: SortOption[] = [];

  private enrichedAuthors = computed(() => {
    const authors = this.allAuthorsState();
    if (!authors) return [];
    return this.enrichAuthors(authors, this.bookService.books());
  });

  libraryOptions = computed<FilterOption[]>(() => {
    const allLabel = this.t.translate('authorBrowser.filters.all');
    const librarySet = new Set<string>();
    for (const author of this.enrichedAuthors()) {
      for (const library of author.libraryNames) {
        librarySet.add(library);
      }
    }
    return [
      {label: allLabel, value: 'all'},
      ...[...librarySet].sort().map(library => ({label: library, value: library}))
    ];
  });

  genreOptions = computed<FilterOption[]>(() => {
    const allLabel = this.t.translate('authorBrowser.filters.all');
    const genreSet = new Set<string>();
    for (const author of this.enrichedAuthors()) {
      for (const category of author.categories) {
        genreSet.add(category);
      }
    }
    return [
      {label: allLabel, value: 'all'},
      ...[...genreSet].sort().map(category => ({label: category, value: category}))
    ];
  });

  activeFilterCount = computed(() => {
    const filters = this.filters();
    let count = 0;
    if (filters.matchStatus !== 'all') count++;
    if (filters.photoStatus !== 'all') count++;
    if (filters.readStatus !== 'all') count++;
    if (filters.bookCount !== 'all') count++;
    if (filters.library !== 'all') count++;
    if (filters.genre !== 'all') count++;
    return count;
  });

  filteredAuthors = computed<EnrichedAuthor[]>(() => {
    let result = this.enrichedAuthors();
    const search = this.searchTerm().trim().toLowerCase();
    if (search) {
      result = result.filter(author => author.name.toLowerCase().includes(search));
    }
    result = this.applyFilters(result, this.filters());
    return this.applySort(result, this.sortBy());
  });

  readonly pagedAuthors = computed(() => {
    const all = this.filteredAuthors();
    const start = this.pageFirst();
    return all.slice(start, start + this.pageRows());
  });

  private readonly syncAuthorsEffect = effect(() => {
    const authors = this.authorService.allAuthors();
    if (authors !== null) {
      this.allAuthorsState.set(authors);
    }
  });

  private readonly syncSelectionEffect = effect(() => {
    this.selectionService.setCurrentAuthors(this.filteredAuthors());
  });

  get currentSortLabel(): string {
    const current = this.sortBy();
    return this.sortOptions.find(o => o.value === current)?.label ?? 'Sort';
  }

  get canEditMetadata(): boolean {
    const user = this.userService.currentUser();
    return !!user?.permissions?.admin || !!user?.permissions?.canEditMetadata;
  }

  get canDeleteBook(): boolean {
    const user = this.userService.currentUser();
    return !!user?.permissions?.admin || !!user?.permissions?.canDeleteBook;
  }

  ngOnInit(): void {
    this.pageTitle.setPageTitle(this.t.translate('authorBrowser.pageTitle'));

    this.sortOptions = [
      {label: this.t.translate('authorBrowser.sort.nameAsc'), value: 'name-asc'},
      {label: this.t.translate('authorBrowser.sort.nameDesc'), value: 'name-desc'},
      {label: this.t.translate('authorBrowser.sort.bookCount'), value: 'book-count'},
      {label: this.t.translate('authorBrowser.sort.matched'), value: 'matched'},
      {label: this.t.translate('authorBrowser.sort.recentlyAdded'), value: 'recently-added'},
      {label: this.t.translate('authorBrowser.sort.recentlyRead'), value: 'recently-read'},
      {label: this.t.translate('authorBrowser.sort.readingProgress'), value: 'reading-progress'},
      {label: this.t.translate('authorBrowser.sort.avgRating'), value: 'avg-rating'},
      {label: this.t.translate('authorBrowser.sort.photo'), value: 'photo'},
      {label: this.t.translate('authorBrowser.sort.seriesCount'), value: 'series-count'}
    ];

    const sortParam = this.activatedRoute.snapshot.queryParamMap.get('sort');
    if (sortParam && this.sortOptions.some(o => o.value === sortParam)) {
      this.sortBy.set(sortParam);
    }

    this.destroyRef.onDestroy(() => this.selectionService.deselectAll());
  }

  onSearchChange(value: string): void {
    this.searchTerm.set(value);
    this.pageFirst.set(0);
  }

  onSortChange(value: string): void {
    this.sortBy.set(value);
    this.pageFirst.set(0);
    this.router.navigate([], {
      queryParams: {sort: value},
      queryParamsHandling: 'merge',
      replaceUrl: true
    });
  }

  onFilterChange(key: keyof AuthorFilters, value: string): void {
    this.filters.update(current => ({...current, [key]: value}));
    this.pageFirst.set(0);
  }

  resetFilters(): void {
    this.filters.set({...DEFAULT_AUTHOR_FILTERS});
    this.pageFirst.set(0);
  }

  onPageChange(event: { first?: number; rows?: number }): void {
    if (event.first != null) this.pageFirst.set(event.first);
    if (event.rows != null) this.pageRows.set(event.rows);
  }

  isAuthorSelected(authorId: number): boolean {
    return this.selectedAuthors().has(authorId);
  }

  onCheckboxClicked(event: AuthorCheckboxClickEvent): void {
    this.selectionService.handleCheckboxClick(event);
  }

  selectAllAuthors(): void {
    this.selectionService.selectAll();
  }

  deselectAllAuthors(): void {
    this.selectionService.deselectAll();
  }

  navigateToAuthor(author: AuthorSummary): void {
    this.router.navigate(['/author', author.id]);
  }

  navigateToAuthorEdit(author: AuthorSummary): void {
    this.router.navigate(['/author', author.id], {queryParams: {tab: 'edit'}});
  }

  deleteAuthor(author: AuthorSummary): void {
    this.authorService.deleteAuthors([author.id]).subscribe({
      next: () => {
        this.removeAuthorsFromList([author.id]);
        this.messageService.add({
          severity: 'success',
          summary: this.t.translate('authorBrowser.toast.deleteSuccessSummary'),
          detail: this.t.translate('authorBrowser.toast.deleteSuccessDetail')
        });
      },
      error: () => {
        this.messageService.add({
          severity: 'error',
          summary: this.t.translate('authorBrowser.toast.deleteFailedSummary'),
          detail: this.t.translate('authorBrowser.toast.deleteFailedDetail')
        });
      }
    });
  }

  onAuthorQuickMatched(updated: AuthorSummary): void {
    this.thumbnailCacheBusters.set(updated.id, Date.now());
    this.allAuthorsState.update(current =>
      (current ?? []).map(author => author.id === updated.id ? updated : author)
    );
  }

  autoMatchSelected(): void {
    const ids = this.selectionService.getSelectedIds();
    this.selectionService.deselectAll();
    this.authorService.autoMatchAuthors(ids).subscribe({
      next: (matched) => {
        this.thumbnailCacheBusters.set(matched.id, Date.now());
        this.allAuthorsState.update(current => (current ?? []).map(author => author.id === matched.id
          ? {...author, asin: matched.asin, hasPhoto: matched.hasPhoto}
          : author
        ));
      },
      complete: () => {
        this.messageService.add({
          severity: 'success',
          summary: this.t.translate('authorBrowser.toast.autoMatchSuccessSummary'),
          detail: this.t.translate('authorBrowser.toast.autoMatchSuccessDetail')
        });
      },
      error: () => {
        this.messageService.add({
          severity: 'error',
          summary: this.t.translate('authorBrowser.toast.autoMatchFailedSummary'),
          detail: this.t.translate('authorBrowser.toast.autoMatchFailedDetail')
        });
      }
    });
  }

  deleteSelected(): void {
    const ids = this.selectionService.getSelectedIds();
    this.authorService.deleteAuthors(ids).subscribe({
      next: () => {
        this.selectionService.deselectAll();
        this.removeAuthorsFromList(ids);
        this.messageService.add({
          severity: 'success',
          summary: this.t.translate('authorBrowser.toast.deleteSelectedSuccessSummary'),
          detail: this.t.translate('authorBrowser.toast.deleteSelectedSuccessDetail')
        });
      },
      error: () => {
        this.messageService.add({
          severity: 'error',
          summary: this.t.translate('authorBrowser.toast.deleteFailedSummary'),
          detail: this.t.translate('authorBrowser.toast.deleteFailedDetail')
        });
      }
    });
  }

  private enrichAuthors(authors: AuthorSummary[], books: Book[]): EnrichedAuthor[] {
    const booksByAuthor = new Map<string, Book[]>();
    for (const book of books) {
      if (book.metadata?.authors) {
        for (const authorName of book.metadata.authors) {
          const key = authorName.toLowerCase();
          let list = booksByAuthor.get(key);
          if (!list) {
            list = [];
            booksByAuthor.set(key, list);
          }
          list.push(book);
        }
      }
    }

    return authors.map(author => {
      const authorBooks = booksByAuthor.get(author.name.toLowerCase()) || [];

      const libraryIds = new Set<number>();
      const libraryNameSet = new Set<string>();
      const categorySet = new Set<string>();
      const seriesSet = new Set<string>();
      let latestAddedOn: string | null = null;
      let lastReadTime: string | null = null;
      let readCount = 0;
      let inProgressCount = 0;
      let ratingSum = 0;
      let ratingCount = 0;

      for (const book of authorBooks) {
        libraryIds.add(book.libraryId);
        if (book.libraryName) libraryNameSet.add(book.libraryName);

        if (book.metadata?.categories) {
          for (const cat of book.metadata.categories) categorySet.add(cat);
        }
        if (book.metadata?.seriesName) {
          seriesSet.add(book.metadata.seriesName.toLowerCase());
        }
        if (book.addedOn && (!latestAddedOn || book.addedOn > latestAddedOn)) {
          latestAddedOn = book.addedOn;
        }
        if (book.lastReadTime && (!lastReadTime || book.lastReadTime > lastReadTime)) {
          lastReadTime = book.lastReadTime;
        }
        if (book.readStatus === ReadStatus.READ) readCount++;
        if (book.readStatus === ReadStatus.READING || book.readStatus === ReadStatus.RE_READING) inProgressCount++;
        if (book.personalRating != null) {
          ratingSum += book.personalRating;
          ratingCount++;
        }
      }

      const totalBooks = authorBooks.length;
      let readStatus: EnrichedAuthor['readStatus'] = 'unread';
      if (totalBooks > 0) {
        if (readCount === totalBooks) {
          readStatus = 'all-read';
        } else if (inProgressCount > 0) {
          readStatus = 'in-progress';
        } else if (readCount > 0) {
          readStatus = 'some-read';
        }
      }

      return {
        ...author,
        libraryIds,
        libraryNames: [...libraryNameSet].sort(),
        categories: [...categorySet].sort(),
        readStatus,
        hasSeries: seriesSet.size > 0,
        seriesCount: seriesSet.size,
        latestAddedOn,
        lastReadTime,
        readingProgress: totalBooks > 0 ? Math.round((readCount / totalBooks) * 100) : 0,
        avgPersonalRating: ratingCount > 0 ? ratingSum / ratingCount : null
      };
    });
  }

  private applyFilters(authors: EnrichedAuthor[], filters: AuthorFilters): EnrichedAuthor[] {
    return authors.filter(a => {
      if (filters.matchStatus === 'matched' && !a.asin) return false;
      if (filters.matchStatus === 'unmatched' && a.asin) return false;

      if (filters.photoStatus === 'has-photo' && !a.hasPhoto) return false;
      if (filters.photoStatus === 'no-photo' && a.hasPhoto) return false;

      if (filters.readStatus !== 'all' && a.readStatus !== filters.readStatus) return false;

      if (filters.bookCount !== 'all') {
        const c = a.bookCount;
        switch (filters.bookCount) {
          case '0': if (c !== 0) return false; break;
          case '1': if (c !== 1) return false; break;
          case '2': if (c !== 2) return false; break;
          case '3': if (c !== 3) return false; break;
          case '4': if (c !== 4) return false; break;
          case '5': if (c !== 5) return false; break;
          case '6-10': if (c < 6 || c > 10) return false; break;
          case '11-20': if (c < 11 || c > 20) return false; break;
          case '21-35': if (c < 21 || c > 35) return false; break;
          case '36+': if (c < 36) return false; break;
        }
      }

      if (filters.library !== 'all' && !a.libraryNames.includes(filters.library)) return false;
      if (filters.genre !== 'all' && !a.categories.includes(filters.genre)) return false;

      return true;
    });
  }

  private removeAuthorsFromList(ids: number[]): void {
    const idSet = new Set(ids);
    this.allAuthorsState.update(current => (current ?? []).filter(author => !idSet.has(author.id)));
  }

  private applySort(authors: EnrichedAuthor[], sortBy: string): EnrichedAuthor[] {
    const sorted = [...authors];
    switch (sortBy) {
      case 'name-asc':
        return sorted.sort((a, b) => a.name.localeCompare(b.name));
      case 'name-desc':
        return sorted.sort((a, b) => b.name.localeCompare(a.name));
      case 'book-count':
        return sorted.sort((a, b) => b.bookCount - a.bookCount);
      case 'matched':
        return sorted.sort((a, b) => {
          const aVal = a.asin ? 1 : 0;
          const bVal = b.asin ? 1 : 0;
          if (aVal !== bVal) return bVal - aVal;
          return a.name.localeCompare(b.name);
        });
      case 'recently-added':
        return sorted.sort((a, b) => {
          if (!a.latestAddedOn && !b.latestAddedOn) return a.name.localeCompare(b.name);
          if (!a.latestAddedOn) return 1;
          if (!b.latestAddedOn) return -1;
          return b.latestAddedOn.localeCompare(a.latestAddedOn);
        });
      case 'recently-read':
        return sorted.sort((a, b) => {
          if (!a.lastReadTime && !b.lastReadTime) return a.name.localeCompare(b.name);
          if (!a.lastReadTime) return 1;
          if (!b.lastReadTime) return -1;
          return b.lastReadTime.localeCompare(a.lastReadTime);
        });
      case 'reading-progress':
        return sorted.sort((a, b) => b.readingProgress - a.readingProgress);
      case 'avg-rating':
        return sorted.sort((a, b) => {
          if (a.avgPersonalRating == null && b.avgPersonalRating == null) return a.name.localeCompare(b.name);
          if (a.avgPersonalRating == null) return 1;
          if (b.avgPersonalRating == null) return -1;
          return b.avgPersonalRating - a.avgPersonalRating;
        });
      case 'photo':
        return sorted.sort((a, b) => {
          const aVal = a.hasPhoto ? 1 : 0;
          const bVal = b.hasPhoto ? 1 : 0;
          if (aVal !== bVal) return bVal - aVal;
          return a.name.localeCompare(b.name);
        });
      case 'series-count':
        return sorted.sort((a, b) => b.seriesCount - a.seriesCount);
      default:
        return sorted;
    }
  }
}
