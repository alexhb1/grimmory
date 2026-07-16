import {ComponentFixture, TestBed} from '@angular/core/testing';
import {provideRouter} from '@angular/router';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {getTranslocoModule} from '../../../../core/testing/transloco-testing';
import {UrlHelperService} from '../../../service/url-helper.service';
import {BookSummary} from '../../../../features/book/data/book-response.models';
import {
  BookCardComponent,
  bookCardHeightForWidth,
  bookCardMetaHeight,
} from './book-card.component';

function makeBook(overrides: Partial<BookSummary> = {}): BookSummary {
  return {
    id: 1,
    libraryId: 1,
    libraryName: 'Library',
    metadata: {
      bookId: 1,
      title: 'The Warden',
      authors: ['Anthony Trollope'],
      allMetadataLocked: false,
    },
    primaryFile: {id: 10, bookId: 1, book: true, folderBased: false, bookType: 'EPUB'},
    ...overrides,
  };
}

function textButtons(host: HTMLElement): HTMLButtonElement[] {
  return Array.from(host.querySelectorAll('button'));
}

function pill(host: HTMLElement): HTMLButtonElement | undefined {
  return textButtons(host).find(b => (b.textContent ?? '').trim().length > 0);
}

function buttonByAria(host: HTMLElement, prefix: string): HTMLButtonElement | undefined {
  return textButtons(host).find(b => (b.getAttribute('aria-label') ?? '').startsWith(prefix));
}

