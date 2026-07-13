import {ComponentFixture, TestBed} from '@angular/core/testing';
import {provideRouter} from '@angular/router';
import {beforeEach, describe, expect, it, vi} from 'vitest';

import {getTranslocoModule} from '../../../../core/testing/transloco-testing';
import {UrlHelperService} from '../../../service/url-helper.service';
import {BookSummary} from '../../../../features/book/data/book-response.models';
import {SeriesSummary} from '../../../../features/series-browser/model/series.model';
import {SeriesCardComponent} from './series-card.component';

function makeBook(id: number, title: string): BookSummary {
  return {
    id,
    libraryId: 1,
    libraryName: 'Library',
    metadata: {bookId: id, title, authors: ['Anthony Trollope'], allMetadataLocked: false},
    primaryFile: {id: id * 10, bookId: id, book: true, folderBased: false, bookType: 'EPUB'},
  };
}

interface SeriesOverrides {
  coverBooks?: BookSummary[];
  bookCount?: number;
  readCount?: number;
}

function makeSeries(overrides: SeriesOverrides = {}): SeriesSummary {
  const coverBooks = overrides.coverBooks ?? [makeBook(1, 'One'), makeBook(2, 'Two'), makeBook(3, 'Three')];
  const bookCount = overrides.bookCount ?? 6;
  const readCount = overrides.readCount ?? 3;
  return {
    seriesName: 'The Chronicles of Barsetshire',
    books: coverBooks,
    authors: [],
    categories: [],
    bookCount,
    readCount,
    progress: bookCount > 0 ? readCount / bookCount : 0,
    seriesStatus: 'READING',
    nextUnread: coverBooks[0] ?? null,
    lastReadTime: null,
    coverBooks,
    addedOn: null,
  } as unknown as SeriesSummary;
}

function textButtons(host: HTMLElement): HTMLButtonElement[] {
  return Array.from(host.querySelectorAll('button'));
}

function pill(host: HTMLElement): HTMLButtonElement | undefined {
  return textButtons(host).find(b => (b.textContent ?? '').trim().length > 0);
}

function kebab(host: HTMLElement): HTMLButtonElement | undefined {
  return textButtons(host).find(b => (b.getAttribute('aria-label') ?? '').startsWith('Options for'));
}

