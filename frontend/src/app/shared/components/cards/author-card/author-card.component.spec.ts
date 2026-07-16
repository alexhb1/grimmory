import {ComponentFixture, TestBed} from '@angular/core/testing';
import {provideRouter} from '@angular/router';
import {beforeEach, describe, expect, it, vi} from 'vitest';

import {getTranslocoModule} from '../../../../core/testing/transloco-testing';
import {AuthorSummary} from '../../../../features/author-browser/model/author.model';
import {
  AuthorCardComponent,
  authorCardHeightForWidth,
} from './author-card.component';

function makeAuthor(overrides: Partial<AuthorSummary> = {}): AuthorSummary {
  return {id: 1, name: 'Anthony Trollope', bookCount: 8, hasPhoto: false, ...overrides};
}

function textButtons(host: HTMLElement): HTMLButtonElement[] {
  return Array.from(host.querySelectorAll('button'));
}

function buttonByAria(host: HTMLElement, prefix: string): HTMLButtonElement | undefined {
  return textButtons(host).find(b => (b.getAttribute('aria-label') ?? '').startsWith(prefix));
}

function monogram(host: HTMLElement): string | undefined {
  return host.querySelector('[data-testid="monogram"]')?.textContent?.trim();
}

describe('AuthorCardComponent', () => {
  let fixture: ComponentFixture<AuthorCardComponent>;
  let component: AuthorCardComponent;
  let host: HTMLElement;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [AuthorCardComponent, getTranslocoModule()],
      providers: [provideRouter([{path: '**', children: []}])],
    });

    fixture = TestBed.createComponent(AuthorCardComponent);
    component = fixture.componentInstance;
    host = fixture.nativeElement as HTMLElement;
  });

  function render(author: AuthorSummary): void {
    fixture.componentRef.setInput('author', author);
    fixture.detectChanges();
  }

  describe('initials monogram', () => {
    it('takes the first letter of the first two words', () => {
      render(makeAuthor({name: 'Anthony Trollope'}));
      expect(monogram(host)).toBe('AT');
    });

    it('uses a single letter for a one-word name', () => {
      render(makeAuthor({name: 'Voltaire'}));
      expect(monogram(host)).toBe('V');
    });

    it('ignores a third word', () => {
      render(makeAuthor({name: 'Ursula K. Le Guin'}));
      expect(monogram(host)).toBe('UK');
    });
  });

  describe('photo fallback', () => {
    it('shows the photo when a url is supplied', () => {
      fixture.componentRef.setInput('photoUrl', 'https://example.test/a.jpg');
      render(makeAuthor());
      expect(host.querySelector('img')).not.toBeNull();
      expect(host.querySelector('[data-testid="monogram"]')).toBeNull();
    });

    it('falls back to the monogram when the image errors', () => {
      fixture.componentRef.setInput('photoUrl', 'https://example.test/a.jpg');
      render(makeAuthor());

      const img = host.querySelector('img') as HTMLImageElement;
      img.dispatchEvent(new Event('error'));
      fixture.detectChanges();

      expect(host.querySelector('img')).toBeNull();
      expect(monogram(host)).toBe('AT');
    });

    it('renders the monogram when no url is supplied', () => {
      render(makeAuthor());
      expect(host.querySelector('img')).toBeNull();
      expect(monogram(host)).toBe('AT');
    });
  });

  describe('selection', () => {
    it('emits toggleSelect and prevents navigation on a ctrl-click', () => {
      render(makeAuthor());
      const emitted: {shiftKey: boolean}[] = [];
      component.toggleSelect.subscribe(v => emitted.push(v));

      const anchor = host.querySelector('a') as HTMLAnchorElement;
      const event = new MouseEvent('click', {bubbles: true, cancelable: true, ctrlKey: true});
      anchor.dispatchEvent(event);

      expect(emitted).toHaveLength(1);
      expect(event.defaultPrevented).toBe(true);
    });

    it('emits toggleSelect on a plain click while selectionActive', () => {
      fixture.componentRef.setInput('selectionActive', true);
      render(makeAuthor());
      const emitted: {shiftKey: boolean}[] = [];
      component.toggleSelect.subscribe(v => emitted.push(v));

      const anchor = host.querySelector('a') as HTMLAnchorElement;
      const event = new MouseEvent('click', {bubbles: true, cancelable: true, shiftKey: true});
      anchor.dispatchEvent(event);

      expect(emitted).toEqual([{shiftKey: true}]);
      expect(event.defaultPrevented).toBe(true);
    });

    it('does not toggle on a plain click when selection is inactive', () => {
      render(makeAuthor());
      const emitted: unknown[] = [];
      component.toggleSelect.subscribe(v => emitted.push(v));

      const anchor = host.querySelector('a') as HTMLAnchorElement;
      const event = new MouseEvent('click', {bubbles: true, cancelable: true});
      anchor.dispatchEvent(event);

      expect(emitted).toHaveLength(0);
    });

    it('toggles selection on Space when selectable, preventing scroll', () => {
      fixture.componentRef.setInput('selectable', true);
      render(makeAuthor());
      const emitted: {shiftKey: boolean}[] = [];
      component.toggleSelect.subscribe(v => emitted.push(v));

      const anchor = host.querySelector('a') as HTMLAnchorElement;
      const event = new KeyboardEvent('keydown', {key: ' ', bubbles: true, cancelable: true});
      anchor.dispatchEvent(event);

      expect(emitted).toHaveLength(1);
      expect(event.defaultPrevented).toBe(true);
    });

    it('emits toggleSelect and prevents default from the checkbox', () => {
      fixture.componentRef.setInput('selectable', true);
      render(makeAuthor());
      const emitted: {shiftKey: boolean}[] = [];
      component.toggleSelect.subscribe(v => emitted.push(v));

      const checkbox = buttonByAria(host, 'Select') as HTMLButtonElement;
      const event = new MouseEvent('click', {bubbles: true, cancelable: true, shiftKey: true});
      checkbox.dispatchEvent(event);

      expect(emitted).toEqual([{shiftKey: true}]);
      expect(event.defaultPrevented).toBe(true);
    });
  });

  describe('menu emissions', () => {
    it('hides the kebab by default', () => {
      render(makeAuthor());
      expect(buttonByAria(host, 'Options for')).toBeUndefined();
    });

    it('renders the kebab when hasMenu is set', () => {
      fixture.componentRef.setInput('hasMenu', true);
      render(makeAuthor());
      expect(buttonByAria(host, 'Options for')).not.toBeUndefined();
    });

    it('emits menuRequested and prevents default from the kebab when hasMenu is set', () => {
      fixture.componentRef.setInput('hasMenu', true);
      render(makeAuthor());
      const spy = vi.fn();
      component.menuRequested.subscribe(spy);

      const button = buttonByAria(host, 'Options for') as HTMLButtonElement;
      const event = new MouseEvent('click', {bubbles: true, cancelable: true});
      button.dispatchEvent(event);

      expect(spy).toHaveBeenCalledTimes(1);
      expect(event.defaultPrevented).toBe(true);
    });

    it('emits menuRequested and prevents the native menu on right-click when hasMenu is set', () => {
      fixture.componentRef.setInput('hasMenu', true);
      render(makeAuthor());
      const spy = vi.fn();
      component.menuRequested.subscribe(spy);

      const anchor = host.querySelector('a') as HTMLAnchorElement;
      const event = new MouseEvent('contextmenu', {bubbles: true, cancelable: true});
      anchor.dispatchEvent(event);

      expect(spy).toHaveBeenCalledTimes(1);
      expect(event.defaultPrevented).toBe(true);
    });

    it('leaves the native menu and emits nothing on right-click without hasMenu', () => {
      render(makeAuthor());
      const spy = vi.fn();
      component.menuRequested.subscribe(spy);

      const anchor = host.querySelector('a') as HTMLAnchorElement;
      const event = new MouseEvent('contextmenu', {bubbles: true, cancelable: true});
      anchor.dispatchEvent(event);

      expect(spy).not.toHaveBeenCalled();
      expect(event.defaultPrevented).toBe(false);
    });
  });

  describe('book-count line', () => {
    function countText(): string | undefined {
      return host.querySelector('[data-testid="count"]')?.textContent?.trim();
    }

    it('pluralises the count', () => {
      render(makeAuthor({bookCount: 8}));
      expect(countText()).toBe('8 books');
    });

    it('uses the singular for one book', () => {
      render(makeAuthor({bookCount: 1}));
      expect(countText()).toBe('1 book');
    });
  });

  it('links to the author page by id', () => {
    render(makeAuthor({id: 42}));
    const anchor = host.querySelector('a') as HTMLAnchorElement;
    expect(anchor.getAttribute('href')).toBe('/author/42');
  });

  describe('authorCardHeightForWidth', () => {
    it('sums the 78% circle and the two meta lines', () => {
      expect(authorCardHeightForWidth(150)).toBe(157);
    });

    it('rounds the circle for fractional widths', () => {
      expect(authorCardHeightForWidth(128)).toBe(140);
    });
  });
});
