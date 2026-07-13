import {booleanAttribute, ChangeDetectionStrategy, Component, computed, inject, input, output} from '@angular/core';
import {RouterLink} from '@angular/router';
import {TranslocoPipe} from '@jsverse/transloco';
import {LucideBookOpen, LucideEllipsisVertical} from '@lucide/angular';

import {BookSummary} from '../../../../features/book/data/book-response.models';
import {SeriesSummary} from '../../../../features/series-browser/model/series.model';
import {UrlHelperService} from '../../../service/url-helper.service';
import {CoverComponent} from '../../cover/cover.component';
import {cn} from '../../../ui/cn';
import {
  CARD_COVER_SHADOW,
  CARD_COVER_SHADOW_HOVER,
  CARD_META_MUTED,
  CARD_META_TITLE,
  CARD_OVERLAY_BASE,
  CARD_OVERLAY_PINNED,
  CARD_TRANSLUCENT_ACTION,
} from '../card-chrome';


@Component({
  selector: 'app-series-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TranslocoPipe, CoverComponent, LucideBookOpen, LucideEllipsisVertical],
  templateUrl: './series-card.component.html',
})
export class SeriesCardComponent {
  readonly series = input.required<SeriesSummary>();
  readonly menuOpen = input(false, {transform: booleanAttribute});
  readonly hasMenu = input(false, {transform: booleanAttribute});

  readonly action = output<void>();
  readonly menuRequested = output<MouseEvent>();

  private readonly urlHelper = inject(UrlHelperService);

  protected readonly seriesName = computed(() => this.series().seriesName);
  protected readonly covers = computed(() => (this.series().coverBooks ?? []) as unknown as BookSummary[]);
  protected readonly front = computed(() => this.covers()[0] ?? null);
  protected readonly back1 = computed(() => this.covers()[1] ?? null);
  protected readonly back2 = computed(() => this.covers()[2] ?? null);
  protected readonly single = computed(() => this.covers().length <= 1);

  protected readonly bookCount = computed(() => this.series().bookCount);
  protected readonly readCount = computed(() => this.series().readCount);
  protected readonly readPercent = computed(() => Math.round(this.series().progress * 100));
  protected readonly showProgress = computed(() => this.readCount() > 0);

  protected readonly rootClass = computed(() =>
    cn(
      'group/card group/lift relative block min-w-0 cursor-pointer rounded-lg',
      'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
      this.menuOpen() && 'cover-lifted',
    ),
  );

  protected readonly frontLayerClass = cn(
    'absolute overflow-hidden rounded-lg transition-[box-shadow] duration-200 ease-out motion-reduce:transition-none',
    CARD_COVER_SHADOW,
    CARD_COVER_SHADOW_HOVER,
  );
  protected readonly backLayerBase = cn(
    'absolute overflow-hidden rounded-lg transition-transform duration-200 ease-out motion-reduce:transition-none',
    CARD_COVER_SHADOW,
  );

  protected readonly progressTrackClass = computed(() =>
    cn(
      'absolute inset-x-0 bottom-0 z-10 h-[3px] bg-black/35 transition-opacity group-hover/card:opacity-0 group-has-[:focus-visible]/card:opacity-0 motion-reduce:transition-none',
      this.menuOpen() && 'opacity-0',
    ),
  );

  protected readonly overlayClass = computed(() => cn(CARD_OVERLAY_BASE, this.menuOpen() && CARD_OVERLAY_PINNED));
  protected readonly translucentAction = CARD_TRANSLUCENT_ACTION;
  protected readonly metaTitleClass = CARD_META_TITLE;
  protected readonly metaMutedClass = CARD_META_MUTED;

  protected coverSrc(book: BookSummary): string | null {
    return this.urlHelper.getThumbnailUrl(book.id, book.metadata?.coverUpdatedOn);
  }

  protected coverTitle(book: BookSummary): string {
    return book.metadata?.title ?? '';
  }

  protected coverAuthors(book: BookSummary): string[] {
    return book.metadata?.authors ?? [];
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
    if (!this.hasMenu()) {
      return;
    }
    event.preventDefault();
    this.menuRequested.emit(event);
  }
}
