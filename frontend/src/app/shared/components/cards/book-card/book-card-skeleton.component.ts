import {booleanAttribute, ChangeDetectionStrategy, Component, computed, input} from '@angular/core';

import {
  BOOK_CARD_META_AUTHOR_HEIGHT,
  BOOK_CARD_META_PADDING_TOP,
  BOOK_CARD_META_TITLE_HEIGHT,
} from './book-card.component';

@Component({
  selector: 'app-book-card-skeleton',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {class: 'block @container'},
  template: `
    <div class="w-full min-w-0" aria-hidden="true">
      <div [class]="coverClass()" data-testid="skeleton-cover"></div>
      @if (metaLines() === 2) {
        <div class="px-0.5" [style.paddingTop.px]="metaPaddingTop" data-testid="skeleton-meta">
          <div class="flex items-center" [style.height.px]="titleHeight">
            <div [class]="barClass + ' h-[11px] w-3/4'"></div>
          </div>
          <div class="flex items-center" [style.height.px]="authorHeight">
            <div [class]="barClass + ' h-[9px] w-1/2'"></div>
          </div>
        </div>
      }
    </div>
  `,
})
export class BookCardSkeletonComponent {
  readonly squareCovers = input(false, {transform: booleanAttribute});
  readonly metaLines = input<0 | 2>(2);

  protected readonly metaPaddingTop = BOOK_CARD_META_PADDING_TOP;
  protected readonly titleHeight = BOOK_CARD_META_TITLE_HEIGHT;
  protected readonly authorHeight = BOOK_CARD_META_AUTHOR_HEIGHT;

  protected readonly barClass = 'rounded bg-skeleton-base animate-skeleton motion-reduce:animate-none';
  protected readonly coverClass = computed(
    () =>
      `w-full rounded-[clamp(6px,8cqi,12px)] bg-skeleton-base animate-skeleton motion-reduce:animate-none ${
        this.squareCovers() ? 'aspect-square' : 'aspect-[5/7]'
      }`,
  );
}
