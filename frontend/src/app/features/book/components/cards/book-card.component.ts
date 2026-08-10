import {
  afterRenderEffect,
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import {toSignal} from '@angular/core/rxjs-interop';
import {LocationStrategy} from '@angular/common';
import {Router, RouterLink} from '@angular/router';
import {TranslocoPipe, TranslocoService} from '@jsverse/transloco';
import {LucideArrowRight, LucideBookOpen, LucideEllipsisVertical, LucidePlay} from '@lucide/angular';

import {BookSummary} from '../../data/book-response.models';
import {
  bookGrimmoryProgress,
  bookPartlyRead,
  bookProgressPercentage,
  bookReadAction,
  BOOK_READ_ACTION_SHORT_KEYS,
} from '../../data/book-read-action';
import {UrlHelperService} from '../../../../shared/service/url-helper.service';
import {CoverComponent} from '../../../../shared/components/cover/cover.component';
import {AppTooltipDirective} from '../../../../shared/ui/tooltip/app-tooltip.directive';
import {cn} from '../../../../shared/ui/cn';
import {contextMenuRequest, type ContextMenuRequest} from '../../../../shared/ui/menu/app-menu.component';
import {isContextMenuGesture, isPlainLeftClick} from '../../../../shared/util/pointer-gestures';
import {CardSelectionComponent} from '../../../../shared/components/cards/card-selection.component';
import {bookCardAspectClass, BOOK_CARD_RADIUS_CLASS} from './book-card.layout';

const LONG_PRESS_MS = 500;
const LONG_PRESS_TOLERANCE_PX = 10;

export function bookCardCoverSrc(
  book: BookSummary,
  squareCovers: boolean,
  urlHelper: UrlHelperService,
): string | null {
  const useAudiobookCover = book.primaryFile?.bookType === 'AUDIOBOOK'
    || (squareCovers && (book.alternativeFormats ?? []).some(file => file.bookType === 'AUDIOBOOK'));
  return useAudiobookCover
    ? urlHelper.getAudiobookThumbnailUrl(book.id, book.metadata?.audiobookCoverUpdatedOn)
    : urlHelper.getThumbnailUrl(book.id, book.metadata?.coverUpdatedOn);
}

@Component({
  selector: 'app-book-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    TranslocoPipe,
    CoverComponent,
    AppTooltipDirective,
    CardSelectionComponent,
    LucideArrowRight,
    LucideBookOpen,
    LucideEllipsisVertical,
    LucidePlay,
  ],
  host: {class: 'block @container'},
  templateUrl: './book-card.component.html',
})
export class BookCardComponent {
  readonly book = input.required<BookSummary>();
  readonly squareCovers = input(false, {transform: booleanAttribute});
  readonly showBadge = input(true, {transform: booleanAttribute});
  readonly showFormatPill = input(false, {transform: booleanAttribute});
  readonly showProgress = input(true, {transform: booleanAttribute});
  readonly showMeta = input(true, {transform: booleanAttribute});
  readonly overlays = input(true, {transform: booleanAttribute});
  readonly detailLine = input<string | null>(null);
  readonly selectable = input(false, {transform: booleanAttribute});
  readonly selected = input(false, {transform: booleanAttribute});
  readonly selectionActive = input(false, {transform: booleanAttribute});
  readonly detailMode = input<'link' | 'request'>('link');
  readonly menuOpen = input(false, {transform: booleanAttribute});

  readonly toggleSelect = output<{shiftKey: boolean}>();
  readonly action = output<void>();
  readonly menuRequested = output<ContextMenuRequest>();
  readonly detailRequested = output<void>();

  private readonly urlHelper = inject(UrlHelperService);
  private readonly transloco = inject(TranslocoService);
  private readonly router = inject(Router);
  private readonly locationStrategy = inject(LocationStrategy);
  private readonly actionButton = viewChild<ElementRef<HTMLButtonElement>>('actionButton');
  private readonly actionLabelElement = viewChild<ElementRef<HTMLElement>>('actionLabel');
  protected readonly compactAction = signal(false);
  private readonly activeLang = toSignal(this.transloco.langChanges$, {
    initialValue: this.transloco.getActiveLang(),
  });

  constructor() {
    afterRenderEffect({
      read: onCleanup => {
        const button = this.actionButton()?.nativeElement;
        const label = this.actionLabelElement()?.nativeElement;

        if (!button || !label) {
          this.compactAction.set(false);
          return;
        }

        const update = () => this.updateActionFit(button, label);
        update();

        const resizeObserver = new ResizeObserver(update);
        resizeObserver.observe(button);
        resizeObserver.observe(label);
        onCleanup(() => resizeObserver.disconnect());
      },
    });
  }

