import {ComponentFixture, TestBed} from '@angular/core/testing';
import {beforeEach, describe, expect, it} from 'vitest';

import {getTranslocoModule} from '../../../core/testing/transloco-testing';
import {buildSortOptions, DEFAULT_BOOK_SORT} from './book-browse-sort.config';
import {
  BookBrowseToolbarComponent,
  type BookBrowseColumnVisibilityChange,
} from './book-browse-toolbar.component';
import {type BookBrowseViewMode} from './book-browse.models';
import {LibraryShelfMenuService} from '../service/library-shelf-menu.service';

describe('BookBrowseToolbarComponent', () => {
  let fixture: ComponentFixture<BookBrowseToolbarComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BookBrowseToolbarComponent, getTranslocoModule()],
      providers: [{
        provide: LibraryShelfMenuService,
        useValue: {
          canManageShelf: () => true,
          canManageMagicShelf: () => true,
        },
      }],
    }).compileComponents();

    fixture = TestBed.createComponent(BookBrowseToolbarComponent);
    fixture.componentRef.setInput('activeSort', DEFAULT_BOOK_SORT);
    fixture.componentRef.setInput(
      'sortOptions',
      buildSortOptions(['title', '-title', 'pageCount', '-pageCount']),
    );
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

    expect(fixture.nativeElement.textContent).toContain('3 selected');
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

  it('shows grid density controls only in grid view', async () => {
    expect(buttonByLabel('Smaller cards')).toBeTruthy();
    expect(fixture.nativeElement.textContent).toContain('Collapse series');

    fixture.componentRef.setInput('viewMode', 'table');
    await fixture.whenStable();

    expect(optionalButtonByLabel('Smaller cards')).toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('Collapse series');
  });

  it.each([
    ['library', [
      'Add Physical Book',
      'Import ISBNs from File',
      'Edit Library',
      'Re-scan Library',
      'Custom Fetch Metadata',
      'Auto Fetch Metadata',
      'Find Duplicates',
      'Delete Library',
    ]],
    ['shelf', ['Edit Shelf', 'Delete Shelf']],
    ['magicShelf', ['Edit Magic Shelf', 'Copy JSON', 'Delete Magic Shelf']],
  ] as const)('adds every %s action with standard inline edit and delete icons', async (type, labels) => {
    fixture.componentRef.setInput('actionType', type);
    fixture.componentRef.setInput('actionId', 12);
    await fixture.whenStable();

    const menu = fixture.nativeElement.querySelector('app-menu[aria-label="More options"]') as HTMLElement;
    const items = Array.from(menu.querySelectorAll(':scope > app-menu-item')) as HTMLElement[];
    const expectedLabels: readonly string[] = labels;
    const actionItems = items.filter(item => expectedLabels.includes(item.textContent?.trim() ?? ''));

    expect(actionItems.map(item => item.textContent?.trim())).toEqual(labels);
    const iconItems = actionItems.filter(item => item.querySelector('svg') !== null);
    expect(iconItems.map(item => item.textContent?.trim())).toEqual(labels.filter(label =>
        label.startsWith('Edit ') || label.startsWith('Delete ')));
    for (const item of iconItems) {
      const icon = item.querySelector('svg')!;
      expect(icon.classList).toContain('size-4');
      expect(icon.classList).toContain('shrink-0');
      expect(icon.classList).toContain('text-text-muted');
      expect(icon.parentElement).not.toBe(item);
    }
    const entityLabel = type === 'library' ? 'Library' : type === 'shelf' ? 'Shelf' : 'Magic Shelf';
    expect(Array.from(menu.querySelectorAll(':scope > app-menu-section'))
      .map(section => section.textContent?.trim())).toEqual(['View', entityLabel]);
  });

  it('keeps but disables the direction toggle for a one-way backend sort', async () => {
    const changes: unknown[] = [];
    const [narrator] = buildSortOptions(['narrator']);
    fixture.componentRef.setInput('activeSort', {option: narrator, direction: 'asc'});
    fixture.componentRef.setInput('sortOptions', [narrator]);
    fixture.componentInstance.sortChange.subscribe(change => changes.push(change));
    await fixture.whenStable();

    const toggle = optionalButtonByLabel('Sort descending');
    expect(toggle).not.toBeNull();
    expect(toggle!.disabled).toBe(true);

    buttonByText('Narrator').click();
    await fixture.whenStable();
    const menuItem = Array.from(document.querySelectorAll('.cdk-overlay-container app-menu-item'))
      .find(item => item.textContent?.trim() === 'Narrator') as HTMLElement;
    menuItem.click();

    expect(changes).toEqual([{option: narrator, direction: 'asc'}]);
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
      {field: 'title', header: 'Title', visible: false},
      {field: 'authors', header: 'Authors', visible: true},
      {field: 'readStatus', header: 'Read status', visible: false},
      {field: 'fileName', header: 'File name', visible: true},
    ]);
    await fixture.whenStable();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Reading');
    expect(text).toContain('Publishing');
    expect(text).toContain('File');

    const title = checkboxByText('Title');
    expect(title.getAttribute('aria-checked')).toBe('true');
    expect(title.getAttribute('aria-disabled')).toBe('true');

    checkboxByText('Authors').click();
    await fixture.whenStable();

    expect(changes).toEqual([{field: 'authors', visible: false}]);
  });

  function optionalButtonByLabel(label: string): HTMLButtonElement | null {
    return fixture.nativeElement.querySelector(`button[aria-label="${label}"]`) as HTMLButtonElement | null;
  }

  function radioByLabel(label: string): HTMLInputElement {
    const labels = Array.from(fixture.nativeElement.querySelectorAll('app-radio-group label')) as HTMLLabelElement[];
    const match = labels.find(candidate => candidate.textContent?.trim() === label);
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
    const buttons = Array.from(fixture.nativeElement.querySelectorAll('button')) as HTMLButtonElement[];
    return buttons.find(candidate => candidate.textContent?.trim() === text) ?? null;
  }

  function menuItemByText(text: string): HTMLElement {
    const items = Array.from(document.querySelectorAll('.cdk-overlay-container app-menu-item')) as HTMLElement[];
    const item = items.find(candidate => candidate.textContent?.includes(text));
    if (!item) throw new Error(`Could not find menu item "${text}"`);
    return item;
  }

  function checkboxByText(text: string): HTMLElement {
    const items = Array.from(fixture.nativeElement.querySelectorAll('app-menu-checkbox')) as HTMLElement[];
    const item = items.find(candidate => candidate.textContent?.trim() === text);
    if (!item) throw new Error(`Could not find menu checkbox "${text}"`);
    return item;
  }
});
