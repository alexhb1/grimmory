import {ChangeDetectionStrategy, Component, inject, signal, viewChild} from '@angular/core';
import {CdkScrollable} from '@angular/cdk/scrolling';
import {Router} from '@angular/router';
import {LucideChevronLeft} from '@lucide/angular';

import {AppButtonComponent} from '../../../shared/ui/button/app-button.component';
import {BookCardComponent} from '../../../shared/components/cards/book-card/book-card.component';
import {BookCardSkeletonComponent} from '../../../shared/components/cards/book-card/book-card-skeleton.component';
import {BookCardMenuComponent} from '../../../shared/components/cards/book-card/book-card-menu.component';
import {SeriesCardComponent} from '../../../shared/components/cards/series-card/series-card.component';
import {SeriesCardSkeletonComponent} from '../../../shared/components/cards/series-card/series-card-skeleton.component';
import {AuthorCardComponent} from '../../../shared/components/cards/author-card/author-card.component';
import {AuthorCardSkeletonComponent} from '../../../shared/components/cards/author-card/author-card-skeleton.component';
import {
  type BookCardMenuCapabilities,
  type BookCardMenuShelf,
} from '../../../shared/components/cards/book-card/book-card-menu';
import {BookReadStatus, BookSummary, BookSummaryMetadata} from '../../../features/book/data/book-response.models';
import {SeriesSummary} from '../../../features/series-browser/model/series.model';
import {AuthorSummary} from '../../../features/author-browser/model/author.model';

function sampleBook(
  id: number,
  title: string,
  authors: string[],
  extra: Partial<BookSummary> = {},
  metadata: Partial<BookSummaryMetadata> = {},
): BookSummary {
  return {
    id,
    libraryId: 1,
    libraryName: 'Sample library',
    metadata: {bookId: id, title, authors, allMetadataLocked: false, ...metadata},
    primaryFile: {id: id * 10, bookId: id, book: true, folderBased: false, bookType: 'EPUB'},
    ...extra,
  };
}

function computeSeriesStatus(books: BookSummary[]): BookReadStatus {
  if (books.length === 0) return 'UNREAD';
  const statuses = books.map(book => book.readStatus ?? 'UNREAD');
  if (statuses.includes('WONT_READ')) return 'WONT_READ';
  if (statuses.includes('ABANDONED')) return 'ABANDONED';
  if (statuses.every(status => status === 'READ')) return 'READ';
  if (statuses.some(status => status === 'READING' || status === 'RE_READING' || status === 'PAUSED')) return 'READING';
  if (statuses.some(status => status === 'READ')) return 'PARTIALLY_READ';
  if (statuses.every(status => status === 'UNREAD')) return 'UNREAD';
  return 'PARTIALLY_READ';
}