  protected readonly title = computed(() => {
    const title = this.book().metadata?.title?.trim();
    if (title) {
      return title;
    }
    this.activeLang();
    return this.transloco.translate('cards.book.unknownTitle');
  });
  protected readonly authors = computed(() => this.book().metadata?.authors ?? []);
  protected readonly authorsLabel = computed(() => this.authors().join(', '));
  protected readonly seriesNumber = computed(() => this.book().metadata?.seriesNumber ?? null);

  protected readonly isAudiobook = computed(() => this.book().primaryFile?.bookType === 'AUDIOBOOK');
  protected readonly coverSquare = computed(() => this.isAudiobook() || this.squareCovers());
  protected readonly coverFit = computed<'cover' | 'contain'>(() => (this.coverSquare() ? 'contain' : 'cover'));
  protected readonly coverSrc = computed(() =>
    bookCardCoverSrc(this.book(), this.squareCovers(), this.urlHelper));

  private readonly grimmoryProgress = computed(() => bookGrimmoryProgress(this.book()));

  protected readonly progressPercentage = computed(() => bookProgressPercentage(this.book()));

  protected readonly progressTooltip = computed(() => {
    const b = this.book();
    const grimmory = this.grimmoryProgress();
    const parts: string[] = [];
    if (grimmory !== null) {
      parts.push(`${grimmory}% (Grimmory)`);
    }
    if (b.koreaderProgress?.percentage != null) {
      parts.push(`${b.koreaderProgress.percentage}% (KOReader)`);
    }
    if (b.koboProgress?.percentage != null) {
      parts.push(`${b.koboProgress.percentage}% (Kobo)`);
    }
    return parts.join(' | ');
  });

  protected readonly formatLabel = computed(() => {
    const file = this.book().primaryFile;
    if (!file) {
      this.activeLang();
      return this.transloco.translate('cards.book.physical');
    }
    return file.extension?.toUpperCase() ?? null;
  });

  private readonly midProgress = computed(() => bookPartlyRead(this.book()));
  protected readonly hasPrimaryFile = computed(() => this.book().primaryFile != null);
  protected readonly isContinueAction = computed(() =>
    !this.isAudiobook() && this.midProgress(),
  );

  private readonly verbKey = computed(() => BOOK_READ_ACTION_SHORT_KEYS[bookReadAction(this.book())]);
  protected readonly actionText = computed(() => {
    this.activeLang();
    return this.transloco.translate(this.verbKey());
  });

  protected readonly detailLink = computed(() => ['/book', this.book().id]);
  protected readonly detailHref = computed(() =>
    this.locationStrategy.prepareExternalUrl(
      this.router.serializeUrl(this.router.createUrlTree(this.detailLink())),
    ),
  );

  private readonly checkboxTakesOver = computed(
    () => this.selectable() && (this.selected() || this.selectionActive()),
  );
  protected readonly menuPinned = computed(() => this.menuOpen() && !this.selectionActive());
  protected readonly badgeVisible = computed(
    () => this.showBadge() && this.seriesNumber() !== null && !this.checkboxTakesOver(),
  );

  private pressTimer: number | null = null;
  private pressOrigin: {x: number; y: number} | null = null;
  private longPressFired = false;

