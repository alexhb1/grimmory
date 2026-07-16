import {booleanAttribute, ChangeDetectionStrategy, Component, computed, input, output, signal} from '@angular/core';
import {RouterLink} from '@angular/router';
import {TranslocoPipe} from '@jsverse/transloco';
import {LucideCheck, LucideEllipsisVertical} from '@lucide/angular';

import {AuthorSummary} from '../../../../features/author-browser/model/author.model';
import {cn} from '../../../ui/cn';
import {
  CARD_CHECK_ICON,
  CARD_CHECKBOX_BASE,
  CARD_CHECKBOX_SELECTED,
  CARD_COVER_SHADOW,
  CARD_COVER_SHADOW_HOVER,
  CARD_META_MUTED,
  CARD_META_TITLE,
  isMacContextClick,
  isSelectionToggleClick,
} from '../card-chrome';

export const AUTHOR_CARD_CIRCLE_RATIO = 0.78;
export const AUTHOR_CARD_META_PADDING_TOP = 8;
export const AUTHOR_CARD_META_NAME_HEIGHT = 17;
export const AUTHOR_CARD_META_COUNT_HEIGHT = 15;

export function authorCardHeightForWidth(width: number): number {
  return (
    Math.round(width * AUTHOR_CARD_CIRCLE_RATIO) +
    AUTHOR_CARD_META_PADDING_TOP +
    AUTHOR_CARD_META_NAME_HEIGHT +
    AUTHOR_CARD_META_COUNT_HEIGHT
  );
}

@Component({
  selector: 'app-author-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TranslocoPipe, LucideCheck, LucideEllipsisVertical],
  templateUrl: './author-card.component.html',
})
export class AuthorCardComponent {
  readonly author = input.required<AuthorSummary>();
  readonly photoUrl = input<string | null>(null);
  readonly selectable = input(false, {transform: booleanAttribute});
  readonly selected = input(false, {transform: booleanAttribute});
  readonly selectionActive = input(false, {transform: booleanAttribute});
  readonly menuOpen = input(false, {transform: booleanAttribute});
  readonly hasMenu = input(false, {transform: booleanAttribute});

  readonly toggleSelect = output<{shiftKey: boolean}>();
  readonly menuRequested = output<MouseEvent>();

  private readonly failedSrc = signal<string | null>(null);

  protected readonly name = computed(() => this.author().name);
  protected readonly authorId = computed(() => this.author().id);
  protected readonly bookCount = computed(() => this.author().bookCount);

  protected readonly initials = computed(() =>
    this.name()
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(word => word[0])
      .join('')
      .toUpperCase(),
  );

  protected readonly showPhoto = computed(() => {
    const url = this.photoUrl();
    return !!url && this.failedSrc() !== url;
  });

  protected readonly rootClass = cn(
    'group/card block cursor-pointer rounded-lg text-center',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
  );

  protected readonly circleClass = computed(() =>
    cn(
      'relative aspect-square w-full overflow-hidden rounded-full transition-[box-shadow,scale] duration-200 ease-out motion-reduce:transition-none',
      CARD_COVER_SHADOW,
      CARD_COVER_SHADOW_HOVER,
      this.selected() && 'scale-[1.03] outline-2 outline-offset-3 outline-primary',
    ),
  );

  protected readonly checkboxClass = computed(() =>
    cn(
      CARD_CHECKBOX_BASE,
      'left-1 top-1 z-30',
      (this.selected() || this.selectionActive()) && 'opacity-100',
      this.selected() && CARD_CHECKBOX_SELECTED,
    ),
  );
  protected readonly checkIconClass = computed(() => cn(CARD_CHECK_ICON, this.selected() && 'opacity-100'));

  protected readonly kebabClass = computed(() =>
    cn(
      'absolute left-full top-1/2 ml-0.5 flex size-5.5 -translate-y-1/2 items-center justify-center rounded-md bg-transparent text-text-muted opacity-0 transition-opacity',
      'hover:bg-surface-hover hover:text-text group-hover/card:opacity-100 group-has-[:focus-visible]/card:opacity-100 focus-visible:opacity-100 motion-reduce:transition-none',
      'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
      this.menuOpen() && 'opacity-100',
    ),
  );

  protected readonly metaTitleClass = CARD_META_TITLE;
  protected readonly metaMutedClass = CARD_META_MUTED;

  protected onImgError(): void {
    this.failedSrc.set(this.photoUrl());
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
