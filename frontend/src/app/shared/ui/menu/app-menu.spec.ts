import { Component, signal, viewChild } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { LucideDownload, type LucideIconData } from '@lucide/angular';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppMenuComponent } from './app-menu.component';
import { AppMenuItemComponent } from './app-menu-item.component';
import { AppMenuCheckboxComponent } from './app-menu-checkbox.component';
import { AppMenuRadioComponent } from './app-menu-radio.component';
import { AppMenuRadioGroupComponent } from './app-menu-radio-group.component';
import { AppMenuSectionComponent } from './app-menu-section.component';
import { AppMenuSeparatorComponent } from './app-menu-separator.component';
import { AppContextMenuForDirective, AppMenuTriggerForDirective } from './app-menu-trigger.directive';

@Component({
  standalone: true,
  imports: [
    AppMenuComponent,
    AppMenuItemComponent,
    AppMenuCheckboxComponent,
    AppMenuRadioGroupComponent,
    AppMenuRadioComponent,
    AppMenuSectionComponent,
    AppMenuSeparatorComponent,
    AppMenuTriggerForDirective,
    AppContextMenuForDirective,
  ],
  template: `
    <button #trigger [appMenuTriggerFor]="menu">Open</button>
    <button class="second" (click)="openSecondFrom($event)">Second opener</button>
    <div class="zone" [appContextMenuFor]="menu">right-click</div>

    <app-menu #menu ariaLabel="Actions">
      <app-menu-section>Group</app-menu-section>
      <app-menu-item [icon]="download" (selected)="onDownload()">Download</app-menu-item>
      <app-menu-item [disabled]="true" (selected)="onDisabled()">Disabled</app-menu-item>
      <app-menu-checkbox [(checked)]="fav" (selected)="onFav($event)">Favourite</app-menu-checkbox>
      <app-menu-separator />
      <app-menu-radio-group [(value)]="status">
        <app-menu-radio [value]="'read'">Read</app-menu-radio>
        <app-menu-radio [value]="'reading'">Reading</app-menu-radio>
      </app-menu-radio-group>
      <div class="custom">custom row</div>
      <app-menu-item [submenu]="sub" (selected)="onSend()">Send</app-menu-item>
      <app-menu-item [loading]="busy()" (selected)="onBusy()">Working</app-menu-item>
      <app-menu-item [closeOnSelect]="false" (selected)="onKeepOpen()">Keep open</app-menu-item>
      <app-menu-item [link]="'/books'" (selected)="onLink()">Go to books</app-menu-item>
    </app-menu>

    <app-menu #sub="ngMenu" ariaLabel="Send options">
      <app-menu-item (selected)="onQuick()">Quick send</app-menu-item>
    </app-menu>
  `,
})
class HostComponent {
  readonly menuRef = viewChild.required(AppMenuComponent);
  readonly download: LucideIconData = LucideDownload.icon;

  openSecondFrom(event: MouseEvent): void {
    this.menuRef().open(event.currentTarget as HTMLElement);
  }
  readonly fav = signal(false);
  readonly busy = signal(true);
  readonly status = signal<string | null>(null);
  readonly onDownload = vi.fn();
  readonly onDisabled = vi.fn();
  readonly onFav = vi.fn();
  readonly onSend = vi.fn();
  readonly onQuick = vi.fn();
  readonly onBusy = vi.fn();
  readonly onKeepOpen = vi.fn();
  readonly onLink = vi.fn();
}

function setup() {
  TestBed.configureTestingModule({
    providers: [provideRouter([{ path: 'books', children: [] }])],
  });
  const fixture = TestBed.createComponent(HostComponent);
  fixture.detectChanges();
  const host = fixture.nativeElement as HTMLElement;
  return { fixture, host };
}

function rootMenuEl(): HTMLElement {
  return document.querySelector('app-menu[aria-label="Actions"]') as HTMLElement;
}
function subMenuEl(): HTMLElement {
  return document.querySelector('app-menu[aria-label="Send options"]') as HTMLElement;
}
function isOpen(menu: HTMLElement): boolean {
  return !menu.classList.contains('hidden');
}
function itemByText(text: string): HTMLElement {
  const items = Array.from(document.querySelectorAll('app-menu-item'));
  return items.find((item) => item.textContent?.includes(text)) as HTMLElement;
}

