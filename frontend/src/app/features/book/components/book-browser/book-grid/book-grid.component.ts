import {ChangeDetectionStrategy, Component, DestroyRef, ElementRef, HostListener, computed, inject, input, output, signal, viewChild} from '@angular/core';
import {ActivatedRoute} from '@angular/router';
import {Book} from '../../../model/book.model';
import {RouteScrollPositionService} from '../../../../../shared/service/route-scroll-position.service';
import {createInfinitePaginator} from '../../../../../shared/util/infinite-paginator.util';
import {createVirtualGrid, scaleForGridColumns} from '../../../../../shared/util/virtual-grid.util';
import {CoverScalePreferenceService} from '../cover-scale-preference.service';
import {BookCardOverlayPreferenceService} from '../book-card-overlay-preference.service';
import {BookSelectionService, CheckboxClickEvent} from '../book-selection.service';
import {BookCardComponent} from '../book-card/book-card.component';

const GRID_GAP = 21;
const MOBILE_BREAKPOINT = 768;
const CARD_ASPECT_RATIO = 7 / 5;
const MOBILE_GAP = 8;
const MOBILE_TITLE_BAR_HEIGHT = 32;
const DESKTOP_CARD_BASE_WIDTH = 135;
const DESKTOP_CARD_BASE_HEIGHT = 220;
const DESKTOP_MIN_SCALE = 0.5;
const DESKTOP_MAX_SCALE = 1.5;
const AUDIOBOOK_TITLE_BAR_HEIGHT = 31;
const DEFAULT_MOBILE_COLUMNS = 3;

@Component({
  selector: 'app-book-grid',
  standalone: true,
  imports: [BookCardComponent],
  templateUrl: './book-grid.component.html',
  styleUrls: ['./book-grid.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BookGridComponent {
  readonly loadNextPage = output<void>();
  readonly bookSelect = output<{book: Book; selected: boolean}>();
  readonly checkboxClick = output<CheckboxClickEvent>();

  readonly books = input<Book[]>([]);
  readonly virtualRowCount = input(0);
  readonly isLoading = input(false);
  readonly isFetchingNextPage = input(false);
  readonly seriesViewEnabled = input(false);
  readonly isSeriesCollapsed = input(false);
  readonly useSquareCovers = input(false);
  readonly mobileColumnCount = input(DEFAULT_MOBILE_COLUMNS);
  readonly overlayPreferenceService = input<BookCardOverlayPreferenceService | undefined>();

  private readonly activatedRoute = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly scrollService = inject(RouteScrollPositionService);
  private readonly coverScalePreferenceService = inject(CoverScalePreferenceService);
  protected readonly bookSelectionService = inject(BookSelectionService);

  private readonly scrollElement = viewChild<ElementRef<HTMLElement>>('scrollElement');
  private readonly initialScrollOffset = () => this.scrollService.getPosition(this.scrollService.keyFor(this.activatedRoute)) ?? 0;

  readonly screenWidth = signal(typeof window !== 'undefined' ? window.innerWidth : 1024);
  readonly isMobile = computed(() => this.screenWidth() < MOBILE_BREAKPOINT);
  private readonly desktopBaseCardWidth = computed(() =>
    this.useSquareCovers()
      ? DESKTOP_CARD_BASE_WIDTH * 1.1
      : DESKTOP_CARD_BASE_WIDTH
  );
  private readonly minCardWidth = computed(() =>
    this.isMobile()
      ? 1
      : Math.round(this.desktopBaseCardWidth() * this.coverScalePreferenceService.scaleFactor())
  );
  private readonly virtualGridGap = computed(() => this.isMobile() ? MOBILE_GAP : GRID_GAP);
  private readonly virtualGridColumns = computed(() => this.isMobile() ? this.mobileColumnCount() : undefined);
  readonly rowCount = computed(() => {
    const books = this.books();
    if (this.isLoading() && books.length === 0) {
      return Math.max(books.length, this.virtualRowCount());
    }
    return Math.max(this.virtualRowCount(), books.length);
  });

  readonly virtualGrid = createVirtualGrid({
    items: this.books,
    scrollElement: this.scrollElement,
    minItemWidth: this.minCardWidth,
    gap: this.virtualGridGap,
    columns: this.virtualGridColumns,
    count: this.rowCount,
    initialOffset: this.initialScrollOffset,
    fillItemWidth: true,
    estimateItemHeight: itemWidth => this.isMobile()
      ? this.mobileCardSizeForWidth(itemWidth).height
      : this.cardSizeForWidth(itemWidth).height,
  });

  private readonly infinitePaginator = createInfinitePaginator({
    items: this.books,
    hasNextPage: () => this.books().length < this.virtualRowCount(),
    isFetchingNextPage: this.isFetchingNextPage,
    virtualizer: this.virtualGrid.virtualizer,
    loadNextPage: () => this.loadNextPage.emit(),
  });

  constructor() {
    this.scrollService.trackRoute({
      scrollElement: this.scrollElement,
      route: this.activatedRoute,
      destroyRef: this.destroyRef,
      dismissOverlaysBeforeSave: true,
    });
  }

  @HostListener('window:resize')
  onResize(): void {
    this.screenWidth.set(window.innerWidth);
  }

  readonly onBookCardSelect = (book: Book, selected: boolean): void => {
    this.bookSelect.emit({book, selected});
  };

  scrollToTop(): void {
    const scrollElement = this.scrollElement()?.nativeElement;
    if (scrollElement) {
      scrollElement.scrollTop = 0;
    }
    this.virtualGrid.virtualizer.scrollToOffset(0);
  }

  adjustDesktopGridDensity(direction: 'smaller' | 'larger'): void {
    const currentColumns = this.virtualGrid.gridColumns();
    const columns = Math.max(1, direction === 'smaller'
      ? currentColumns + 1
      : currentColumns - 1);
    const viewportWidth = this.virtualGrid.viewportWidth() || this.screenWidth();
    this.virtualGrid.updatePreservingScrollPosition(() => {
      this.coverScalePreferenceService.setScale(scaleForGridColumns(
        viewportWidth,
        GRID_GAP,
        columns,
        this.desktopBaseCardWidth(),
        DESKTOP_MIN_SCALE,
        DESKTOP_MAX_SCALE
      ));
    });
  }

  private cardSizeForWidth(width: number): {width: number; height: number} {
    const cardWidth = Math.round(width);
    if (this.useSquareCovers()) {
      return {width: cardWidth, height: cardWidth + AUDIOBOOK_TITLE_BAR_HEIGHT};
    }
    return {
      width: cardWidth,
      height: Math.round(cardWidth * (DESKTOP_CARD_BASE_HEIGHT / DESKTOP_CARD_BASE_WIDTH)),
    };
  }

  private mobileCardSizeForWidth(width: number): {width: number; height: number} {
    const cardWidth = Math.round(width);
    const coverHeight = this.useSquareCovers()
      ? cardWidth
      : Math.floor(cardWidth * CARD_ASPECT_RATIO);
    return {width: cardWidth, height: coverHeight + MOBILE_TITLE_BAR_HEIGHT};
  }

}
