import {ComponentFixture, TestBed} from '@angular/core/testing';
import {beforeEach, describe, expect, it, vi} from 'vitest';

import {getTranslocoModule} from '../../../../core/testing/transloco-testing';
import {BookSummary} from '../../../../features/book/data/book-response.models';
import {BookCardMenuComponent} from './book-card-menu.component';
import {
  READ_STATUS_TARGETS,
  type BookCardMenuCapabilities,
  type BookCardMenuShelf,
} from './book-card-menu';

function makeBook(overrides: Partial<BookSummary> = {}): BookSummary {
  return {
    id: 1,
    libraryId: 1,
    libraryName: 'Library',
    metadata: {bookId: 1, title: 'The Warden', allMetadataLocked: false},
    primaryFile: {id: 10, bookId: 1, book: true, folderBased: false, bookType: 'EPUB'},
    ...overrides,
  };
}

const NO_CAPS: BookCardMenuCapabilities = {
  canDownload: false,
  canEmailBook: false,
  canEditMetadata: false,
  canDeleteBook: false,
};
const ALL_CAPS: BookCardMenuCapabilities = {
  canDownload: true,
  canEmailBook: true,
  canEditMetadata: true,
  canDeleteBook: true,
};

function shelves(count: number): BookCardMenuShelf[] {
  return Array.from({length: count}, (_, i) => ({id: i + 1, name: `Shelf ${i + 1}`, checked: false}));
}

function rootMenu(host: HTMLElement): HTMLElement {
  return host.querySelector('app-menu') as HTMLElement;
}

function submenu(host: HTMLElement, ariaLabel: string): HTMLElement {
  return host.querySelector(`app-menu[aria-label="${ariaLabel}"]`) as HTMLElement;
}

function itemLabels(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll(':scope > app-menu-item, :scope > div > app-menu-item')).map(
    el => el.textContent?.trim() ?? '',
  );
}

function clickItem(container: HTMLElement, text: string): void {
  const item = Array.from(container.querySelectorAll('app-menu-item, app-menu-checkbox, app-menu-radio')).find(
    el => el.textContent?.trim() === text,
  ) as HTMLElement;
  item.dispatchEvent(new MouseEvent('click', {bubbles: true, cancelable: true}));
}

