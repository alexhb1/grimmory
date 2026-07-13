import {ChangeDetectionStrategy, Component} from '@angular/core';

import {
  BOOK_CARD_META_AUTHOR_HEIGHT,
  BOOK_CARD_META_PADDING_TOP,
  BOOK_CARD_META_TITLE_HEIGHT,
} from '../book-card/book-card.component';

@Component({
  selector: 'app-series-card-skeleton',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="w-full min-w-0" aria-hidden="true">
      <div class="relative aspect-[5/7] w-full" data-testid="skeleton-deck">
        <div class="absolute bottom-[12px] left-[12px] right-0 top-0 z-0 rounded-lg bg-skeleton-base opacity-40"></div>
        <div class="absolute inset-[6px] z-10 rounded-lg bg-skeleton-base opacity-70"></div>
        <div class="absolute bottom-0 left-0 right-[12px] top-[12px] z-20 rounded-lg bg-skeleton-base animate-skeleton motion-reduce:animate-none"></div>
      </div>
      <div class="px-0.5" [style.paddingTop.px]="metaPaddingTop" data-testid="skeleton-meta">
        <div class="flex items-center" [style.height.px]="titleHeight">
          <div class="h-[11px] w-3/4 rounded bg-skeleton-base animate-skeleton motion-reduce:animate-none"></div>
        </div>
        <div class="flex items-center" [style.height.px]="authorHeight">
          <div class="h-[9px] w-1/2 rounded bg-skeleton-base animate-skeleton motion-reduce:animate-none"></div>
        </div>
      </div>
    </div>
  `,
})
export class SeriesCardSkeletonComponent {
  protected readonly metaPaddingTop = BOOK_CARD_META_PADDING_TOP;
  protected readonly titleHeight = BOOK_CARD_META_TITLE_HEIGHT;
  protected readonly authorHeight = BOOK_CARD_META_AUTHOR_HEIGHT;
}
