import {signal} from '@angular/core';
import {ComponentFixture, TestBed} from '@angular/core/testing';
import {beforeEach, describe, expect, it} from 'vitest';

import {getTranslocoModule} from '../../../core/testing/transloco-testing';
import {buildSortOptions, DEFAULT_BOOK_SORT} from './book-browse-fields';
import {
  BookBrowseToolbarComponent,
  type BookBrowseColumnVisibilityChange,
} from './book-browse-toolbar.component';
import {type BookBrowseViewMode} from './book-browse.models';
import {LibraryShelfMenuService} from '../service/library-shelf-menu.service';
import {UserService} from '../../settings/user-management/user.service';

describe('BookBrowseToolbarComponent', () => {
  let fixture: ComponentFixture<BookBrowseToolbarComponent>;
  const host = (): HTMLElement => fixture.nativeElement as HTMLElement;


  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BookBrowseToolbarComponent, getTranslocoModule()],
      providers: [
        {provide: LibraryShelfMenuService, useValue: {}},
        {
          provide: UserService,
          useValue: {
            currentUser: signal({id: 7, permissions: {admin: true, canManageLibrary: true}}),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(BookBrowseToolbarComponent);
    fixture.componentRef.setInput('activeSort', DEFAULT_BOOK_SORT);
    fixture.componentRef.setInput(
      'sortOptions',
      buildSortOptions(['title', '-title', 'pageCount', '-pageCount']),
    );
    fixture.componentRef.setInput('sortTerms', []);
    fixture.componentRef.setInput('viewMode', 'grid');
    fixture.componentRef.setInput('columnOptions', []);
    fixture.componentRef.setInput('densitySmallerDisabled', false);
    fixture.componentRef.setInput('densityLargerDisabled', false);
    fixture.componentRef.setInput('filtersOpen', false);
    fixture.componentRef.setInput('mobileSelectMode', false);
    fixture.componentRef.setInput('selectionCount', 0);
    fixture.componentRef.setInput('selectionTotal', null);
    fixture.componentRef.setInput('actionTarget', null);
    await fixture.whenStable();
  });

  it('presents the current view with the shared segmented radio group and emits view changes', async () => {
    const changes: BookBrowseViewMode[] = [];
    fixture.componentInstance.viewModeChange.subscribe(viewMode => changes.push(viewMode));

    const gridButton = radioByLabel('Grid');
    const tableButton = radioByLabel('Table');

    expect(gridButton.checked).toBe(true);
    expect(tableButton.checked).toBe(false);
    expect(gridButton.closest('label')?.querySelector('svg')).toBeTruthy();
    expect(gridButton.closest('label')?.classList).toContain('h-9');

    tableButton.click();
    await fixture.whenStable();

    expect(changes).toEqual(['table']);

    gridButton.click();
    await fixture.whenStable();

    expect(changes).toEqual(['table']);
  });

  it('exposes explicit mobile Select and Cancel states', async () => {
    const toggles: void[] = [];
    fixture.componentInstance.mobileSelectToggle.subscribe(() => toggles.push(undefined));

    buttonByText('Select').click();
    expect(toggles).toHaveLength(1);

    fixture.componentRef.setInput('mobileSelectMode', true);
    await fixture.whenStable();
    expect(buttonByText('Cancel')).toBeTruthy();
  });

  it('swaps to the selection tools row in mobile select mode', async () => {
    const selectAlls: void[] = [];
    fixture.componentInstance.selectAllRequested.subscribe(() => selectAlls.push(undefined));

    fixture.componentRef.setInput('mobileSelectMode', true);
    fixture.componentRef.setInput('selectionCount', 3);
    fixture.componentRef.setInput('selectionTotal', 214);
    await fixture.whenStable();

    expect(host().textContent).toContain('3 selected');
    expect(optionalButtonByLabel('More options')).toBeNull();

    buttonByText('Select all').click();
    expect(selectAlls).toHaveLength(1);

    fixture.componentRef.setInput('selectionCount', 214);
    await fixture.whenStable();
    expect(buttonByTextOrNull('Select all')).toBeNull();
    expect(buttonByText('Cancel')).toBeTruthy();
  });

  it('pushes the overflow menu to the right on mobile without changing desktop alignment', () => {
    const overflowButton = buttonByLabel('More options').closest('app-button');

    expect(overflowButton?.classList).toContain('ml-auto');
    expect(overflowButton?.classList).toContain('sm:ml-0');
  });

  it('shows grid density and card detail controls only in grid view', async () => {
    expect(buttonByLabel('Smaller cards')).toBeTruthy();
    expect(host().textContent).toContain('Card Detail');

    fixture.componentRef.setInput('viewMode', 'table');
    await fixture.whenStable();

    expect(optionalButtonByLabel('Smaller cards')).toBeNull();
    expect(host().textContent).not.toContain('Card Detail');
  });

  it.each([
    {
      name: 'library',
      target: {type: 'library', entity: {id: 12, name: 'Cookbooks', watch: true, paths: []}},
      labels: ['Add Physical Book', 'Import ISBNs', 'Scan Library Files', 'Manage Library'],
      hasSubmenu: true,
    },
    {
      name: 'shelf',
      target: {type: 'shelf', entity: {id: 12, name: 'Favorites', userId: 7, publicShelf: false}},
      labels: ['Edit Shelf', 'Delete Shelf'],
      hasSubmenu: false,
    },
    {
      name: 'magic shelf',
      target: {type: 'magicShelf', entity: {id: 12, name: 'Witchy Reads', filterJson: '{}'}},
      labels: ['Edit Magic Shelf', 'Copy JSON', 'Delete Magic Shelf'],
      hasSubmenu: false,
    },
  ] as const)('renders $name actions inline without an entity heading', async ({target, labels, hasSubmenu}) => {
    fixture.componentRef.setInput('actionTarget', target);
    await fixture.whenStable();

    const menu = host().querySelector('app-menu[aria-label="More options"]') as HTMLElement;
    const items = (Array.from(menu.querySelectorAll('app-menu-item')) as HTMLElement[])
      .filter(item => item.closest('app-menu') === menu);

    expect(items.slice(-labels.length).map(item => item.textContent.trim())).toEqual(labels);
    expect(items.some(item => item.textContent.trim() === target.entity.name)).toBe(false);
    expect(menu.querySelector('app-menu-section')).toBeNull();
    expect(items.at(-1)?.getAttribute('aria-haspopup') === 'true').toBe(hasSubmenu);

    if (hasSubmenu) {
      buttonByLabel('More options').click();
      fixture.detectChanges();
      items.at(-1)?.click();
      fixture.detectChanges();
      const submenu = document.querySelector(
        'app-menu[aria-label="Manage Library"]',
      ) as HTMLElement;
      expect(submenu.classList.contains('hidden')).toBe(false);
    }
  });

  it('routes the direction toggle through sortDirectionChange, not sortChange', async () => {
    const [title] = buildSortOptions(['title', '-title']);
    fixture.componentRef.setInput('activeSort', {option: title, direction: 'asc'});
    const sortChanges: unknown[] = [];
    const directionChanges: unknown[] = [];
    fixture.componentInstance.sortChange.subscribe(change => sortChanges.push(change));
    fixture.componentInstance.sortDirectionChange.subscribe(change => directionChanges.push(change));
    await fixture.whenStable();

    buttonByLabel('Sort descending').click();

    expect(sortChanges).toEqual([]);
    expect(directionChanges).toEqual([{option: title, direction: 'desc'}]);
  });

  it('offers an advertised random sort and shuffle action', async () => {
    const [random, title] = buildSortOptions(['random', '-random', 'title', '-title']);
    fixture.componentRef.setInput('activeSort', {option: title, direction: 'asc'});
    fixture.componentRef.setInput('sortOptions', [random, title]);
    const changes: unknown[] = [];
    let shuffleRequests = 0;
    fixture.componentInstance.sortChange.subscribe(change => changes.push(change));
    fixture.componentInstance.randomSortRequested.subscribe(() => shuffleRequests += 1);
    await fixture.whenStable();

    buttonByText('Title').click();
    await fixture.whenStable();
    menuItemByText('Random').click();

    expect(changes).toEqual([{option: random, direction: 'asc'}]);

    fixture.componentRef.setInput('activeSort', {option: random, direction: 'asc'});
    await fixture.whenStable();

    buttonByLabel('Shuffle again').click();
    expect(shuffleRequests).toBe(1);
  });

  it('marks no simple option active during multi-sort and treats picks as fresh sorts', async () => {
    const [title] = buildSortOptions(['title', '-title']);
    fixture.componentRef.setInput('activeSort', {option: title, direction: 'asc'});
    fixture.componentRef.setInput('sortTerms', [
      {key: 'title', direction: 'asc'},
      {key: 'pageCount', direction: 'desc'},
    ]);
    const changes: unknown[] = [];
    fixture.componentInstance.sortChange.subscribe(change => changes.push(change));
    await fixture.whenStable();

    buttonByText('Title +1').click();
    await fixture.whenStable();

    const titleItem = menuItemByText('Title');
    expect(titleItem.querySelector('svg')).toBeNull();
    expect(titleItem.textContent).toContain('1');

    titleItem.click();
    expect(changes).toEqual([{option: title, direction: 'asc'}]);
  });

  it('groups table columns, keeps title fixed, and emits immediate visibility changes', async () => {
    const changes: BookBrowseColumnVisibilityChange[] = [];
    fixture.componentInstance.columnVisibilityChange.subscribe(change => changes.push(change));
    fixture.componentRef.setInput('viewMode', 'table');
    fixture.componentRef.setInput('columnOptions', [
      {field: 'title', labelKey: 'book.fields.title', visible: true, hideable: false},
      {field: 'authors', labelKey: 'book.fields.author', visible: true, hideable: true},
      {field: 'readStatus', labelKey: 'book.fields.readStatus', visible: false, hideable: true},
      {field: 'fileName', labelKey: 'book.fields.fileName', visible: true, hideable: true},
    ]);
    await fixture.whenStable();

    const text = host().textContent;
    expect(text).toContain('Reading');
    expect(text).toContain('Publishing');
    expect(text).toContain('File');

    const title = checkboxByText('Title');
    expect(title.getAttribute('aria-checked')).toBe('true');
    title.click();
    expect(changes).toEqual([]);

    checkboxByText('Author').click();
    await fixture.whenStable();

    expect(changes).toEqual([{field: 'authors', visible: false}]);
  });

  it('offers card detail choices in grid view and maps the None radio to null', async () => {
    const changes: (string | null)[] = [];
    fixture.componentInstance.cardDetailChange.subscribe(value => changes.push(value));
    fixture.componentRef.setInput('cardDetail', 'addedOn');
    await fixture.whenStable();

    buttonByLabel('More options').click();
    fixture.detectChanges();

    const menu = document.querySelector('app-menu[aria-label="Card Detail"]') as HTMLElement;
    const radios = Array.from(menu.querySelectorAll('app-menu-radio')) as HTMLElement[];
    expect(radios[0].textContent.trim()).toBe('None');
    const addedOn = radios.find(radio => radio.textContent.trim() === 'Date added');
    expect(addedOn?.getAttribute('aria-checked')).toBe('true');

    addedOn?.click();
    radios[0].click();
    expect(changes).toEqual(['addedOn', null]);
  });

  function optionalButtonByLabel(label: string): HTMLButtonElement | null {
    return host().querySelector(`button[aria-label="${label}"]`) as HTMLButtonElement | null;
  }

  function radioByLabel(label: string): HTMLInputElement {
    const labels = Array.from(host().querySelectorAll('app-radio-group label')) as HTMLLabelElement[];
    const match = labels.find(candidate => candidate.textContent.trim() === label);
    const radio = match?.querySelector('input[type="radio"]') as HTMLInputElement | null;
    if (!radio) throw new Error(`Could not find radio labelled "${label}"`);
    return radio;
  }

  function buttonByLabel(label: string): HTMLButtonElement {
    const button = optionalButtonByLabel(label);
    if (!button) throw new Error(`Could not find button labelled "${label}"`);
    return button;
  }

  function buttonByText(text: string): HTMLButtonElement {
    const button = buttonByTextOrNull(text);
    if (!button) throw new Error(`Could not find button with text "${text}"`);
    return button;
  }

  function buttonByTextOrNull(text: string): HTMLButtonElement | null {
    const buttons = Array.from(host().querySelectorAll('button'));
    return buttons.find(candidate => candidate.textContent.trim() === text) ?? null;
  }

  function menuItemByText(text: string): HTMLElement {
    const items = Array.from(document.querySelectorAll('.cdk-overlay-container app-menu-item')) as HTMLElement[];
    const item = items.find(candidate => candidate.textContent.includes(text));
    if (!item) throw new Error(`Could not find menu item "${text}"`);
    return item;
  }

  function checkboxByText(text: string): HTMLElement {
    const items = Array.from(host().querySelectorAll('app-menu-checkbox')) as HTMLElement[];
    const item = items.find(candidate => candidate.textContent.trim() === text);
    if (!item) throw new Error(`Could not find menu checkbox "${text}"`);
    return item;
  }
});