describe('BookCardMenuComponent', () => {
  let fixture: ComponentFixture<BookCardMenuComponent>;
  let component: BookCardMenuComponent;
  let host: HTMLElement;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [BookCardMenuComponent, getTranslocoModule()],
    });

    fixture = TestBed.createComponent(BookCardMenuComponent);
    component = fixture.componentInstance;
    host = fixture.nativeElement as HTMLElement;
    fixture.componentRef.setInput('capabilities', NO_CAPS);
    fixture.componentRef.setInput('book', makeBook());
  });

  function render(): void {
    fixture.detectChanges();
  }

  describe('capability + digital-file gating', () => {
    it('shows only Add to shelf and Mark as for a plain user', () => {
      render();
      expect(itemLabels(rootMenu(host))).toEqual(['Add to shelf', 'Mark as']);
    });

    it('renders every root row with full capabilities and a digital file', () => {
      fixture.componentRef.setInput('capabilities', ALL_CAPS);
      render();
      expect(itemLabels(rootMenu(host))).toEqual([
        'Add to shelf',
        'Mark as',
        'Send',
        'Download',
        'Metadata',
        'Delete…',
      ]);
    });

    it('omits Send and Download for an audiobook-only book (absent, not disabled)', () => {
      fixture.componentRef.setInput('capabilities', ALL_CAPS);
      fixture.componentRef.setInput('book', makeBook({primaryFile: {id: 10, bookId: 1, book: true, folderBased: false, bookType: 'AUDIOBOOK'}}));
      render();
      expect(itemLabels(rootMenu(host))).toEqual(['Add to shelf', 'Mark as', 'Metadata', 'Delete…']);
    });

    it('omits Send and Download when there is no book to gate on', () => {
      fixture.componentRef.setInput('capabilities', ALL_CAPS);
      fixture.componentRef.setInput('book', null);
      render();
      expect(itemLabels(rootMenu(host))).toEqual(['Add to shelf', 'Mark as', 'Metadata', 'Delete…']);
    });

    it('marks Delete as destructive', () => {
      fixture.componentRef.setInput('capabilities', ALL_CAPS);
      render();
      const del = Array.from(host.querySelectorAll('app-menu-item')).find(
        el => el.textContent?.trim() === 'Delete…',
      ) as HTMLElement;
      expect(del.className).toContain('text-danger');
    });
  });

  describe('shelf list', () => {
    it('renders every shelf with no inline cap — the menu scrolls, no overflow dialog', () => {
      fixture.componentRef.setInput('shelves', shelves(7));
      render();
      const shelfMenu = submenu(host, 'Add to shelf');
      expect(shelfMenu.querySelectorAll('app-menu-checkbox').length).toBe(7);
      expect(itemLabels(shelfMenu)).toEqual(['New shelf…']);
    });

    it('reflects each shelf checked state on its checkbox', () => {
      fixture.componentRef.setInput('shelves', [
        {id: 1, name: 'Favourites', checked: true},
        {id: 2, name: 'To read', checked: false},
      ]);
      render();
      const checkboxes = submenu(host, 'Add to shelf').querySelectorAll('app-menu-checkbox');
      expect(checkboxes[0].getAttribute('aria-checked')).toBe('true');
      expect(checkboxes[1].getAttribute('aria-checked')).toBe('false');
    });
  });

  describe('read-status radio group', () => {
    it('builds a radio over the read-status targets', () => {
      render();
      const radios = submenu(host, 'Mark as').querySelectorAll('app-menu-radio');
      expect(radios.length).toBe(READ_STATUS_TARGETS.length);
      expect(radios[0].getAttribute('role')).toBe('menuitemradio');
    });
  });

  describe('verb outputs', () => {
    it('emits toggleShelf with the shelf and next checked state', () => {
      fixture.componentRef.setInput('shelves', [{id: 3, name: 'Sci-fi', checked: false}]);
      render();
      const spy = vi.fn();
      component.toggleShelf.subscribe(spy);
      clickItem(submenu(host, 'Add to shelf'), 'Sci-fi');
      expect(spy).toHaveBeenCalledWith({shelf: {id: 3, name: 'Sci-fi', checked: false}, checked: true});
    });

    it('emits createShelf from the shelf submenu', () => {
      render();
      const create = vi.fn();
      component.createShelf.subscribe(create);
      clickItem(submenu(host, 'Add to shelf'), 'New shelf…');
      expect(create).toHaveBeenCalledTimes(1);
    });

    it('emits setReadStatus from a radio', () => {
      render();
      const spy = vi.fn();
      component.setReadStatus.subscribe(spy);
      const firstTarget = READ_STATUS_TARGETS[0];
      const radio = Array.from(submenu(host, 'Mark as').querySelectorAll('app-menu-radio'))[0] as HTMLElement;
      radio.dispatchEvent(new MouseEvent('click', {bubbles: true, cancelable: true}));
      expect(spy).toHaveBeenCalledWith(firstTarget);
    });

    it('emits quickSend, customSend and download when enabled', () => {
      fixture.componentRef.setInput('capabilities', ALL_CAPS);
      render();
      const quick = vi.fn();
      const custom = vi.fn();
      const download = vi.fn();
      component.quickSend.subscribe(quick);
      component.customSend.subscribe(custom);
      component.download.subscribe(download);
      clickItem(submenu(host, 'Send'), 'Quick send');
      clickItem(submenu(host, 'Send'), 'Custom send…');
      clickItem(rootMenu(host), 'Download');
      expect(quick).toHaveBeenCalledTimes(1);
      expect(custom).toHaveBeenCalledTimes(1);
      expect(download).toHaveBeenCalledTimes(1);
    });

    it('emits the metadata verbs', () => {
      fixture.componentRef.setInput('capabilities', ALL_CAPS);
      render();
      const fetch = vi.fn();
      const fetchOpts = vi.fn();
      const edit = vi.fn();
      component.fetchMetadata.subscribe(fetch);
      component.fetchMetadataWithOptions.subscribe(fetchOpts);
      component.editMetadata.subscribe(edit);
      const metaMenu = submenu(host, 'Metadata');
      clickItem(metaMenu, 'Fetch metadata');
      clickItem(metaMenu, 'Fetch with options…');
      clickItem(metaMenu, 'Edit metadata…');
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(fetchOpts).toHaveBeenCalledTimes(1);
      expect(edit).toHaveBeenCalledTimes(1);
    });

    it('shows the current metadata lock state and emits the next state', () => {
      fixture.componentRef.setInput('capabilities', ALL_CAPS);
      fixture.componentRef.setInput('book', makeBook({
        metadata: {bookId: 1, title: 'The Warden', allMetadataLocked: true},
      }));
      render();
      const lockChange = vi.fn();
      component.metadataLockChange.subscribe(lockChange);
      const checkbox = Array.from(submenu(host, 'Metadata').querySelectorAll('app-menu-checkbox')).find(
        el => el.textContent?.trim() === 'Lock metadata',
      ) as HTMLElement;

      expect(checkbox.getAttribute('aria-checked')).toBe('true');
      checkbox.dispatchEvent(new MouseEvent('click', {bubbles: true, cancelable: true}));
      expect(lockChange).toHaveBeenCalledWith(false);
    });

    it('emits deleteRequested from the destructive row', () => {
      fixture.componentRef.setInput('capabilities', ALL_CAPS);
      render();
      const spy = vi.fn();
      component.deleteRequested.subscribe(spy);
      clickItem(rootMenu(host), 'Delete…');
      expect(spy).toHaveBeenCalledTimes(1);
    });
  });

  describe('openFromCard', () => {
    function fakeEvent(overrides: Partial<MouseEvent>): MouseEvent {
      return {type: 'click', clientX: 0, clientY: 0, currentTarget: document.createElement('a'), ...overrides} as unknown as MouseEvent;
    }

    it('anchors a mouse contextmenu at its coordinates', () => {
      fixture.componentRef.setInput('capabilities', ALL_CAPS);
      render();
      const openAt = vi.spyOn(component, 'openAt').mockImplementation(() => undefined);
      const anchor = document.createElement('a');

      component.openFromCard(fakeEvent({type: 'contextmenu', clientX: 40, clientY: 60, currentTarget: anchor}));

      expect(openAt).toHaveBeenCalledWith(40, 60, anchor);
    });

    it('anchors a keyboard-invoked contextmenu (0,0 coords) to the card element', () => {
      fixture.componentRef.setInput('capabilities', ALL_CAPS);
      render();
      const open = vi.spyOn(component, 'open').mockImplementation(() => undefined);
      const anchor = document.createElement('a');

      component.openFromCard(fakeEvent({type: 'contextmenu', currentTarget: anchor}));

      expect(open).toHaveBeenCalledWith(anchor);
    });

    it('anchors a kebab click to its own element', () => {
      fixture.componentRef.setInput('capabilities', ALL_CAPS);
      render();
      const open = vi.spyOn(component, 'open').mockImplementation(() => undefined);
      const kebab = document.createElement('button');

      component.openFromCard(fakeEvent({currentTarget: kebab}));

      expect(open).toHaveBeenCalledWith(kebab);
    });
  });
});
