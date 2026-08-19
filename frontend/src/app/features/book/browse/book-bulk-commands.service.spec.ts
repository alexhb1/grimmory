import {HttpTestingController} from '@angular/common/http/testing';
import {signal} from '@angular/core';
import {TestBed} from '@angular/core/testing';
import {ConfirmationService, MessageService} from '@openng/optimus-ui/api';
import {Subject} from 'rxjs';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {createQueryClientHarness, flushQueryAsync} from '../../../core/testing/query-testing';
import {getTranslocoModule} from '../../../core/testing/transloco-testing';
import {API_CONFIG} from '../../../core/config/api-config';
import {type BookSummary} from '../data/book-response.models';
import {BookDialogHelperService} from '../service/book-dialog-helper.service';
import {type BrowseSelection, type BrowseSelectionState} from '../../../shared/components/browse/browse-selection';
import {BookBulkCommandsService} from './book-bulk-commands.service';

function selection(ids: readonly number[]): BrowseSelection {
  const selected = new Set(ids);
  return {
    state: signal<BrowseSelectionState>({mode: 'explicit', ids: selected}),
    count: signal(ids.length),
    active: signal(ids.length > 0),
    allCurrentResultsSelected: signal(false),
    isSelected: id => selected.has(id),
    toggle: vi.fn(),
    selectAll: vi.fn(),
    clear: vi.fn(),
    pruneDeleted: vi.fn(),
  };
}

function book(id: number): BookSummary {
  return {id, libraryId: 1, libraryName: 'Library'};
}

describe('BookBulkCommandsService', () => {
  let service: BookBulkCommandsService;
  let http: HttpTestingController;
  let dialogHelper: Record<
    'openBulkMetadataEditDialog' | 'openMultibookMetadataEditorDialog' |
    'openLockUnlockMetadataDialog' | 'openFileMoverDialog' | 'openBulkBookFileAttacherDialog',
    ReturnType<typeof vi.fn>
  >;
  let confirmationService: {confirm: ReturnType<typeof vi.fn>};

  beforeEach(() => {
    const harness = createQueryClientHarness();
    dialogHelper = {
      openBulkMetadataEditDialog: vi.fn().mockResolvedValue(null),
      openMultibookMetadataEditorDialog: vi.fn().mockResolvedValue(null),
      openLockUnlockMetadataDialog: vi.fn().mockResolvedValue(null),
      openFileMoverDialog: vi.fn().mockResolvedValue(null),
      openBulkBookFileAttacherDialog: vi.fn().mockResolvedValue(null),
    };
    confirmationService = {confirm: vi.fn()};

    TestBed.configureTestingModule({
      imports: [getTranslocoModule()],
      providers: [
        ...harness.providers,
        BookBulkCommandsService,
        {provide: BookDialogHelperService, useValue: dialogHelper},
        {provide: ConfirmationService, useValue: confirmationService},
        {provide: MessageService, useValue: {add: vi.fn()}},
      ],
    });
    service = TestBed.inject(BookBulkCommandsService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    vi.restoreAllMocks();
  });

  it.each([
    {name: 'bulk metadata editor', clears: true, dialog: () => dialogHelper.openBulkMetadataEditDialog,
      run: (selected: BrowseSelection) => service.editAll(selected, vi.fn())},
    {name: 'one-by-one metadata editor', clears: true, dialog: () => dialogHelper.openMultibookMetadataEditorDialog,
      run: (selected: BrowseSelection) => service.editOneByOne(selected, vi.fn())},
    {name: 'Lock/Unlock metadata dialog', clears: true, dialog: () => dialogHelper.openLockUnlockMetadataDialog,
      run: (selected: BrowseSelection) => service.lockUnlockMetadata(selected, vi.fn())},
    {name: 'file organizer', clears: false, dialog: () => dialogHelper.openFileMoverDialog,
      run: (selected: BrowseSelection) => service.organizeFiles(selected, vi.fn())},
  ])('opens the $name with resolved IDs', async ({clears, dialog, run}) => {
    const onClose = new Subject<void>();
    dialog().mockResolvedValue({onClose});
    const selected = selection([11, 12]);

    run(selected);

    await vi.waitFor(() => expect(dialog()).toHaveBeenCalledOnce());
    expect([...dialog().mock.calls[0][0]]).toEqual([11, 12]);
    onClose.next();
    expect(selected.clear).toHaveBeenCalledTimes(clears ? 1 : 0);
  });

  it.each([
    {name: 'success', result: {success: true}, clears: true},
    {name: 'cancel', result: undefined, clears: false},
  ])('handles file-attacher $name', async ({result, clears}) => {
    const onClose = new Subject<{success?: boolean} | undefined>();
    dialogHelper.openBulkBookFileAttacherDialog.mockResolvedValue({onClose});
    const selected = selection([41, 42]);

    service.attachFiles(selected, [book(40), book(41), book(42)]);

    await vi.waitFor(() => expect(dialogHelper.openBulkBookFileAttacherDialog).toHaveBeenCalledOnce());
    expect(dialogHelper.openBulkBookFileAttacherDialog.mock.calls[0][0]
      .map((sourceBook: BookSummary) => sourceBook.id)).toEqual([41, 42]);
    onClose.next(result);
    expect(selected.clear).toHaveBeenCalledTimes(clears ? 1 : 0);
  });

  it('removes every supplied shelf in one membership mutation', async () => {
    service.removeFromAllShelves(selection([61, 62]), vi.fn(), [7, 8]);
    await flushQueryAsync(1);

    const request = http.expectOne(`${API_CONFIG.BASE_URL}/api/v1/books/shelves`);
    expect(request.request.body).toEqual({
      bookIds: [61, 62],
      shelvesToAssign: [],
      shelvesToUnassign: [7, 8],
    });
    request.flush([]);
    await flushQueryAsync(1);
  });

  it('sends UNSET through the existing read-status mutation after confirmation', async () => {
    service.markAs(selection([71]), vi.fn(), 'UNSET');
    const confirmation = confirmationService.confirm.mock.calls[0][0] as {accept(): void};

    confirmation.accept();
    await flushQueryAsync(1);

    const request = http.expectOne(`${API_CONFIG.BASE_URL}/api/v1/books/status`);
    expect(request.request.body).toEqual({bookIds: [71], status: 'UNSET'});
    request.flush([]);
    await flushQueryAsync(1);
  });
});
