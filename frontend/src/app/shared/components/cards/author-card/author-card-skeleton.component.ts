import {ChangeDetectionStrategy, Component} from '@angular/core';

import {
  AUTHOR_CARD_META_COUNT_HEIGHT,
  AUTHOR_CARD_META_NAME_HEIGHT,
  AUTHOR_CARD_META_PADDING_TOP,
} from './author-card.component';

@Component({
  selector: 'app-author-card-skeleton',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="w-full min-w-0 text-center" aria-hidden="true">
      <div
        class="mx-auto aspect-square w-[78%] rounded-full bg-skeleton-base animate-skeleton motion-reduce:animate-none"
        data-testid="skeleton-circle"
      ></div>
      <div class="px-1" [style.paddingTop.px]="metaPaddingTop" data-testid="skeleton-meta">
        <div class="flex items-center justify-center" [style.height.px]="nameHeight">
          <div class="h-[11px] w-2/3 rounded bg-skeleton-base animate-skeleton motion-reduce:animate-none"></div>
        </div>
        <div class="flex items-center justify-center" [style.height.px]="countHeight">
          <div class="h-[9px] w-1/3 rounded bg-skeleton-base animate-skeleton motion-reduce:animate-none"></div>
        </div>
      </div>
    </div>
  `,
})
export class AuthorCardSkeletonComponent {
  protected readonly metaPaddingTop = AUTHOR_CARD_META_PADDING_TOP;
  protected readonly nameHeight = AUTHOR_CARD_META_NAME_HEIGHT;
  protected readonly countHeight = AUTHOR_CARD_META_COUNT_HEIGHT;
}
