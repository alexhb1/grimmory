import {
  afterRenderEffect,
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import {toSignal} from '@angular/core/rxjs-interop';
import {RouterLink} from '@angular/router';
import {TranslocoPipe, TranslocoService} from '@jsverse/transloco';
import {LucideArrowRight, LucideBookOpen, LucideCheck, LucideEllipsisVertical, LucideHeadphones, LucidePlay} from '@lucide/angular';

import {BookSummary} from '../../../../features/book/data/book-response.models';
import {UrlHelperService} from '../../../service/url-helper.service';
import {CoverComponent} from '../../cover/cover.component';
import {AppTooltipDirective} from '../../../ui/tooltip/app-tooltip.directive';
import {cn} from '../../../ui/cn';
import {
  CARD_CHECK_ICON,
  CARD_CHECKBOX_BASE,
  CARD_CHECKBOX_SELECTED,
  CARD_COVER_SHADOW,
  CARD_COVER_SHADOW_HOVER,
  CARD_META_MUTED,
  CARD_META_TITLE,
  CARD_OVERLAY_BASE,
  CARD_OVERLAY_PINNED,
  CARD_TRANSLUCENT_ACTION,
  isMacContextClick,
  isSelectionToggleClick,
} from '../card-chrome';

export const BOOK_CARD_COVER_ASPECT = 7 / 5;
export const BOOK_CARD_META_PADDING_TOP = 8;
export const BOOK_CARD_META_TITLE_HEIGHT = 17;
export const BOOK_CARD_META_AUTHOR_HEIGHT = 16;
export const BOOK_CARD_META_ACCESSORY_HEIGHT = 15;

export interface BookCardHeightOptions {
  square?: boolean;
  metaLines?: 0 | 2 | 3 | 4;
}

export function bookCardMetaHeight(metaLines: 0 | 2 | 3 | 4): number {
  if (metaLines === 0) {
    return 0;
  }
  return (
    BOOK_CARD_META_PADDING_TOP +
    BOOK_CARD_META_TITLE_HEIGHT +
    BOOK_CARD_META_AUTHOR_HEIGHT +
    (metaLines - 2) * BOOK_CARD_META_ACCESSORY_HEIGHT
  );
}

export function bookCardHeightForWidth(width: number, opts: BookCardHeightOptions = {}): number {
  const {square = false, metaLines = 2} = opts;
  const coverHeight = Math.round(width * (square ? 1 : BOOK_CARD_COVER_ASPECT));
  return coverHeight + bookCardMetaHeight(metaLines);
}

@Component({
  selector: 'app-book-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TranslocoPipe, CoverComponent, AppTooltipDirective, LucideArrowRight, LucideBookOpen, LucideCheck, LucideEllipsisVertical, LucideHeadphones, LucidePlay],
  host: {class: 'block @container'},
  templateUrl: './book-card.component.html',
})
export class BookCardComponent {
  readonly book = input.required<BookSummary>();
  readonly squareCovers = input(false, {transform: booleanAttribute});
  readonly showBadge = input(true, {transform: booleanAttribute});
  readonly showProgress = input(true, {transform: booleanAttribute});
  readonly showMeta = input(true, {transform: booleanAttribute});
  readonly overlays = input(true, {transform: booleanAttribute});
  readonly eyebrow = input<string | null>(null);
  readonly eyebrowTone = input<'muted' | 'primary'>('muted');
  readonly whenLine = input<string | null>(null);
  readonly actionMode = input<'hover' | 'always' | 'none'>('hover');
  readonly actionLabel = input<string | null>(null);
  readonly selectable = input(false, {transform: booleanAttribute});
  readonly selected = input(false, {transform: booleanAttribute});
  readonly selectionActive = input(false, {transform: booleanAttribute});
  readonly menuOpen = input(false, {transform: booleanAttribute});

  readonly toggleSelect = output<{shiftKey: boolean}>();
  readonly action = output<void>();
  readonly menuRequested = output<MouseEvent>();

  private readonly urlHelper = inject(UrlHelperService);
  private readonly transloco = inject(TranslocoService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly actionButton = viewChild<ElementRef<HTMLButtonElement>>('actionButton');
  private readonly actionLabelElement = viewChild<ElementRef<HTMLElement>>('actionLabel');
  protected readonly compactAction = signal(false);
  private readonly activeLang = toSignal(this.transloco.langChanges$, {
    initialValue: this.transloco.getActiveLang(),
  });

  constructor() {
    let resizeObserver: ResizeObserver | null = null;

    afterRenderEffect(() => {
      this.actionText();
      const button = this.actionButton()?.nativeElement;
      const label = this.actionLabelElement()?.nativeElement;

      resizeObserver?.disconnect();
      if (!button || !label) {
        this.compactAction.set(false);
        return;
      }

      const update = () => this.updateActionFit(button, label);
      update();

      if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(update);
        resizeObserver.observe(button);
        resizeObserver.observe(label);
      }
    });

    this.destroyRef.onDestroy(() => resizeObserver?.disconnect());
  }

  protected readonly title = computed(() => this.book().metadata?.title ?? '');
  protected readonly authors = computed(() => this.book().metadata?.authors ?? []);
  protected readonly authorsLabel = computed(() => this.authors().join(', '));
  protected readonly seriesNumber = computed(() => this.book().metadata?.seriesNumber ?? null);

  protected readonly isAudiobook = computed(() => this.book().primaryFile?.bookType === 'AUDIOBOOK');
  private readonly hasAudiobookFormat = computed(() => {
    const b = this.book();
    return (
      b.primaryFile?.bookType === 'AUDIOBOOK' ||
      (b.alternativeFormats ?? []).some(file => file.bookType === 'AUDIOBOOK')
    );
  });
  protected readonly coverSquare = computed(() => this.isAudiobook() || this.squareCovers());
  protected readonly coverFit = computed<'cover' | 'contain'>(() => (this.coverSquare() ? 'contain' : 'cover'));
  protected readonly coverSrc = computed(() => {
    const b = this.book();
    return this.isAudiobook() || (this.squareCovers() && this.hasAudiobookFormat())
      ? this.urlHelper.getAudiobookThumbnailUrl(b.id, b.metadata?.audiobookCoverUpdatedOn)
      : this.urlHelper.getThumbnailUrl(b.id, b.metadata?.coverUpdatedOn);
  });

  protected readonly progressPercentage = computed(() => {
    const b = this.book();
    const grimmory =
      b.epubProgress?.percentage ??
      b.pdfProgress?.percentage ??
      b.cbxProgress?.percentage ??
      b.audiobookProgress?.percentage;
    return grimmory ?? b.koreaderProgress?.percentage ?? b.koboProgress?.percentage ?? null;
  });

  protected readonly progressTooltip = computed(() => {
    const b = this.book();
    const grimmory =
      b.epubProgress?.percentage ??
      b.pdfProgress?.percentage ??
      b.cbxProgress?.percentage ??
      b.audiobookProgress?.percentage ??
      null;
    const parts: string[] = [];
    if (grimmory !== null) {
      parts.push(`Grimmory ${Math.round(grimmory)}%`);
    }
    if (b.koreaderProgress?.percentage != null) {
      parts.push(`KOReader ${Math.round(b.koreaderProgress.percentage)}%`);
    }
    if (b.koboProgress?.percentage != null) {
      parts.push(`Kobo ${Math.round(b.koboProgress.percentage)}%`);
    }
    return parts.join(' · ');
  });

  protected readonly audiobookHero = computed(() => this.actionMode() === 'always' && this.isAudiobook());
  protected readonly isContinueAction = computed(() =>
    !this.isAudiobook() && this.progressPercentage() !== null,
  );

  private readonly verbKey = computed(() => {
    if (this.isAudiobook()) {
      return 'cards.book.play';
    }
    return this.progressPercentage() !== null ? 'cards.book.continue' : 'cards.book.read';
  });
  protected readonly actionText = computed(() => {
    this.activeLang();
    return this.actionLabel() ?? this.transloco.translate(this.verbKey());
  });

  private readonly checkboxTakesOver = computed(
    () => this.selectable() && (this.selected() || this.selectionActive()),
  );
  protected readonly badgeVisible = computed(
    () => this.showBadge() && this.seriesNumber() !== null && !this.checkboxTakesOver(),
  );

  protected readonly rootClass = computed(() =>
    cn(
      'group/card relative block min-w-0 cursor-pointer rounded-[clamp(6px,8cqi,12px)]',
      'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
      this.overlays() && this.actionMode() === 'hover' && 'group/lift',
      this.actionMode() === 'always' && 'group/lift cover-lifted',
      this.menuOpen() && 'cover-lifted',
    ),
  );
  protected readonly slotClass = computed(() =>
    cn('flex flex-col justify-end', this.squareCovers() ? 'aspect-square' : 'aspect-[5/7]'),
  );
  protected readonly coverClass = computed(() =>
    cn(
      'relative w-full overflow-hidden rounded-[clamp(6px,8cqi,12px)] transition-[box-shadow,scale] duration-100 ease-out motion-reduce:transition-none',
      CARD_COVER_SHADOW,
      CARD_COVER_SHADOW_HOVER,
      this.coverSquare() ? 'aspect-square' : 'aspect-[5/7]',
      this.selected() && 'scale-[0.93] outline-2 outline-offset-2 outline-primary',
    ),
  );
  protected readonly badgeClass = computed(() =>
    cn(
      'absolute left-2 top-2 z-10 rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-white',
      this.selectable() &&
        'transition-opacity group-hover/card:opacity-0 group-has-[:focus-visible]/card:opacity-0 motion-reduce:transition-none',
    ),
  );
  protected readonly checkboxClass = computed(() =>
    cn(
      CARD_CHECKBOX_BASE,
      'left-2 top-2',
      (this.selected() || this.selectionActive()) && 'opacity-100',
      this.selected() && CARD_CHECKBOX_SELECTED,
    ),
  );
  protected readonly checkIconClass = computed(() =>
    cn(CARD_CHECK_ICON, this.selected() && 'opacity-100'),
  );
  protected readonly progressTrackClass = 'absolute inset-x-0 bottom-0 z-10 h-1 bg-black/45';
  protected readonly eyebrowClass = computed(() =>
    cn(
      'min-h-[15px] truncate text-[10.5px]/[15px] font-semibold',
      this.eyebrowTone() === 'primary' ? 'text-primary' : 'text-text-muted',
    ),
  );

  protected readonly overlayClass = computed(() =>
    cn(CARD_OVERLAY_BASE, 'gap-1 p-1', this.menuOpen() && CARD_OVERLAY_PINNED),
  );
  protected readonly actionLabelClass = computed(() =>
    cn(
      'shrink-0 whitespace-nowrap',
      this.compactAction() && 'pointer-events-none absolute invisible w-max',
    ),
  );
  protected readonly translucentAction = CARD_TRANSLUCENT_ACTION;
  protected readonly metaTitleClass = CARD_META_TITLE;
  protected readonly metaMutedClass = CARD_META_MUTED;

  private updateActionFit(button: HTMLButtonElement, label: HTMLElement): void {
    const icon = button.querySelector<SVGElement>('svg');
    if (!icon) {
      return;
    }

    const style = getComputedStyle(button);
    const availableWidth = button.clientWidth
      - (Number.parseFloat(style.paddingLeft) || 0)
      - (Number.parseFloat(style.paddingRight) || 0);
    const requiredWidth = icon.getBoundingClientRect().width
      + (Number.parseFloat(style.columnGap) || 0)
      + label.getBoundingClientRect().width;
    const compact = requiredWidth > availableWidth + 0.5;

    if (untracked(this.compactAction) !== compact) {
      this.compactAction.set(compact);
    }
  }

  protected onCardClick(event: MouseEvent): void {
    if (isMacContextClick(event)) {
      event.preventDefault();
      return;
    }
    if (this.selectionActive() || isSelectionToggleClick(event)) {
      event.preventDefault();
      this.toggleSelect.emit({shiftKey: event.shiftKey});
    }
  }

  protected onCardSpace(event: Event): void {
    if (!this.selectable() || event.target !== event.currentTarget) {
      return;
    }
    event.preventDefault();
    this.toggleSelect.emit({shiftKey: (event as KeyboardEvent).shiftKey});
  }

  protected onCheckboxClick(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.toggleSelect.emit({shiftKey: event.shiftKey});
  }

  protected onAction(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.action.emit();
  }

  protected onMenu(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.menuRequested.emit(event);
  }

  protected onContextMenu(event: MouseEvent): void {
    if (!this.overlays()) {
      return;
    }
    event.preventDefault();
    this.menuRequested.emit(event);
  }
}