describe('AppMenu', () => {
  beforeEach(() => vi.clearAllMocks());

  it('opens and closes via the trigger', () => {
    const { fixture, host } = setup();
    const trigger = host.querySelector('button') as HTMLButtonElement;

    expect(isOpen(rootMenuEl())).toBe(false);
    trigger.click();
    fixture.detectChanges();
    expect(isOpen(rootMenuEl())).toBe(true);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu');

    trigger.click();
    fixture.detectChanges();
    expect(isOpen(rootMenuEl())).toBe(false);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('emits selected once and closes on a regular item (click)', () => {
    const { fixture, host } = setup();
    const cmp = fixture.componentInstance;
    (host.querySelector('button') as HTMLButtonElement).click();
    fixture.detectChanges();

    itemByText('Download').click();
    fixture.detectChanges();

    expect(cmp.onDownload).toHaveBeenCalledTimes(1);
    expect(isOpen(rootMenuEl())).toBe(false);
  });

  it('activates the active item via keyboard Enter', () => {
    const { fixture, host } = setup();
    const cmp = fixture.componentInstance;
    (host.querySelector('button') as HTMLButtonElement).click();
    fixture.detectChanges();

    itemByText('Download').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    fixture.detectChanges();
    expect(cmp.onDownload).toHaveBeenCalledTimes(1);
    expect(isOpen(rootMenuEl())).toBe(false);
  });

  it('keeps a disabled item inert', () => {
    const { fixture, host } = setup();
    const cmp = fixture.componentInstance;
    (host.querySelector('button') as HTMLButtonElement).click();
    fixture.detectChanges();

    const disabled = itemByText('Disabled');
    expect(disabled.getAttribute('aria-disabled')).toBe('true');
    disabled.click();
    fixture.detectChanges();
    expect(cmp.onDisabled).not.toHaveBeenCalled();
    expect(isOpen(rootMenuEl())).toBe(true);
  });

  it('keeps a loading item inert', () => {
    const { fixture, host } = setup();
    const cmp = fixture.componentInstance;
    (host.querySelector('button') as HTMLButtonElement).click();
    fixture.detectChanges();

    itemByText('Working').click();
    fixture.detectChanges();
    expect(cmp.onBusy).not.toHaveBeenCalled();
    expect(isOpen(rootMenuEl())).toBe(true);
  });

  it('keeps the menu open for a closeOnSelect=false item', () => {
    const { fixture, host } = setup();
    const cmp = fixture.componentInstance;
    (host.querySelector('button') as HTMLButtonElement).click();
    fixture.detectChanges();

    itemByText('Keep open').click();
    fixture.detectChanges();
    expect(cmp.onKeepOpen).toHaveBeenCalledTimes(1);
    expect(isOpen(rootMenuEl())).toBe(true);
  });

  it('renders a link item as a routerLink anchor and emits once on keyboard', async () => {
    const { fixture, host } = setup();
    const cmp = fixture.componentInstance;
    (host.querySelector('button') as HTMLButtonElement).click();
    fixture.detectChanges();

    const linkItem = itemByText('Go to books');
    const anchor = linkItem.querySelector('a') as HTMLAnchorElement;
    expect(anchor.getAttribute('href')).toBe('/books');

    linkItem.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    fixture.detectChanges();
    await fixture.whenStable();
    expect(cmp.onLink).toHaveBeenCalledTimes(1);
    expect(isOpen(rootMenuEl())).toBe(false);
  });

  it('toggles a checkbox, keeps aria-checked and the menu open', () => {
    const { fixture, host } = setup();
    const cmp = fixture.componentInstance;
    (host.querySelector('button') as HTMLButtonElement).click();
    fixture.detectChanges();

    const checkbox = document.querySelector('app-menu-checkbox') as HTMLElement;
    expect(checkbox.getAttribute('role')).toBe('menuitemcheckbox');
    expect(checkbox.getAttribute('aria-checked')).toBe('false');
    checkbox.click();
    fixture.detectChanges();

    expect(cmp.fav()).toBe(true);
    expect(cmp.onFav).toHaveBeenCalledWith(true);
    expect(checkbox.getAttribute('aria-checked')).toBe('true');
    expect(isOpen(rootMenuEl())).toBe(true);
  });

  it('selects a radio, single-select, and closes', () => {
    const { fixture, host } = setup();
    const cmp = fixture.componentInstance;
    (host.querySelector('button') as HTMLButtonElement).click();
    fixture.detectChanges();

    const radios = document.querySelectorAll('app-menu-radio');
    expect(radios[0].getAttribute('role')).toBe('menuitemradio');
    (radios[1] as HTMLElement).click();
    fixture.detectChanges();

    expect(cmp.status()).toBe('reading');
    expect(radios[1].getAttribute('aria-checked')).toBe('true');
    expect(radios[0].getAttribute('aria-checked')).toBe('false');
    expect(isOpen(rootMenuEl())).toBe(false);
  });

  it('registers all interactive items with the aria menu and skips custom rows', () => {
    const { fixture, host } = setup();
    (host.querySelector('button') as HTMLButtonElement).click();
    fixture.detectChanges();
    const menuEl = rootMenuEl();
    const roleItems = menuEl.querySelectorAll('[role="menuitem"],[role="menuitemcheckbox"],[role="menuitemradio"]');
    expect(roleItems.length).toBe(9);
    expect(menuEl.querySelector('.custom')?.getAttribute('tabindex')).toBeNull();
  });

  it('opens a submenu from its parent item and does not close the chain', () => {
    const { fixture, host } = setup();
    const cmp = fixture.componentInstance;
    (host.querySelector('button') as HTMLButtonElement).click();
    fixture.detectChanges();

    const sendItem = itemByText('Send');
    expect(sendItem.getAttribute('aria-haspopup')).toBe('true');
    sendItem.click();
    fixture.detectChanges();

    expect(isOpen(subMenuEl())).toBe(true);
    expect(cmp.onSend).not.toHaveBeenCalled();
    expect(isOpen(rootMenuEl())).toBe(true);
  });

  it('selecting a leaf inside a submenu closes the whole chain', () => {
    const { fixture, host } = setup();
    const cmp = fixture.componentInstance;
    (host.querySelector('button') as HTMLButtonElement).click();
    fixture.detectChanges();
    itemByText('Send').click();
    fixture.detectChanges();

    itemByText('Quick send').click();
    fixture.detectChanges();

    expect(cmp.onQuick).toHaveBeenCalledTimes(1);
    expect(isOpen(rootMenuEl())).toBe(false);
    expect(isOpen(subMenuEl())).toBe(false);
  });

  it('moves the active item with ArrowDown across projected items', () => {
    const { fixture, host } = setup();
    (host.querySelector('button') as HTMLButtonElement).click();
    fixture.detectChanges();
    rootMenuEl().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    fixture.detectChanges();
    expect(itemByText('Disabled').getAttribute('data-active')).toBe('true');
  });

  it('typeahead activates the matching item', () => {
    const { fixture, host } = setup();
    (host.querySelector('button') as HTMLButtonElement).click();
    fixture.detectChanges();
    rootMenuEl().dispatchEvent(new KeyboardEvent('keydown', { key: 'f', bubbles: true }));
    fixture.detectChanges();
    expect(document.querySelector('app-menu-checkbox')?.getAttribute('data-active')).toBe('true');
  });

  it('opens a submenu via keyboard ArrowRight', () => {
    const { fixture, host } = setup();
    (host.querySelector('button') as HTMLButtonElement).click();
    fixture.detectChanges();
    const menuEl = rootMenuEl();
    for (let i = 0; i < 5; i++) {
      menuEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    }
    fixture.detectChanges();
    expect(itemByText('Send').getAttribute('data-active')).toBe('true');
    menuEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    fixture.detectChanges();
    expect(isOpen(subMenuEl())).toBe(true);
  });

  it('opens at coordinates via the context-menu directive', () => {
    const { fixture, host } = setup();
    const zone = host.querySelector('.zone') as HTMLElement;
    zone.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 10, clientY: 20 }));
    fixture.detectChanges();
    expect(isOpen(rootMenuEl())).toBe(true);
  });

  it('survives the auxclick fired when the right button releases', () => {
    const { fixture, host } = setup();
    const zone = host.querySelector('.zone') as HTMLElement;
    zone.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 10, clientY: 20 }));
    fixture.detectChanges();
    expect(isOpen(rootMenuEl())).toBe(true);

    zone.dispatchEvent(new MouseEvent('auxclick', { bubbles: true }));
    fixture.detectChanges();
    expect(isOpen(rootMenuEl())).toBe(true);

    zone.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();
    expect(isOpen(rootMenuEl())).toBe(false);
  });

  it('moves to a second opener clicked while already open', () => {
    const { fixture, host } = setup();
    const trigger = host.querySelector('button') as HTMLButtonElement;
    trigger.click();
    fixture.detectChanges();
    expect(isOpen(rootMenuEl())).toBe(true);

    const second = host.querySelector('.second') as HTMLButtonElement;
    second.click();
    fixture.detectChanges();

    expect(isOpen(rootMenuEl())).toBe(true);
    expect(fixture.componentInstance.menuRef().openerElement()).toBe(second);
  });

  it('closes on an outside click', () => {
    const { fixture, host } = setup();
    (host.querySelector('button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(isOpen(rootMenuEl())).toBe(true);

    document.body.click();
    fixture.detectChanges();
    expect(isOpen(rootMenuEl())).toBe(false);
  });

  describe('sheet presentation (mobile shell)', () => {
    function stubMobileShellMedia(matches: boolean) {
      const listeners = new Set<(event: MediaQueryListEvent) => void>();
      vi.stubGlobal('matchMedia', (query: string) => ({
        matches,
        media: query,
        addEventListener: (_type: string, callback: (event: MediaQueryListEvent) => void) => {
          listeners.add(callback);
        },
        removeEventListener: (_type: string, callback: (event: MediaQueryListEvent) => void) => {
          listeners.delete(callback);
        },
      }));
      return {
        emit: (value: boolean) => {
          for (const listener of listeners) listener({ matches: value } as MediaQueryListEvent);
        },
      };
    }

    afterEach(() => vi.unstubAllGlobals());

    it('presents as a full-width bottom sheet with a scrim, dismissed by scrim tap', () => {
      stubMobileShellMedia(true);
      const { fixture, host } = setup();
      (host.querySelector('button') as HTMLButtonElement).click();
      fixture.detectChanges();

      expect(isOpen(rootMenuEl())).toBe(true);
      expect(rootMenuEl().classList.contains('w-full')).toBe(true);
      const backdrop = document.querySelector('.app-menu-sheet-backdrop') as HTMLElement;
      expect(backdrop).not.toBeNull();

      backdrop.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      fixture.detectChanges();
      expect(isOpen(rootMenuEl())).toBe(false);
    });

    it('expands a submenu inline in the sheet as an accordion, not a popover', () => {
      stubMobileShellMedia(true);
      const { fixture, host } = setup();
      (host.querySelector('button') as HTMLButtonElement).click();
      fixture.detectChanges();

      const sendItem = itemByText('Send');
      sendItem.click();
      fixture.detectChanges();

      const sub = subMenuEl();
      expect(isOpen(sub)).toBe(true);
      expect(rootMenuEl().contains(sub)).toBe(true);
      expect(sendItem.nextElementSibling).toBe(sub);
      expect(sub.classList.contains('border-l')).toBe(true);
      expect(sub.classList.contains('shadow-pop')).toBe(false);
      expect(sendItem.querySelector('svg')?.classList.contains('rotate-90')).toBe(true);
    });

    it('collapses an expanded accordion when its parent item is tapped again', () => {
      stubMobileShellMedia(true);
      const { fixture, host } = setup();
      (host.querySelector('button') as HTMLButtonElement).click();
      fixture.detectChanges();

      const sendItem = itemByText('Send');
      sendItem.click();
      fixture.detectChanges();
      expect(isOpen(subMenuEl())).toBe(true);

      sendItem.click();
      fixture.detectChanges();
      expect(isOpen(subMenuEl())).toBe(false);
      expect(isOpen(rootMenuEl())).toBe(true);
    });

    it('selecting an accordion leaf closes the whole sheet chain', () => {
      stubMobileShellMedia(true);
      const { fixture, host } = setup();
      const cmp = fixture.componentInstance;
      (host.querySelector('button') as HTMLButtonElement).click();
      fixture.detectChanges();
      itemByText('Send').click();
      fixture.detectChanges();

      itemByText('Quick send').click();
      fixture.detectChanges();

      expect(cmp.onQuick).toHaveBeenCalledTimes(1);
      expect(isOpen(rootMenuEl())).toBe(false);
      expect(isOpen(subMenuEl())).toBe(false);
    });

    it('closes when the viewport crosses the mobile-shell breakpoint while open', () => {
      const media = stubMobileShellMedia(true);
      const { fixture, host } = setup();
      (host.querySelector('button') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(isOpen(rootMenuEl())).toBe(true);

      media.emit(false);
      fixture.detectChanges();
      expect(isOpen(rootMenuEl())).toBe(false);
    });
  });

  it('restores focus to the trigger when closed from within', () => {
    const { fixture, host } = setup();
    const trigger = host.querySelector('button') as HTMLButtonElement;
    trigger.click();
    fixture.detectChanges();

    const menuEl = rootMenuEl();
    itemByText('Download').focus();
    menuEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(isOpen(menuEl)).toBe(false);
    expect(document.activeElement).toBe(trigger);
  });
});
