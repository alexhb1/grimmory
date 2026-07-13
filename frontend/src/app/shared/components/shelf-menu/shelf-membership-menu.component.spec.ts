import {ComponentFixture, TestBed} from '@angular/core/testing';
import {beforeEach, describe, expect, it, vi} from 'vitest';

import {getTranslocoModule} from '../../../core/testing/transloco-testing';
import {ShelfMembershipMenuComponent, type ShelfMembershipItem} from './shelf-membership-menu.component';

function shelves(count: number): ShelfMembershipItem[] {
  return Array.from({length: count}, (_, i) => ({id: i + 1, name: `Shelf ${i + 1}`, checked: false}));
}

describe('ShelfMembershipMenuComponent', () => {
  let fixture: ComponentFixture<ShelfMembershipMenuComponent>;
  let host: HTMLElement;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ShelfMembershipMenuComponent, getTranslocoModule()],
    });
    fixture = TestBed.createComponent(ShelfMembershipMenuComponent);
    host = fixture.nativeElement as HTMLElement;
  });

  function render(items: ShelfMembershipItem[]): void {
    fixture.componentRef.setInput('shelves', items);
    fixture.detectChanges();
  }

  function setQuery(value: string): void {
    const input = host.querySelector('input') as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input', {bubbles: true}));
    fixture.detectChanges();
  }

  function rowLabels(): string[] {
    return Array.from(host.querySelectorAll('app-menu-checkbox')).map(el => el.textContent?.trim() ?? '');
  }

  it('hides the filter input for a short, scannable list', () => {
    render(shelves(8));
    expect(host.querySelector('input')).toBeNull();
    expect(rowLabels().length).toBe(8);
  });

  it('shows the filter input past the threshold and filters rows by name', () => {
    render(shelves(12));
    expect(host.querySelector('input')).not.toBeNull();

    setQuery('Shelf 1');
    expect(rowLabels()).toEqual(['Shelf 1', 'Shelf 10', 'Shelf 11', 'Shelf 12']);
  });

  it('shows a quiet no-matches note instead of an empty gap', () => {
    render(shelves(12));
    setQuery('zzz');
    expect(rowLabels()).toEqual([]);
    expect(host.textContent).toContain('No results');
  });

  it('keeps typing away from the menu typeahead but hands navigation keys through', () => {
    render(shelves(12));
    const input = host.querySelector('input') as HTMLInputElement;
    const menuElement = host.querySelector('app-menu') as HTMLElement;
    const reachedMenu = vi.fn();
    menuElement.addEventListener('keydown', reachedMenu);

    input.dispatchEvent(new KeyboardEvent('keydown', {key: 'a', bubbles: true, cancelable: true}));
    expect(reachedMenu).not.toHaveBeenCalled();

    input.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowDown', bubbles: true, cancelable: true}));
    expect(reachedMenu).toHaveBeenCalledTimes(1);
  });

  it('emits toggleShelf with the shelf id and next state', () => {
    render(shelves(3));
    const spy = vi.fn();
    fixture.componentInstance.toggleShelf.subscribe(spy);
    const row = host.querySelectorAll('app-menu-checkbox')[1] as HTMLElement;
    row.dispatchEvent(new MouseEvent('click', {bubbles: true, cancelable: true}));
    expect(spy).toHaveBeenCalledWith({shelfId: 2, checked: true});
  });
});
