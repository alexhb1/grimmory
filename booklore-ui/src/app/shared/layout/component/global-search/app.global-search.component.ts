import {
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  HostListener,
  inject,
  signal,
  viewChild,
  viewChildren,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NavigationStart, Router } from '@angular/router';
import { toObservable, toSignal, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { debounceTime, distinctUntilChanged, filter } from 'rxjs/operators';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { Book } from '../../../../features/book/model/book.model';
import { BookService } from '../../../../features/book/service/book.service';
import { filterBooksBySearchTerm, normalizeSearchTerm } from '../../../../features/book/components/book-browser/filters/HeaderFilter';
import { LibraryService } from '../../../../features/book/service/library.service';
import { ShelfService } from '../../../../features/book/service/shelf.service';
import { MagicShelfService } from '../../../../features/magic-shelf/service/magic-shelf.service';
import { AuthorService } from '../../../../features/author-browser/service/author.service';
import { SeriesDataService } from '../../../../features/series-browser/service/series-data.service';
import { UserService } from '../../../../features/settings/user-management/user.service';
import { UrlHelperService } from '../../../service/url-helper.service';
import { CoverPlaceholderComponent } from '../../../components/cover-generator/cover-generator.component';
import { IconFieldComponent } from '../../../components/ui/icon-field/icon-field';
import { GlobalSearchService } from './global-search.service';
import { IconDisplayComponent } from '../../../components/icon-display/icon-display.component';
import { IconSelection } from '../../../service/icon-picker.service';

type SearchResultKind =
  | 'book'
  | 'author'
  | 'series'
  | 'page'
  | 'tool'
  | 'library'
  | 'shelf'
  | 'magic-shelf';

interface BaseSearchResult {
  id: string;
  kind: SearchResultKind;
  title: string;
  subtitle: string;
  keywords: string[];
  icon: IconSelection | null;
  score: number;
  execute: () => void;
}

interface BookSearchResult extends BaseSearchResult {
  kind: 'book';
  book: Book;
}

interface CommandSearchResult extends BaseSearchResult {
  kind: Exclude<SearchResultKind, 'book'>;
}

type SearchResult = BookSearchResult | CommandSearchResult;

@Component({
  selector: 'app-global-search',
  standalone: true,
  imports: [
    FormsModule,
    TranslocoDirective,
    CoverPlaceholderComponent,
    IconFieldComponent,
    IconDisplayComponent,
  ],
  template: `
    <ng-container *transloco="let t; prefix: 'book.searcher'">
      @if (showOverlay()) {
        <div
          class="fixed inset-0 z-[140]"
          [class]="closing() ? 'fixed inset-0 z-[140] search-overlay-exit' : 'fixed inset-0 z-[140] search-overlay-enter'"
          (animationend)="$event.target === $event.currentTarget && onCloseAnimationEnd()"
        >
          <div
            class="absolute inset-0 bg-black/10"
            aria-hidden="true"
          ></div>

          <div
            class="relative flex min-h-full items-start justify-center p-4 pt-[12vh] sm:p-6 sm:pt-[16vh]"
            (click)="close()"
          >
            <div
              [class]="closing() ? 'relative w-full max-w-3xl search-dialog-exit' : 'relative w-full max-w-3xl search-dialog-enter'"
              role="dialog"
              aria-modal="true"
              [attr.aria-label]="t('placeholder')"
              (click)="$event.stopPropagation()"
            >
              <app-icon-field>
                <svg
                  icon
                  class="w-4 h-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <circle cx="11" cy="11" r="8"></circle>
                  <path d="m21 21-4.3-4.3"></path>
                </svg>

                <input
                  #searchInput
                  type="text"
                  autocomplete="off"
                  class="h-11 w-full rounded-[6px] bg-surface-raised pl-10 pr-24 text-base text-ink shadow-[0_22px_70px_rgba(0,0,0,0.18),0_8px_24px_rgba(0,0,0,0.14)] outline-none transition-all placeholder:text-ink-muted focus:outline-none focus:ring-0 focus:shadow-[0_30px_90px_rgba(0,0,0,0.22),0_12px_32px_rgba(0,0,0,0.16)]"
                  style="height: 2.75rem"
                  [ngModel]="searchQuery()"
                  (ngModelChange)="onSearchQueryChange($event)"
                  [placeholder]="t('placeholder')"
                />
              </app-icon-field>

              <div class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
                @if (hasQuery()) {
                  <span
                    class="inline-flex items-center rounded-[6px] border border-edge bg-surface px-2 py-1 text-[11px] font-medium uppercase tracking-[0.16em] text-ink-muted"
                  >
                    Esc
                  </span>
                }
              </div>

              @if (showDropdown()) {
              <div class="mt-3 max-h-[min(68vh,36rem)] overflow-y-auto rounded-[6px] bg-surface-raised shadow-[0_22px_70px_rgba(0,0,0,0.18),0_8px_24px_rgba(0,0,0,0.14)] animate-[0.12s_ease_both_slide-in]">
                @if (results().length === 0 && isLoading()) {
                  <div class="p-3 sm:p-4">
                    @for (i of [1, 2, 3, 4]; track i) {
                      <div class="flex items-start gap-3 rounded-[6px] px-3 py-3">
                        <div class="h-[72px] w-[52px] shrink-0 rounded-[8px] bg-surface-raised animate-pulse"></div>
                        <div class="flex-1 space-y-2 pt-1">
                          <div class="h-4 w-2/3 rounded bg-surface-raised animate-pulse"></div>
                          <div class="h-3 w-1/2 rounded bg-surface-raised animate-pulse"></div>
                          <div class="h-3 w-1/3 rounded bg-surface-raised animate-pulse"></div>
                        </div>
                      </div>
                    }
                  </div>
                } @else if (results().length > 0) {
                  <div class="px-2 py-2 divide-y divide-edge-light">
                    @for (result of results(); track result.id; let idx = $index) {
                      <button
                        #resultItem
                        type="button"
                        class="flex w-full items-start gap-3 rounded-[6px] px-3 py-3 text-left transition-colors hover:bg-surface-hover"
                        [class.bg-surface-hover]="activeIndex() === idx"
                        (mouseenter)="activeIndex.set(idx)"
                        (click)="executeResult(result)"
                      >
                        @if (getBook(result); as book) {
                          @if (urlHelper.getThumbnailUrl(book.id, book.metadata?.coverUpdatedOn); as coverSrc) {
                            <img
                              [src]="coverSrc"
                              [alt]="t('bookCoverAlt')"
                              class="h-[72px] w-[52px] shrink-0 rounded-[8px] object-cover shadow-paper"
                            />
                          } @else {
                            <div class="h-[72px] w-[52px] shrink-0 overflow-hidden rounded-[8px] shadow-paper">
                              <app-cover-placeholder
                                size="sm"
                                [title]="book.metadata?.title ?? ''"
                                [author]="authorNames(book)"
                              />
                            </div>
                          }
                        } @else {
                          <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-[6px] bg-surface shadow-paper text-ink-muted">
                            <app-icon-display
                              [icon]="result.icon"
                              size="18px"
                              iconClass="text-ink-muted"
                            />
                          </div>
                        }

                        <div class="min-w-0 flex-1 pt-0.5">
                          @if (getBook(result); as book) {
                            <p class="line-clamp-2 text-sm font-semibold leading-5 text-ink">
                              {{ book.metadata?.title || book.primaryFile?.fileName }}
                              @if (publishedYear(book); as year) {
                                <span class="ml-1 rounded-full bg-surface px-1.5 py-px text-[10px] font-medium text-ink-muted align-middle">{{ year }}</span>
                              }
                            </p>

                            <p class="mt-1 text-sm leading-5 text-ink-muted">
                              <span class="italic">{{ t('byPrefix') }} {{ authorNames(book) }}</span>
                              @if (book.primaryFile?.bookType) {
                                <span class="ml-1 rounded-full border border-edge bg-surface px-1.5 py-px text-[10px] font-medium uppercase tracking-[0.08em] text-ink-muted align-middle">{{ book.primaryFile?.bookType }}</span>
                              }
                            </p>

                            @if (seriesInfo(book); as series) {
                              <div class="mt-1">
                                <span class="inline-flex items-center rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-medium text-accent-light">{{ series }}</span>
                              </div>
                            }
                          } @else {
                            <p class="line-clamp-2 text-sm font-semibold leading-5 text-ink">
                              {{ result.title }}
                              <span class="ml-1 rounded-full border border-edge bg-surface px-1.5 py-px text-[10px] font-medium uppercase tracking-[0.08em] text-ink-muted align-middle">{{ resultKindLabel(result) }}</span>
                            </p>
                            <p class="mt-1 line-clamp-2 text-sm text-ink-muted">
                              {{ result.subtitle }}
                            </p>
                          }
                        </div>
                      </button>
                    }
                  </div>
                  @if (isLoading()) {
                    <div class="border-t border-edge-light/70 px-4 py-3 text-sm text-ink-muted">
                      Loading books...
                    </div>
                  }
                } @else if (hasQuery()) {
                  <div class="flex items-center gap-3 px-4 py-4 text-sm text-ink-muted">
                    <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-raised text-ink-muted">
                      <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="11" cy="11" r="8"></circle>
                        <path d="m21 21-4.3-4.3"></path>
                      </svg>
                    </div>
                    <div class="min-w-0">
                      <p class="font-medium text-ink">{{ t('noResults') }}</p>
                      <p>{{ t('placeholder') }}</p>
                    </div>
                  </div>
                }
              </div>
              }
            </div>
          </div>
        </div>
      }
    </ng-container>
  `,
})
export class AppGlobalSearchComponent {
  readonly search = inject(GlobalSearchService);
  protected readonly urlHelper = inject(UrlHelperService);

  private readonly bookService = inject(BookService);
  private readonly authorService = inject(AuthorService);
  private readonly seriesDataService = inject(SeriesDataService);
  private readonly libraryService = inject(LibraryService);
  private readonly shelfService = inject(ShelfService);
  private readonly magicShelfService = inject(MagicShelfService);
  private readonly userService = inject(UserService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly transloco = inject(TranslocoService);

  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');
  private readonly resultItems = viewChildren<ElementRef<HTMLElement>>('resultItem');
  private readonly activeLang = toSignal(this.transloco.langChanges$, {
    initialValue: this.transloco.getActiveLang(),
  });

  readonly shortcutHint = this.getShortcutHint();
  readonly currentUser = this.userService.currentUser;
  readonly closing = signal(false);
  readonly showOverlay = computed(() => this.search.isOpen() || this.closing());

  readonly searchQuery = signal('');
  readonly activeIndex = signal(-1);

  private readonly searchTerm = signal('');
  private readonly debouncedSearchTerm = toSignal(
    toObservable(this.searchTerm).pipe(
      debounceTime(180),
      distinctUntilChanged(),
    ),
    { initialValue: '' },
  );
  private readonly normalizedSearchTerm = computed(() => normalizeSearchTerm(this.searchTerm()));
  private readonly normalizedDebouncedSearchTerm = computed(() => normalizeSearchTerm(this.debouncedSearchTerm()));

  readonly commandResults = computed<SearchResult[]>(() => {
    this.activeLang();

    const term = this.normalizedSearchTerm();
    if (!term) {
      return [];
    }

    const results: CommandSearchResult[] = [];
    const user = this.currentUser();
    const permissions = user?.permissions;

    const pushResult = (result: Omit<CommandSearchResult, 'score'>) => {
      const score = this.commandScore(term, result.title, result.subtitle, result.keywords);
      if (score <= 0) {
        return;
      }

      results.push({ ...result, score });
    };

      pushResult({
        id: 'page-dashboard',
        kind: 'page',
        title: this.transloco.translate('layout.menu.dashboard'),
        subtitle: 'Home overview',
        keywords: ['home', 'overview', 'main page'],
        icon: this.primeIcon('pi pi-fw pi-home'),
        execute: () => void this.router.navigateByUrl('/dashboard'),
      });

      pushResult({
        id: 'page-all-books',
        kind: 'page',
        title: this.transloco.translate('layout.menu.allBooks'),
        subtitle: 'Browse the full library',
        keywords: ['books', 'library', 'browse', 'all'],
        icon: this.primeIcon('pi pi-fw pi-book'),
        execute: () => void this.router.navigateByUrl('/all-books'),
      });

      pushResult({
        id: 'page-unshelved',
        kind: 'page',
        title: 'Unshelved',
        subtitle: 'Books without shelves',
        keywords: ['unsorted', 'without shelf', 'shelf'],
        icon: this.primeIcon('pi pi-inbox'),
        execute: () => void this.router.navigateByUrl('/unshelved-books'),
      });

      pushResult({
        id: 'page-series',
        kind: 'page',
        title: this.transloco.translate('layout.menu.series'),
        subtitle: 'Browse series',
        keywords: ['collections', 'sequence', 'series'],
        icon: this.primeIcon('pi pi-fw pi-objects-column'),
        execute: () => void this.router.navigateByUrl('/series'),
      });

      pushResult({
        id: 'page-authors',
        kind: 'page',
        title: this.transloco.translate('layout.menu.authors'),
        subtitle: 'Browse authors',
        keywords: ['writer', 'writers', 'people'],
        icon: this.primeIcon('pi pi-fw pi-users'),
        execute: () => void this.router.navigateByUrl('/authors'),
      });

      pushResult({
        id: 'page-notebook',
        kind: 'page',
        title: this.transloco.translate('layout.menu.notebook'),
        subtitle: 'Notes and annotations',
        keywords: ['notes', 'annotations', 'highlights'],
        icon: this.primeIcon('pi pi-fw pi-pencil'),
        execute: () => void this.router.navigateByUrl('/notebook'),
      });

      pushResult({
        id: 'page-settings',
        kind: 'page',
        title: this.transloco.translate('layout.topbar.settings'),
        subtitle: 'Application settings',
        keywords: ['preferences', 'config', 'configuration'],
        icon: this.primeIcon('pi pi-cog'),
        execute: () => void this.router.navigateByUrl('/settings'),
      });

    if (permissions?.canAccessBookdrop || permissions?.admin) {
      pushResult({
        id: 'page-bookdrop',
        kind: 'page',
        title: this.transloco.translate('layout.topbar.bookdrop'),
        subtitle: 'Review dropped files',
        keywords: ['inbox', 'imports', 'drop'],
        icon: this.primeIcon('pi pi-inbox'),
        execute: () => void this.router.navigateByUrl('/bookdrop'),
      });
    }

    if (permissions?.canManageLibrary || permissions?.admin) {
      pushResult({
        id: 'page-metadata-manager',
        kind: 'page',
        title: this.transloco.translate('layout.topbar.metadataManager'),
        subtitle: 'Metadata tools and review',
        keywords: ['metadata', 'manager', 'review'],
        icon: this.primeIcon('pi pi-sparkles'),
        execute: () => void this.router.navigateByUrl('/metadata-manager'),
      });
    }

    if (permissions?.canAccessLibraryStats || permissions?.admin || permissions?.canAccessUserStats) {
      pushResult({
        id: 'page-stats',
        kind: 'page',
        title: 'Stats',
        subtitle: permissions?.canAccessLibraryStats || permissions?.admin ? 'Library statistics' : 'Reading statistics',
        keywords: ['statistics', 'charts', 'analytics'],
        icon: this.primeIcon('pi pi-chart-bar'),
        execute: () => void this.router.navigateByUrl(
          permissions?.canAccessLibraryStats || permissions?.admin ? '/library-stats' : '/reading-stats'
        ),
      });
    }

    if (permissions?.canUpload || permissions?.admin) {
      pushResult({
        id: 'tool-upload',
        kind: 'tool',
        title: this.transloco.translate('layout.topbar.uploadBook'),
        subtitle: 'Open the upload dialog',
        keywords: ['add book', 'import', 'file', 'upload'],
        icon: this.primeIcon('pi pi-upload'),
        execute: () => { /* TODO: migrate to ModalService */ },
      });
    }

    if (permissions?.canManageLibrary || permissions?.admin) {
      pushResult({
        id: 'tool-library-create',
        kind: 'tool',
        title: this.transloco.translate('layout.topbar.createLibrary'),
        subtitle: 'Create a new library',
        keywords: ['new library', 'add library', 'create'],
        icon: this.primeIcon('pi pi-plus-circle'),
        execute: () => { /* TODO: migrate to ModalService */ },
      });

      pushResult({
        id: 'tool-magic-shelf-create',
        kind: 'tool',
        title: 'New Magic Shelf',
        subtitle: 'Create a new smart shelf',
        keywords: ['smart shelf', 'dynamic shelf', 'magic shelf', 'create'],
        icon: this.primeIcon('pi pi-sparkles'),
        execute: () => { /* TODO: migrate to ModalService */ },
      });
    }

    for (const author of this.authorService.allAuthors() ?? []) {
      pushResult({
        id: `author-${author.id}`,
        kind: 'author',
        title: author.name,
        subtitle: this.authorResultSubtitle(author.bookCount),
        keywords: ['author', 'writer', 'person'],
        icon: this.primeIcon('pi pi-user'),
        execute: () => void this.router.navigate(['/author', author.id]),
      });
    }

    for (const series of this.seriesDataService.allSeries()) {
      pushResult({
        id: `series-${series.seriesName}`,
        kind: 'series',
        title: series.seriesName,
        subtitle: this.seriesResultSubtitle(series.bookCount, series.authors),
        keywords: ['series', 'sequence', ...series.authors, ...series.categories],
        icon: this.primeIcon('pi pi-fw pi-objects-column'),
        execute: () => void this.router.navigate(['/series', series.seriesName]),
      });
    }

    for (const library of this.libraryService.libraries()) {
      if (library.id == null) continue;

      pushResult({
        id: `library-${library.id}`,
        kind: 'library',
        title: library.name,
        subtitle: `Library • ${this.libraryService.getBookCountValue(library.id)} books`,
        keywords: ['library', 'books', 'collection'],
        icon: this.entityIconSelection(library.icon, library.iconType, 'pi pi-folder'),
        execute: () => void this.router.navigateByUrl(`/library/${library.id}/books`),
      });
    }

    for (const shelf of this.shelfService.shelves()) {
      if (shelf.id == null) continue;

      pushResult({
        id: `shelf-${shelf.id}`,
        kind: 'shelf',
        title: shelf.name,
        subtitle: `Shelf • ${this.shelfService.getBookCountValue(shelf.id)} books`,
        keywords: ['shelf', 'books', 'collection'],
        icon: this.entityIconSelection(shelf.icon, shelf.iconType, 'pi pi-bookmark'),
        execute: () => void this.router.navigateByUrl(`/shelf/${shelf.id}/books`),
      });
    }

    for (const shelf of this.magicShelfService.shelves()) {
      if (shelf.id == null) continue;

      pushResult({
        id: `magic-shelf-${shelf.id}`,
        kind: 'magic-shelf',
        title: shelf.name,
        subtitle: `Magic Shelf • ${this.magicShelfService.getBookCountValue(shelf.id)} books`,
        keywords: ['magic shelf', 'smart shelf', 'dynamic shelf', 'rules'],
        icon: this.entityIconSelection(shelf.icon, shelf.iconType, 'pi pi-bolt'),
        execute: () => void this.router.navigateByUrl(`/magic-shelf/${shelf.id}/books`),
      });
    }

    return this.sortResults(results).slice(0, 50);
  });

  readonly bookResults = computed<SearchResult[]>(() => {
    const rawTerm = this.searchTerm().trim();
    const term = this.normalizedDebouncedSearchTerm();

    if (rawTerm.length < 2 || this.isLoading()) {
      return [];
    }

    return this.sortResults(
      filterBooksBySearchTerm(this.bookService.books(), term)
        .map(book => this.toBookResult(book, term))
        .filter((result): result is BookSearchResult => result.score > 0),
    ).slice(0, 30);
  });

  readonly results = computed<SearchResult[]>(() =>
    this.sortResults([...this.commandResults(), ...this.bookResults()]).slice(0, 50)
  );
  readonly hasQuery = computed(() => this.searchQuery().trim().length > 0);
  readonly isLoading = computed(() => {
    const rawTerm = this.searchTerm().trim();
    return rawTerm.length >= 2 && rawTerm !== this.debouncedSearchTerm().trim();
  });
  readonly showDropdown = computed(() => this.hasQuery() || this.isLoading());

  private readonly focusInputEffect = effect(() => {
    if (!this.search.isOpen()) {
      return;
    }

    const input = this.searchInput();
    if (!input) {
      return;
    }

    requestAnimationFrame(() => {
      input.nativeElement.focus();
      input.nativeElement.select();
    });
  });

  private readonly activeIndexEffect = effect(() => {
    const results = this.results();

    if (!this.search.isOpen()) {
      return;
    }

    if (results.length === 0) {
      if (this.activeIndex() !== -1) {
        this.activeIndex.set(-1);
      }
      return;
    }

    const currentIndex = this.activeIndex();
    if (currentIndex < 0 || currentIndex >= results.length) {
      this.activeIndex.set(0);
    }
  });

  private readonly scrollActiveItemEffect = effect(() => {
    const index = this.activeIndex();
    const items = this.resultItems();

    if (index < 0 || index >= items.length) {
      return;
    }

    requestAnimationFrame(() => {
      items[index]?.nativeElement.scrollIntoView({ block: 'nearest' });
    });
  });

  constructor() {
    this.router.events
      .pipe(
        filter((event): event is NavigationStart => event instanceof NavigationStart),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => this.resetAndClose());
  }

  @HostListener('document:keydown', ['$event'])
  onDocumentKeydown(event: KeyboardEvent): void {
    const isShortcut = event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey) && !event.shiftKey;

    if (isShortcut) {
      event.preventDefault();

      if (this.search.isOpen()) {
        this.resetAndClose();
      } else {
        this.search.open();
      }

      return;
    }

    if (!this.search.isOpen()) {
      return;
    }

    switch (event.key) {
      case 'Escape':
        event.preventDefault();
        this.resetAndClose();
        break;
      case 'ArrowDown':
        if (this.results().length === 0) return;
        event.preventDefault();
        this.activeIndex.update(index => Math.min(index + 1, this.results().length - 1));
        break;
      case 'ArrowUp':
        if (this.results().length === 0) return;
        event.preventDefault();
        this.activeIndex.update(index => Math.max(index - 1, 0));
        break;
      case 'Enter': {
        const result = this.results()[this.activeIndex()];
        if (!result) return;
        event.preventDefault();
        this.executeResult(result);
        break;
      }
    }
  }

  onSearchQueryChange(value: string): void {
    this.searchQuery.set(value);
    this.searchTerm.set(value.trim());
  }

  close(): void {
    this.resetAndClose();
  }

  executeResult(result: SearchResult): void {
    this.resetAndClose();
    setTimeout(() => result.execute(), 0);
  }

  authorNames(book: Book): string {
    return book.metadata?.authors?.join(', ') || this.transloco.translate('book.searcher.unknownAuthor');
  }

  publishedYear(book: Book): string | null {
    const publishedDate = book.metadata?.publishedDate;
    if (!publishedDate) return null;

    const year = publishedDate.split('-')[0];
    return year && year.length === 4 ? year : null;
  }

  seriesInfo(book: Book): string | null {
    const seriesName = book.metadata?.seriesName;
    if (!seriesName) return null;

    if (book.metadata?.seriesNumber) {
      return `${seriesName} #${book.metadata.seriesNumber}`;
    }

    return seriesName;
  }

  getBook(result: SearchResult): Book | null {
    return result.kind === 'book' ? result.book : null;
  }

  closeLabel(): string {
    return this.transloco.translate('common.close');
  }

  resultKindLabel(result: SearchResult): string {
    switch (result.kind) {
      case 'author':
        return 'Author';
      case 'series':
        return 'Series';
      case 'page':
        return 'Page';
      case 'tool':
        return 'Tool';
      case 'library':
        return 'Library';
      case 'shelf':
        return 'Shelf';
      case 'magic-shelf':
        return 'Magic Shelf';
      default:
        return 'Book';
    }
  }

  onCloseAnimationEnd(): void {
    if (!this.closing()) return;
    this.closing.set(false);
    this.search.close();
    this.resetSearch();
  }

  private resetAndClose(): void {
    if (!this.search.isOpen() || this.closing()) return;
    this.closing.set(true);
  }

  private resetSearch(): void {
    this.searchQuery.set('');
    this.searchTerm.set('');
    this.activeIndex.set(-1);
  }

  private getShortcutHint(): string | null {
    if (typeof navigator === 'undefined') {
      return 'Ctrl+K';
    }

    const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
    const platform = nav.userAgentData?.platform ?? nav.platform ?? '';
    const userAgent = nav.userAgent ?? '';
    const isTouchOnlyDevice =
      /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent) ||
      (/Mac/.test(platform) && nav.maxTouchPoints > 1);

    if (isTouchOnlyDevice) {
      return null;
    }

    return /Mac/.test(platform) ? '⌘K' : 'Ctrl+K';
  }

  private authorResultSubtitle(bookCount: number): string {
    return `Author • ${this.pluralize(bookCount, 'book')}`;
  }

  private seriesResultSubtitle(bookCount: number, authors: string[]): string {
    const byline = authors.slice(0, 2).join(', ');
    return byline
      ? `Series • ${this.pluralize(bookCount, 'book')} • by ${byline}`
      : `Series • ${this.pluralize(bookCount, 'book')}`;
  }

  private toBookResult(book: Book, term: string): BookSearchResult {
    return {
      id: `book-${book.id}`,
      kind: 'book',
      book,
      title: book.metadata?.title || book.primaryFile?.fileName || '',
      subtitle: this.authorNames(book),
      keywords: [
        book.metadata?.seriesName || '',
        ...(book.metadata?.authors ?? []),
        ...(book.metadata?.categories ?? []),
        book.metadata?.isbn10 || '',
        book.metadata?.isbn13 || '',
        book.primaryFile?.fileName || '',
      ],
      icon: this.primeIcon('pi pi-fw pi-book'),
      score: this.bookScore(book, term),
      execute: () => void this.router.navigate(['/book', book.id], {
        queryParams: { tab: 'view' },
      }),
    };
  }

  private bookScore(book: Book, term: string): number {
    return Math.max(
      this.fieldScore(term, book.metadata?.title || '', 4),
      this.fieldScore(term, book.metadata?.seriesName || '', 3),
      this.fieldScore(term, book.primaryFile?.fileName || '', 2),
      this.fieldScore(term, book.metadata?.isbn10 || '', 5),
      this.fieldScore(term, book.metadata?.isbn13 || '', 5),
      ...((book.metadata?.authors ?? []).map(author => this.fieldScore(term, author, 3))),
      ...((book.metadata?.categories ?? []).map(category => this.fieldScore(term, category, 2))),
    );
  }

  private commandScore(term: string, title: string, subtitle: string, keywords: string[]): number {
    return Math.max(
      this.fieldScore(term, title, 4),
      this.fieldScore(term, subtitle, 2),
      ...keywords.map(keyword => this.fieldScore(term, keyword, 3)),
    );
  }

  private fieldScore(term: string, value: string, weight: number): number {
    const normalizedValue = normalizeSearchTerm(value);
    if (!normalizedValue) {
      return 0;
    }

    if (normalizedValue === term) {
      return 120 * weight;
    }

    if (normalizedValue.startsWith(term)) {
      return 90 * weight;
    }

    if (normalizedValue.includes(` ${term}`)) {
      return 70 * weight;
    }

    if (normalizedValue.includes(term)) {
      return 50 * weight;
    }

    return 0;
  }

  private sortResults<T extends SearchResult>(results: T[]): T[] {
    return [...results].sort((a, b) =>
      b.score - a.score ||
      a.title.localeCompare(b.title)
    );
  }

  private primeIcon(value: string): IconSelection {
    return {
      type: 'PRIME_NG',
      value,
    };
  }

  private entityIconSelection(
    icon: string | null | undefined,
    iconType: 'PRIME_NG' | 'CUSTOM_SVG' | null | undefined,
    fallback: string,
  ): IconSelection {
    if (icon) {
      return {
        type: iconType ?? 'PRIME_NG',
        value: icon,
      };
    }

    return this.primeIcon(fallback);
  }

  private pluralize(count: number, singular: string): string {
    return `${count} ${singular}${count === 1 ? '' : 's'}`;
  }
}