describe('SeriesCardComponent', () => {
  let fixture: ComponentFixture<SeriesCardComponent>;
  let component: SeriesCardComponent;
  let host: HTMLElement;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [SeriesCardComponent, getTranslocoModule()],
      providers: [
        provideRouter([{path: '**', children: []}]),
        {provide: UrlHelperService, useValue: {getThumbnailUrl: () => null}},
      ],
    });

    fixture = TestBed.createComponent(SeriesCardComponent);
    component = fixture.componentInstance;
    host = fixture.nativeElement as HTMLElement;
  });

  function render(series: SeriesSummary): void {
    fixture.componentRef.setInput('series', series);
    fixture.detectChanges();
  }

  describe('pill label', () => {
    it('reads "Continue" when something is read', () => {
      render(makeSeries({readCount: 3}));
      expect(pill(host)?.textContent?.trim()).toBe('Continue');
    });

    it('reads "Start" when nothing is read', () => {
      render(makeSeries({readCount: 0}));
      expect(pill(host)?.textContent?.trim()).toBe('Start');
    });
  });

  describe('the deck', () => {
    it('renders three layers for a three-cover series', () => {
      render(makeSeries());
      expect(host.querySelector('[data-testid="layer-front"]')).not.toBeNull();
      expect(host.querySelector('[data-testid="layer-b1"]')).not.toBeNull();
      expect(host.querySelector('[data-testid="layer-b2"]')).not.toBeNull();
    });

    it('renders only front + one back layer for a two-cover series', () => {
      render(makeSeries({coverBooks: [makeBook(1, 'One'), makeBook(2, 'Two')]}));
      expect(host.querySelector('[data-testid="layer-front"]')).not.toBeNull();
      expect(host.querySelector('[data-testid="layer-b1"]')).not.toBeNull();
      expect(host.querySelector('[data-testid="layer-b2"]')).toBeNull();
    });

    it('renders a single full-bleed front layer for a one-book series', () => {
      render(makeSeries({coverBooks: [makeBook(1, 'One')], bookCount: 1, readCount: 0}));
      const front = host.querySelector('[data-testid="layer-front"]') as HTMLElement;
      expect(front).not.toBeNull();
      expect(front.className).toContain('inset-0');
      expect(host.querySelector('[data-testid="layer-b1"]')).toBeNull();
      expect(host.querySelector('[data-testid="layer-b2"]')).toBeNull();
    });
  });

  describe('progress bar', () => {
    function progressWidth(): string | undefined {
      return host.querySelector<HTMLElement>('[data-testid="progress"] i')?.style.width;
    }

    it('renders the read fraction when readCount > 0', () => {
      render(makeSeries({bookCount: 6, readCount: 3}));
      expect(progressWidth()).toBe('50%');
    });

    it('renders a full bar for a completed series', () => {
      render(makeSeries({bookCount: 6, readCount: 6}));
      expect(progressWidth()).toBe('100%');
    });

    it('renders no bar when nothing is read', () => {
      render(makeSeries({readCount: 0}));
      expect(host.querySelector('[data-testid="progress"]')).toBeNull();
    });
  });

  it('never renders a selection checkbox', () => {
    render(makeSeries());
    const checkbox = textButtons(host).find(b => (b.getAttribute('aria-label') ?? '').startsWith('Select'));
    expect(checkbox).toBeUndefined();
  });

  describe('menu emissions', () => {
    it('hides the kebab by default', () => {
      render(makeSeries());
      expect(kebab(host)).toBeUndefined();
    });

    it('renders the kebab when hasMenu is set', () => {
      fixture.componentRef.setInput('hasMenu', true);
      render(makeSeries());
      expect(kebab(host)).not.toBeUndefined();
    });

    it('emits menuRequested and prevents default from the kebab when hasMenu is set', () => {
      fixture.componentRef.setInput('hasMenu', true);
      render(makeSeries());
      const spy = vi.fn();
      component.menuRequested.subscribe(spy);

      const button = kebab(host) as HTMLButtonElement;
      const event = new MouseEvent('click', {bubbles: true, cancelable: true});
      button.dispatchEvent(event);

      expect(spy).toHaveBeenCalledTimes(1);
      expect(event.defaultPrevented).toBe(true);
    });

    it('emits menuRequested and prevents the native menu on right-click when hasMenu is set', () => {
      fixture.componentRef.setInput('hasMenu', true);
      render(makeSeries());
      const spy = vi.fn();
      component.menuRequested.subscribe(spy);

      const anchor = host.querySelector('a') as HTMLAnchorElement;
      const event = new MouseEvent('contextmenu', {bubbles: true, cancelable: true});
      anchor.dispatchEvent(event);

      expect(spy).toHaveBeenCalledTimes(1);
      expect(event.defaultPrevented).toBe(true);
    });

    it('leaves the native menu and emits nothing on right-click without hasMenu', () => {
      render(makeSeries());
      const spy = vi.fn();
      component.menuRequested.subscribe(spy);

      const anchor = host.querySelector('a') as HTMLAnchorElement;
      const event = new MouseEvent('contextmenu', {bubbles: true, cancelable: true});
      anchor.dispatchEvent(event);

      expect(spy).not.toHaveBeenCalled();
      expect(event.defaultPrevented).toBe(false);
    });

    it('emits action and prevents default from the pill', () => {
      render(makeSeries());
      const spy = vi.fn();
      component.action.subscribe(spy);

      const button = pill(host) as HTMLButtonElement;
      const event = new MouseEvent('click', {bubbles: true, cancelable: true});
      button.dispatchEvent(event);

      expect(spy).toHaveBeenCalledTimes(1);
      expect(event.defaultPrevented).toBe(true);
    });
  });

  it('links to the series page by name', () => {
    render(makeSeries());
    const anchor = host.querySelector('a') as HTMLAnchorElement;
    expect(anchor.getAttribute('href')).toBe(`/series/${encodeURIComponent('The Chronicles of Barsetshire')}`);
  });

  describe('count line', () => {
    function countText(): string | undefined {
      return host.querySelector('[data-testid="count"]')?.textContent?.trim();
    }

    it('reads "n books · m read" with both counts', () => {
      render(makeSeries({bookCount: 6, readCount: 3}));
      expect(countText()).toBe('6 books · 3 read');
    });

    it('omits the read part when nothing is read', () => {
      render(makeSeries({bookCount: 6, readCount: 0}));
      expect(countText()).toBe('6 books');
    });

    it('uses the singular for a single-book series', () => {
      render(makeSeries({coverBooks: [makeBook(1, 'One')], bookCount: 1, readCount: 0}));
      expect(countText()).toBe('1 book');
    });
  });
});