@Component({
  selector: 'app-design-system-cards',
  standalone: true,
  host: {class: 'block h-full min-h-0'},
  imports: [
    CdkScrollable,
    AppButtonComponent,
    BookCardComponent,
    BookCardSkeletonComponent,
    BookCardMenuComponent,
    SeriesCardComponent,
    SeriesCardSkeletonComponent,
    AuthorCardComponent,
    AuthorCardSkeletonComponent,
    LucideChevronLeft,
  ],
  templateUrl: './cards-page.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CardsPageComponent {
  private readonly router = inject(Router);
  private readonly menu = viewChild(BookCardMenuComponent);

  readonly selectedSolo = signal(true);
  readonly selectedInMode = signal(false);
  readonly lastEvent = signal('none yet — try a pill, kebab, or checkbox');

  readonly openMenuId = signal<string | null>(null);

  readonly menuBook = signal<BookSummary | null>(null);
  readonly menuCaps = signal<BookCardMenuCapabilities>({
    canDownload: false,
    canEmailBook: false,
    canEditMetadata: false,
    canDeleteBook: false,
  });
  readonly menuShelves = signal<BookCardMenuShelf[]>([]);
  readonly menuReadStatus = signal<BookReadStatus | null>(null);

  readonly fullCaps: BookCardMenuCapabilities = {
    canDownload: true,
    canEmailBook: true,
    canEditMetadata: true,
    canDeleteBook: true,
  };
  readonly noCaps: BookCardMenuCapabilities = {
    canDownload: false,
    canEmailBook: false,
    canEditMetadata: false,
    canDeleteBook: false,
  };

  private readonly sampleShelves: readonly {id: number; name: string}[] = [
    {id: 1, name: 'Favourites'},
    {id: 2, name: 'To read'},
    {id: 3, name: 'Sci-fi'},
    {id: 4, name: 'Classics'},
    {id: 5, name: 'Victorian'},
    {id: 6, name: 'Reread'},
    {id: 7, name: 'Book club'},
  ];

  logEvent(name: string, title: string): void {
    this.lastEvent.set(`${name} — ${title}`);
  }

  private shelvesFor(book: BookSummary): BookCardMenuShelf[] {
    const on = new Set((book.shelves ?? []).map(shelf => shelf.id));
    return this.sampleShelves.map(shelf => ({...shelf, checked: on.has(shelf.id)}));
  }

  openMenu(book: BookSummary, event: MouseEvent, capabilities: BookCardMenuCapabilities, slot: string): void {
    if (event.type !== 'contextmenu' && this.openMenuId() === slot) {
      this.menu()?.close();
      return;
    }
    this.menuBook.set(book);
    this.menuCaps.set(capabilities);
    this.menuShelves.set(this.shelvesFor(book));
    this.menuReadStatus.set(book.readStatus ?? null);
    this.openMenuId.set(slot);
    this.menu()?.openFromCard(event);
  }

  private menuBookTitle(): string {
    return this.menuBook()?.metadata?.title ?? '';
  }

  onToggleShelf(shelf: BookCardMenuShelf, nextChecked: boolean): void {
    this.logEvent(`Shelf ${nextChecked ? 'on' : 'off'} #${shelf.id}`, this.menuBookTitle());
  }
  onCreateShelf(): void {
    this.logEvent('New shelf', this.menuBookTitle());
  }
  onAllShelves(): void {
    this.logEvent('All shelves', this.menuBookTitle());
  }
  onSetReadStatus(status: BookReadStatus): void {
    this.logEvent(`Mark ${status}`, this.menuBookTitle());
  }
  onQuickSend(): void {
    this.logEvent('Quick send', this.menuBookTitle());
  }
  onCustomSend(): void {
    this.logEvent('Custom send', this.menuBookTitle());
  }
  onDownload(): void {
    this.logEvent('Download', this.menuBookTitle());
  }
  onFetchMetadata(): void {
    this.logEvent('Fetch metadata', this.menuBookTitle());
  }
  onFetchMetadataWithOptions(): void {
    this.logEvent('Fetch with options', this.menuBookTitle());
  }
  onEditMetadata(): void {
    this.logEvent('Edit metadata', this.menuBookTitle());
  }
  onDelete(): void {
    this.logEvent('Delete', this.menuBookTitle());
  }

  closeMenu(): void {
    this.openMenuId.set(null);
  }

  readonly warden = sampleBook(9001, 'The Warden', ['Anthony Trollope'], {epubProgress: {cfi: null, href: null, contentSourceProgressPercent: null, percentage: 34, ttsPositionCfi: null}, shelves: [{id: 1, name: 'Favourites', publicShelf: false, bookCount: 1}]}, {seriesName: 'The Chronicles of Barsetshire', seriesNumber: 1});
  readonly barchester = sampleBook(9002, 'Barchester Towers', ['Anthony Trollope'], {epubProgress: {cfi: null, href: null, contentSourceProgressPercent: null, percentage: 100, ttsPositionCfi: null}}, {seriesName: 'The Chronicles of Barsetshire', seriesNumber: 2});
  readonly doctorThorne = sampleBook(9003, 'Doctor Thorne', ['Anthony Trollope'], {}, {seriesName: 'The Chronicles of Barsetshire', seriesNumber: 3});

  readonly missMackenzie = sampleBook(9101, 'Miss Mackenzie', ['Anthony Trollope']);
  readonly rachelRay = sampleBook(9102, 'Rachel Ray', ['Anthony Trollope']);
  readonly smallHouse = sampleBook(9103, 'The Small House at Allington', ['Anthony Trollope']);

  readonly womanInWhite = sampleBook(9201, 'The Woman in White', ['Wilkie Collins'], {epubProgress: {cfi: null, href: null, contentSourceProgressPercent: null, percentage: 34, ttsPositionCfi: null}});
  readonly dracula = sampleBook(9202, 'Dracula', ['Bram Stoker']);
  readonly villette = sampleBook(9203, 'Villette', ['Charlotte Brontë']);
  readonly middlemarch = sampleBook(9204, 'Middlemarch', ['George Eliot'], {primaryFile: {id: 92040, bookId: 9204, book: true, folderBased: false, bookType: 'AUDIOBOOK'}, audiobookProgress: {positionMs: 1000, trackIndex: null, trackPositionMs: null, percentage: 82}});
  readonly bleakHouse = sampleBook(9205, 'Bleak House', ['Charles Dickens'], {primaryFile: {id: 92050, bookId: 9205, book: true, folderBased: false, bookType: 'AUDIOBOOK'}});

  readonly moonstone = sampleBook(9301, 'The Moonstone', ['Wilkie Collins']);

  private seriesFrom(
    name: string,
    coverBooks: BookSummary[],
    bookCount: number,
    readCount: number,
  ): SeriesSummary {
    const legacyBooks = coverBooks as unknown as SeriesSummary['coverBooks'];
    return {
      seriesName: name,
      books: legacyBooks,
      authors: ['Anthony Trollope'],
      categories: [],
      bookCount,
      readCount,
      progress: bookCount > 0 ? readCount / bookCount : 0,
      seriesStatus: computeSeriesStatus(coverBooks) as unknown as SeriesSummary['seriesStatus'],
      nextUnread: legacyBooks[0] ?? null,
      lastReadTime: null,
      coverBooks: legacyBooks,
      addedOn: null,
    };
  }

  readonly barsetshire = this.seriesFrom('The Chronicles of Barsetshire', [this.warden, this.barchester, this.doctorThorne], 6, 3);
  readonly palliser = this.seriesFrom('The Pallisers', [this.missMackenzie, this.rachelRay, this.smallHouse], 6, 0);
  readonly barsetshireDone = this.seriesFrom('Barsetshire (complete)', [this.warden, this.barchester, this.doctorThorne], 3, 3);
  readonly laVendee = this.seriesFrom('La Vendée', [this.moonstone], 1, 0);

  readonly trollope: AuthorSummary = {id: 1, name: 'Anthony Trollope', bookCount: 8, hasPhoto: false};
  readonly collins: AuthorSummary = {id: 2, name: 'Wilkie Collins', bookCount: 9, hasPhoto: false};
  readonly gaskell: AuthorSummary = {id: 3, name: 'Elizabeth Gaskell', bookCount: 6, hasPhoto: true};
  readonly eliot: AuthorSummary = {id: 4, name: 'George Eliot', bookCount: 7, hasPhoto: false};
  readonly bronte: AuthorSummary = {id: 5, name: 'Charlotte Brontë', bookCount: 1, hasPhoto: false};

  readonly authorSelectedSolo = signal(true);
  readonly authorSelectedInMode = signal(false);

  back(): void {
    void this.router.navigate(['/design-system']);
  }
}