describe('BookCardComponent', () => {
  let fixture: ComponentFixture<BookCardComponent>;
  let component: BookCardComponent;
  let host: HTMLElement;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [BookCardComponent, getTranslocoModule()],
      providers: [
        provideRouter([{path: '**', children: []}]),
        {
          provide: UrlHelperService,
          useValue: {
            getThumbnailUrl: (id: number) => `/thumb/${id}`,
            getAudiobookThumbnailUrl: (id: number) => `/audio-thumb/${id}`,
          },
        },
      ],
    });

    fixture = TestBed.createComponent(BookCardComponent);
    component = fixture.componentInstance;
    host = fixture.nativeElement as HTMLElement;
  });

  function render(book: BookSummary): void {
    fixture.componentRef.setInput('book', book);
    fixture.detectChanges();
  }

  describe('verb label', () => {
    it('reads "Read" with no progress and a non-audiobook', () => {
      render(makeBook());
      expect(pill(host)?.textContent?.trim()).toBe('Read');
    });

    it('reads "Continue" when progress is present', () => {
      render(makeBook({epubProgress: {cfi: null, href: null, contentSourceProgressPercent: null, percentage: 34, ttsPositionCfi: null}}));
      expect(pill(host)?.textContent?.trim()).toBe('Continue');
    });

    it('reads "Play" for an audiobook', () => {
      render(makeBook({primaryFile: {id: 10, bookId: 1, book: true, folderBased: false, bookType: 'AUDIOBOOK'}}));
      expect(pill(host)?.textContent?.trim()).toBe('Play');
    });

    it('honours the actionLabel override', () => {
      fixture.componentRef.setInput('actionLabel', 'Resume');
      render(makeBook({epubProgress: {cfi: null, href: null, contentSourceProgressPercent: null, percentage: 34, ttsPositionCfi: null}}));
      expect(pill(host)?.textContent?.trim()).toBe('Resume');
    });

    it('keeps the action accessible when its visible label is hidden at compact widths', () => {
      render(makeBook({epubProgress: {cfi: null, href: null, contentSourceProgressPercent: null, percentage: 34, ttsPositionCfi: null}}));
      const action = pill(host) as HTMLButtonElement;

      expect(action.getAttribute('aria-label')).toBe('Continue');
      expect(action.querySelector('span')?.textContent?.trim()).toBe('Continue');
    });
  });

  describe('progress', () => {
    function progressWidth(): string | undefined {
      return host.querySelector<HTMLElement>('[data-testid="progress"] i')?.style.width;
    }

    it('prefers Grimmory epub over pdf and cbx', () => {
      render(makeBook({epubProgress: {cfi: null, href: null, contentSourceProgressPercent: null, percentage: 30, ttsPositionCfi: null}, pdfProgress: {page: 1, percentage: 50}, cbxProgress: {page: 1, percentage: 70}}));
      expect(progressWidth()).toBe('30%');
    });

    it('reads audiobook progress as a Grimmory source', () => {
      render(makeBook({audiobookProgress: {positionMs: 1000, trackIndex: null, trackPositionMs: null, percentage: 82}}));
      expect(progressWidth()).toBe('82%');
    });

    it('falls back to KOReader when Grimmory is absent', () => {
      render(makeBook({koreaderProgress: {percentage: 42}}));
      expect(progressWidth()).toBe('42%');
    });

    it('falls back to Kobo when Grimmory and KOReader are absent', () => {
      render(makeBook({koboProgress: {percentage: 12}}));
      expect(progressWidth()).toBe('12%');
    });

    it('renders no bar when every source is null', () => {
      render(makeBook());
      expect(host.querySelector('[data-testid="progress"]')).toBeNull();
    });
  });

  describe('badge vs checkbox', () => {
    it('shows the series-number badge at rest', () => {
      render(makeBook({metadata: {bookId: 1, title: 'Book', seriesNumber: 2, allMetadataLocked: false}}));
      expect(host.querySelector('[data-testid="badge"]')?.textContent?.trim()).toBe('#2');
    });

    it('hides the badge when the checkbox takes over (selectable + selected)', () => {
      fixture.componentRef.setInput('selectable', true);
      fixture.componentRef.setInput('selected', true);
      render(makeBook({metadata: {bookId: 1, title: 'Book', seriesNumber: 2, allMetadataLocked: false}}));
      expect(host.querySelector('[data-testid="badge"]')).toBeNull();
    });
  });

  describe('selection', () => {
    it('emits toggleSelect and prevents navigation on a plain click while selectionActive', () => {
      fixture.componentRef.setInput('selectionActive', true);
      render(makeBook());

      const emitted: {shiftKey: boolean}[] = [];
      component.toggleSelect.subscribe(v => emitted.push(v));

      const anchor = host.querySelector('a') as HTMLAnchorElement;
      const event = new MouseEvent('click', {bubbles: true, cancelable: true, shiftKey: true});
      anchor.dispatchEvent(event);

      expect(emitted).toEqual([{shiftKey: true}]);
      expect(event.defaultPrevented).toBe(true);
    });

    it('emits toggleSelect on a ctrl/meta-click', () => {
      render(makeBook());

      const emitted: {shiftKey: boolean}[] = [];
      component.toggleSelect.subscribe(v => emitted.push(v));

      const anchor = host.querySelector('a') as HTMLAnchorElement;
      const event = new MouseEvent('click', {bubbles: true, cancelable: true, ctrlKey: true});
      anchor.dispatchEvent(event);

      expect(emitted).toHaveLength(1);
      expect(event.defaultPrevented).toBe(true);
    });

    it('does not toggle selection on a plain click when selection is inactive (RouterLink navigates)', () => {
      render(makeBook());

      const emitted: unknown[] = [];
      component.toggleSelect.subscribe(v => emitted.push(v));

      const anchor = host.querySelector('a') as HTMLAnchorElement;
      const event = new MouseEvent('click', {bubbles: true, cancelable: true});
      anchor.dispatchEvent(event);

      expect(emitted).toHaveLength(0);
    });

    it('toggles selection on Space when selectable, preventing scroll', () => {
      fixture.componentRef.setInput('selectable', true);
      render(makeBook());
      const emitted: {shiftKey: boolean}[] = [];
      component.toggleSelect.subscribe(v => emitted.push(v));

      const anchor = host.querySelector('a') as HTMLAnchorElement;
      const event = new KeyboardEvent('keydown', {key: ' ', bubbles: true, cancelable: true, shiftKey: true});
      anchor.dispatchEvent(event);

      expect(emitted).toEqual([{shiftKey: true}]);
      expect(event.defaultPrevented).toBe(true);
    });

    it('ignores Space when not selectable', () => {
      render(makeBook());
      const emitted: unknown[] = [];
      component.toggleSelect.subscribe(v => emitted.push(v));

      const anchor = host.querySelector('a') as HTMLAnchorElement;
      const event = new KeyboardEvent('keydown', {key: ' ', bubbles: true, cancelable: true});
      anchor.dispatchEvent(event);

      expect(emitted).toHaveLength(0);
      expect(event.defaultPrevented).toBe(false);
    });

    it('leaves Space alone on inner controls (checkbox keeps native activation)', () => {
      fixture.componentRef.setInput('selectable', true);
      render(makeBook());
      const emitted: unknown[] = [];
      component.toggleSelect.subscribe(v => emitted.push(v));

      const checkbox = buttonByAria(host, 'Select') as HTMLButtonElement;
      const event = new KeyboardEvent('keydown', {key: ' ', bubbles: true, cancelable: true});
      checkbox.dispatchEvent(event);

      expect(emitted).toHaveLength(0);
      expect(event.defaultPrevented).toBe(false);
    });

    describe('on macOS', () => {
      let original: PropertyDescriptor | undefined;

      beforeEach(() => {
        original = Object.getOwnPropertyDescriptor(navigator, 'platform');
        Object.defineProperty(navigator, 'platform', {value: 'MacIntel', configurable: true});
      });
      afterEach(() => {
        if (original) {
          Object.defineProperty(navigator, 'platform', original);
        } else {
          delete (navigator as unknown as Record<string, unknown>)['platform'];
        }
      });

      it('swallows ctrl+click without toggling — it is the context gesture tail', () => {
        render(makeBook());
        const emitted: unknown[] = [];
        component.toggleSelect.subscribe(v => emitted.push(v));

        const anchor = host.querySelector('a') as HTMLAnchorElement;
        const event = new MouseEvent('click', {bubbles: true, cancelable: true, ctrlKey: true});
        anchor.dispatchEvent(event);

        expect(emitted).toHaveLength(0);
        expect(event.defaultPrevented).toBe(true);
      });

      it('toggles selection on cmd-click', () => {
        render(makeBook());
        const emitted: {shiftKey: boolean}[] = [];
        component.toggleSelect.subscribe(v => emitted.push(v));

        const anchor = host.querySelector('a') as HTMLAnchorElement;
        const event = new MouseEvent('click', {bubbles: true, cancelable: true, metaKey: true});
        anchor.dispatchEvent(event);

        expect(emitted).toHaveLength(1);
        expect(event.defaultPrevented).toBe(true);
      });
    });
  });

  describe('action & menu emissions do not navigate', () => {
    it('emits action and prevents default from the pill', () => {
      render(makeBook());
      const spy = vi.fn();
      component.action.subscribe(spy);

      const button = pill(host) as HTMLButtonElement;
      const event = new MouseEvent('click', {bubbles: true, cancelable: true});
      button.dispatchEvent(event);

      expect(spy).toHaveBeenCalledTimes(1);
      expect(event.defaultPrevented).toBe(true);
    });

    it('emits menuRequested and prevents default from the kebab', () => {
      render(makeBook());
      const spy = vi.fn();
      component.menuRequested.subscribe(spy);

      const kebab = buttonByAria(host, 'Options for') as HTMLButtonElement;
      const event = new MouseEvent('click', {bubbles: true, cancelable: true});
      kebab.dispatchEvent(event);

      expect(spy).toHaveBeenCalledTimes(1);
      expect(event.defaultPrevented).toBe(true);
    });

    it('emits toggleSelect and prevents default from the checkbox button', () => {
      fixture.componentRef.setInput('selectable', true);
      render(makeBook());

      const emitted: {shiftKey: boolean}[] = [];
      component.toggleSelect.subscribe(v => emitted.push(v));

      const checkbox = buttonByAria(host, 'Select') as HTMLButtonElement;
      const event = new MouseEvent('click', {bubbles: true, cancelable: true, shiftKey: true});
      checkbox.dispatchEvent(event);

      expect(emitted).toEqual([{shiftKey: true}]);
      expect(event.defaultPrevented).toBe(true);
    });
  });

  describe('context menu', () => {
    function dispatchContextMenu(): MouseEvent {
      const anchor = host.querySelector('a') as HTMLAnchorElement;
      const event = new MouseEvent('contextmenu', {bubbles: true, cancelable: true});
      anchor.dispatchEvent(event);
      return event;
    }

    it('emits menuRequested and prevents the native menu when overlays are on', () => {
      render(makeBook());
      const spy = vi.fn();
      component.menuRequested.subscribe(spy);

      const event = dispatchContextMenu();

      expect(spy).toHaveBeenCalledTimes(1);
      expect(event.defaultPrevented).toBe(true);
    });

    it('does neither when overlays are off (native menu stays)', () => {
      fixture.componentRef.setInput('overlays', false);
      render(makeBook());
      const spy = vi.fn();
      component.menuRequested.subscribe(spy);

      const event = dispatchContextMenu();

      expect(spy).not.toHaveBeenCalled();
      expect(event.defaultPrevented).toBe(false);
    });
  });

  describe('menuOpen pins the overlay', () => {
    it('forces the overlay visible while the progress bar stays put', () => {
      fixture.componentRef.setInput('menuOpen', true);
      render(makeBook({epubProgress: {cfi: null, href: null, contentSourceProgressPercent: null, percentage: 34, ttsPositionCfi: null}}));

      const overlay = host.querySelector('[data-testid="overlay"]') as HTMLElement;
      expect(overlay.className).toContain('opacity-100');
      expect(overlay.className).toContain('translate-y-0');

      const progress = host.querySelector('[data-testid="progress"]') as HTMLElement;
      expect(progress.className).not.toContain('opacity-0');

      const root = host.querySelector('a') as HTMLAnchorElement;
      expect(root.className).toContain('cover-lifted');
    });
  });

  describe('audiobook hero glyph', () => {
    it('shows the headphones glyph for an audiobook hero (always mode)', () => {
      fixture.componentRef.setInput('actionMode', 'always');
      render(makeBook({primaryFile: {id: 10, bookId: 1, book: true, folderBased: false, bookType: 'AUDIOBOOK'}}));
      expect(host.querySelector('[data-testid="hero-glyph"]')).not.toBeNull();
    });

    it('hides the glyph for an ebook hero', () => {
      fixture.componentRef.setInput('actionMode', 'always');
      render(makeBook());
      expect(host.querySelector('[data-testid="hero-glyph"]')).toBeNull();
    });

    it('hides the glyph for an audiobook in hover mode', () => {
      render(makeBook({primaryFile: {id: 10, bookId: 1, book: true, folderBased: false, bookType: 'AUDIOBOOK'}}));
      expect(host.querySelector('[data-testid="hero-glyph"]')).toBeNull();
    });
  });

  describe('aspect switching', () => {
    it('uses a 2/3 cover for a non-audiobook', () => {
      render(makeBook());
      const cover = host.querySelector('[data-testid="cover"]') as HTMLElement;
      expect(cover.className).toContain('aspect-[5/7]');
      expect(cover.className).not.toContain('aspect-square');
    });

    it('uses a square cover for an audiobook', () => {
      render(makeBook({primaryFile: {id: 10, bookId: 1, book: true, folderBased: false, bookType: 'AUDIOBOOK'}}));
      const cover = host.querySelector('[data-testid="cover"]') as HTMLElement;
      expect(cover.className).toContain('aspect-square');
    });

    it('squares the whole slot in square-covers mode', () => {
      fixture.componentRef.setInput('squareCovers', true);
      render(makeBook());
      const slot = host.querySelector('[data-testid="slot"]') as HTMLElement;
      expect(slot.className).toContain('aspect-square');
    });
  });

  describe('capability flags', () => {
    it('drops the meta block when showMeta is false', () => {
      fixture.componentRef.setInput('showMeta', false);
      render(makeBook());
      expect(host.querySelector('[data-testid="meta"]')).toBeNull();
    });

    it('removes the pill and kebab when overlays is false', () => {
      fixture.componentRef.setInput('overlays', false);
      render(makeBook());
      expect(pill(host)).toBeUndefined();
      expect(buttonByAria(host, 'Options for')).toBeUndefined();
    });

    it('shows an always-visible action button in always mode without a kebab', () => {
      fixture.componentRef.setInput('actionMode', 'always');
      fixture.componentRef.setInput('actionLabel', 'Resume');
      render(makeBook());
      expect(pill(host)?.textContent?.trim()).toBe('Resume');
      expect(buttonByAria(host, 'Options for')).toBeUndefined();
    });
  });

  describe('bookCardHeightForWidth', () => {
    it('sums a 5/7 cover and the two-line meta by default', () => {
      expect(bookCardHeightForWidth(144)).toBe(243);
    });

    it('squares the cover when square is set', () => {
      expect(bookCardHeightForWidth(144, {square: true})).toBe(185);
    });

    it('drops the meta entirely in strip mode (0 lines)', () => {
      expect(bookCardHeightForWidth(144, {metaLines: 0})).toBe(202);
    });

    it('adds one accessory line for 3 meta lines and two for 4', () => {
      expect(bookCardHeightForWidth(144, {metaLines: 3})).toBe(258);
      expect(bookCardHeightForWidth(144, {metaLines: 4})).toBe(273);
    });

    it('exposes the meta-height mapping', () => {
      expect(bookCardMetaHeight(0)).toBe(0);
      expect(bookCardMetaHeight(2)).toBe(41);
      expect(bookCardMetaHeight(3)).toBe(56);
      expect(bookCardMetaHeight(4)).toBe(71);
    });
  });
});
