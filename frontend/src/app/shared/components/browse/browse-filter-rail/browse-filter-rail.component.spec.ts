import {Component, signal} from '@angular/core';
import {ComponentFixture, TestBed} from '@angular/core/testing';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {getTranslocoModule} from '../../../../core/testing/transloco-testing';
import {
  BrowseFilterRailComponent,
  type FilterRailGroup,
  type FilterRailValue,
} from './browse-filter-rail.component';

const COLLAPSED_VALUE_COUNT = 8;

function railValue(label: string): FilterRailValue {
  return {value: label.toLowerCase().replace(/\s+/g, '-'), label, count: 3, selected: false};
}

function authorGroup(count: number): FilterRailGroup {
  return {
    key: 'author',
    labelKey: 'browse.rail.showAll',
    defaultOpen: true,
    values: Array.from({length: count}, (_, index) => railValue(`Author ${index + 1}`)),
  };
}

@Component({
  standalone: true,
  imports: [BrowseFilterRailComponent],
  template: `<app-browse-filter-rail [groups]="groups()" />`,
})
class HostComponent {
  readonly groups = signal<readonly FilterRailGroup[]>([authorGroup(20)]);
}

describe('BrowseFilterRailComponent', () => {
  let fixture: ComponentFixture<HostComponent>;

  function root(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function valueLabels(): string[] {
    return Array.from(root().querySelectorAll<HTMLElement>('button[aria-pressed]'))
      .map(button => button.querySelector('span:nth-of-type(2)')!.textContent!.trim());
  }

  function search(term: string): void {
    const toggle = root().querySelector<HTMLButtonElement>('button[aria-label="Search…"]')!;
    if (toggle.getAttribute('aria-expanded') !== 'true') {
      toggle.click();
      fixture.detectChanges();
    }

    const input = root().querySelector<HTMLInputElement>('[data-search-wrap] input')!;
    input.value = term;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HostComponent, getTranslocoModule()],
    });
    fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('renders every match instead of capping the search results', () => {
    search('Author');

    const labels = valueLabels();
    expect(labels.length).toBeGreaterThan(COLLAPSED_VALUE_COUNT);
    expect(labels).toHaveLength(20);
    expect(labels.at(-1)).toBe('Author 20');
  });

  it('renders every match when the result count sits just above the cap', () => {
    search('Author 1');

    expect(valueLabels()).toEqual([
      'Author 1',
      'Author 10',
      'Author 11',
      'Author 12',
      'Author 13',
      'Author 14',
      'Author 15',
      'Author 16',
      'Author 17',
      'Author 18',
      'Author 19',
    ]);
  });

  it('shows an empty state when nothing matches', () => {
    search('nothing here');

    expect(valueLabels()).toHaveLength(0);
    expect(root().textContent).toContain('No matches');
  });

  it('drops the empty state again once the term matches', () => {
    search('nothing here');
    expect(root().textContent).toContain('No matches');

    search('Author 20');

    expect(valueLabels()).toEqual(['Author 20']);
    expect(root().textContent).not.toContain('No matches');
  });
});