  protected readonly rootClass = computed(() =>
    cn(
      `group/card relative block min-w-0 cursor-pointer ${BOOK_CARD_RADIUS_CLASS}`,
      'pointer-coarse:select-none pointer-coarse:[-webkit-touch-callout:none]',
      !this.selectionActive() && this.overlays() && 'group/lift',
      this.menuPinned() && 'cover-lifted',
    ),
  );
  protected readonly linkClass =
    'absolute inset-0 z-10 rounded-[inherit] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';
  protected readonly slotClass = computed(() =>
    cn('flex flex-col justify-end', bookCardAspectClass(this.squareCovers())),
  );
  protected readonly coverClass = computed(() =>
    cn(
      `relative w-full overflow-hidden ${BOOK_CARD_RADIUS_CLASS} transition-[box-shadow,scale] duration-100 ease-out motion-reduce:transition-none`,
      'shadow-card group-hover/card:shadow-card-hover group-data-[active=true]/card:shadow-card-hover',
      bookCardAspectClass(this.coverSquare()),
      this.selected() && 'scale-[0.93] outline-2 outline-offset-2 outline-primary',
    ),
  );
  protected readonly badgeClass = computed(() =>
    cn(
      'absolute left-2 top-2 z-10 rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-white',
      this.selectable() &&
        'transition-opacity group-hover/card:opacity-0 group-has-[:focus-visible]/card:opacity-0 group-data-[active=true]/card:opacity-0 motion-reduce:transition-none',
    ),
  );
  protected readonly overlayClass =
    'pointer-events-none absolute inset-x-0 bottom-0 z-20 flex translate-y-1 gap-1 p-1 opacity-0 transition-[opacity,translate] duration-150 group-hover/card:pointer-events-auto group-hover/card:translate-y-0 group-hover/card:opacity-100 group-has-[:focus-visible]/card:pointer-events-auto group-has-[:focus-visible]/card:translate-y-0 group-has-[:focus-visible]/card:opacity-100 pointer-fine:group-data-[active=true]/card:pointer-events-auto pointer-fine:group-data-[active=true]/card:translate-y-0 pointer-fine:group-data-[active=true]/card:opacity-100 motion-reduce:transition-none';
  protected readonly actionClass =
    'inline-flex items-center justify-center gap-1.5 rounded-md bg-black text-xs font-[550] text-white/90 ring-1 ring-inset ring-white/20 hover:text-white active:translate-y-px pointer-coarse:active:translate-y-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';
  protected readonly actionLabelClass = computed(() =>
    cn(
      'shrink-0 whitespace-nowrap',
      this.compactAction() && 'pointer-events-none absolute invisible w-max',
    ),
  );
  protected readonly metaTitleClass = 'min-h-[17px] truncate text-[13px]/[17px] font-[550] text-text';
  protected readonly metaMutedClass = 'min-h-[15px] truncate text-xs/[15px] text-text-muted';

  private updateActionFit(button: HTMLButtonElement, label: HTMLElement): void {
    const icon = button.querySelector<SVGElement>('svg')!;

    const style = getComputedStyle(button);
    const availableWidth = button.clientWidth
      - Number.parseFloat(style.paddingLeft)
      - Number.parseFloat(style.paddingRight);
    const requiredWidth = icon.getBoundingClientRect().width
      + Number.parseFloat(style.columnGap)
      + label.getBoundingClientRect().width;
    const compact = requiredWidth > availableWidth + 0.5;

    this.compactAction.set(compact);
  }

  protected onCardClick(event: MouseEvent): void {
    if (this.consumeLongPress()) {
      event.preventDefault();
      return;
    }
    if (isContextMenuGesture(event)) {
      event.preventDefault();
      return;
    }
    if (this.detailMode() === 'request' && isPlainLeftClick(event)) {
      event.preventDefault();
      this.detailRequested.emit();
    }
  }

  protected onSelectOverlay(event: MouseEvent): void {
    if (isContextMenuGesture(event)) {
      event.preventDefault();
      return;
    }
    this.toggleSelect.emit({shiftKey: event.shiftKey});
  }

  protected onPointerDown(event: PointerEvent): void {
    this.cancelLongPress();
    this.longPressFired = false;
    if (event.pointerType === 'mouse' || !this.overlays() || this.selectionActive()) {
      return;
    }
    const request = contextMenuRequest(event);
    this.pressOrigin = {x: event.clientX, y: event.clientY};
    this.pressTimer = window.setTimeout(() => {
      this.pressTimer = null;
      this.longPressFired = true;
      this.menuRequested.emit(request);
    }, LONG_PRESS_MS);
  }

  protected onPointerMove(event: PointerEvent): void {
    const origin = this.pressOrigin;
    if (this.pressTimer === null || !origin) {
      return;
    }
    const moved = Math.hypot(event.clientX - origin.x, event.clientY - origin.y);
    if (moved > LONG_PRESS_TOLERANCE_PX) {
      this.cancelLongPress();
    }
  }

  protected onPointerEnd(): void {
    this.cancelLongPress();
  }

  protected onAction(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.action.emit();
  }

  protected onMenu(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.menuRequested.emit(contextMenuRequest(event));
  }

  protected onContextMenu(event: MouseEvent): void {
    this.cancelLongPress();
    if (!this.overlays()) {
      return;
    }
    event.preventDefault();
    if (this.consumeLongPress()) {
      return;
    }
    this.menuRequested.emit(contextMenuRequest(event));
  }

  private cancelLongPress(): void {
    if (this.pressTimer !== null) {
      clearTimeout(this.pressTimer);
      this.pressTimer = null;
    }
    this.pressOrigin = null;
  }

  private consumeLongPress(): boolean {
    if (!this.longPressFired) {
      return false;
    }
    this.longPressFired = false;
    return true;
  }
}
