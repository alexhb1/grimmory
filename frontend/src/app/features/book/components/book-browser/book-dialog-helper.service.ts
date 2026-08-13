import {inject, Injectable, Type} from '@angular/core';
import {DynamicDialogRef} from '@openng/optimus-ui/dynamicdialog';
import {DialogLauncherService, DialogSize, DialogStyle} from '../../../../shared/services/dialog-launcher.service';
import {MetadataRefreshType} from '../../../metadata/model/request/metadata-refresh-type.enum';
import {Book} from '../../model/book.model';
import type {AdditionalFileUploaderDialogData} from '../additional-file-uploader/additional-file-uploader.component';
import type {BookFileAttacherDialogData} from '../book-file-attacher/book-file-attacher.component';
import type {ShelfAssignerDialogData} from '../shelf-assigner/shelf-assigner.component';
import type {LockUnlockMetadataDialogData} from './lock-unlock-metadata-dialog/lock-unlock-metadata-dialog.component';
import type {AddPhysicalBookDialogData} from '../add-physical-book-dialog/add-physical-book-dialog.component';
import type {BulkIsbnImportDialogData} from '../bulk-isbn-import-dialog/bulk-isbn-import-dialog.component';
import type {DuplicateMergerDialogData} from '../duplicate-merger/duplicate-merger.component';
import type {BookSenderDialogData} from '../book-sender/book-sender.component';

interface MetadataRefreshDialogContext {
  metadataRefreshType: MetadataRefreshType;
  bookIds?: number[];
  libraryId?: number;
}

@Injectable({providedIn: 'root'})
export class BookDialogHelperService {

  private dialogLauncherService = inject(DialogLauncherService);

  private openDialog(component: Type<unknown>, options: object): DynamicDialogRef | null {
    return this.dialogLauncherService.openDialog(component, options);
  }

  openBookDetailsDialog(bookId: number): Promise<DynamicDialogRef | null> {
    return this.dialogLauncherService.launchLazyDialog(async () => {
      const {BookMetadataCenterComponent} = await import('../../../metadata/component/book-metadata-center/book-metadata-center.component');
      return this.openDialog(BookMetadataCenterComponent, {
        showHeader: false,
        styleClass: `book-details-dialog ${DialogSize.FULL} ${DialogStyle.MINIMAL}`,
        data: {bookId},
      });
    });
  }

  openShelfAssignerDialog(book: Book | null, bookIds: Set<number> | null): Promise<DynamicDialogRef | null> {
    return this.dialogLauncherService.launchLazyDialog(async () => {
      let data: ShelfAssignerDialogData;
      if (book !== null) {
        data = {isMultiBooks: false, book};
      } else if (bookIds !== null) {
        data = {isMultiBooks: true, bookIds};
      } else {
        return null;
      }
      const {ShelfAssignerComponent} = await import('../shelf-assigner/shelf-assigner.component');
      return this.openDialog(ShelfAssignerComponent, {
        showHeader: false,
        data: data,
        styleClass: `${DialogSize.SM} ${DialogStyle.MINIMAL}`,
      });
    });
  }

  openShelfCreatorDialog(): Promise<DynamicDialogRef | null> {
    return this.dialogLauncherService.launchLazyDialog(async () => {
      const {ShelfCreatorComponent} = await import('../shelf-creator/shelf-creator.component');
      return this.openDialog(ShelfCreatorComponent, {
        showHeader: false,
        styleClass: `${DialogSize.MD} ${DialogStyle.MINIMAL}`,
      });
    });
  }

  openLockUnlockMetadataDialog(bookIds: Set<number>): Promise<DynamicDialogRef | null> {
    return this.dialogLauncherService.launchLazyDialog(async () => {
      const {LockUnlockMetadataDialogComponent} = await import('./lock-unlock-metadata-dialog/lock-unlock-metadata-dialog.component');
      const data: LockUnlockMetadataDialogData = {bookIds: Array.from(bookIds)};
      return this.openDialog(LockUnlockMetadataDialogComponent, {
        showHeader: false,
        styleClass: `${DialogSize.LG} ${DialogStyle.MINIMAL}`,
        data,
      });
    });
  }

  openMetadataRefreshDialog(bookIds: Set<number>): Promise<DynamicDialogRef | null> {
    return this.openMetadataRefreshDialogWithContext({
      metadataRefreshType: MetadataRefreshType.BOOKS,
      bookIds: Array.from(bookIds)
    });
  }

  openMetadataRefreshDialogWithContext(context: MetadataRefreshDialogContext): Promise<DynamicDialogRef | null> {
    return this.dialogLauncherService.launchLazyDialog(async () => {
      const {MultiBookMetadataFetchComponent} = await import('../../../metadata/component/multi-book-metadata-fetch/multi-book-metadata-fetch-component');
      return this.openDialog(MultiBookMetadataFetchComponent, {
        showHeader: false,
        styleClass: `${DialogSize.FULL} ${DialogStyle.MINIMAL}`,
        data: {
          bookIds: context.bookIds ?? [],
          libraryId: context.libraryId,
          metadataRefreshType: context.metadataRefreshType,
        },
      });
    });
  }

  openBulkMetadataEditDialog(bookIds: Set<number>): Promise<DynamicDialogRef | null> {
    return this.dialogLauncherService.launchLazyDialog(async () => {
      const {BulkMetadataUpdateComponent} = await import('../../../metadata/component/bulk-metadata-update/bulk-metadata-update-component');
      return this.openDialog(BulkMetadataUpdateComponent, {
        showHeader: false,
        styleClass: `${DialogSize.XL} ${DialogStyle.MINIMAL}`,
        data: {bookIds: Array.from(bookIds)},
      });
    });
  }

  openMultibookMetadataEditorDialog(bookIds: Set<number>): Promise<DynamicDialogRef | null> {
    return this.dialogLauncherService.launchLazyDialog(async () => {
      const {MultiBookMetadataEditorComponent} = await import('../../../metadata/component/multi-book-metadata-editor/multi-book-metadata-editor-component');
      return this.openDialog(MultiBookMetadataEditorComponent, {
        showHeader: false,
        styleClass: `${DialogSize.FULL} ${DialogStyle.MINIMAL}`,
        data: {bookIds: Array.from(bookIds)},
      });
    });
  }

  openFileMoverDialog(bookIds: Set<number>): Promise<DynamicDialogRef | null> {
    return this.dialogLauncherService.launchLazyDialog(async () => {
      const {FileMoverComponent} = await import('../../../../shared/components/file-mover/file-mover-component');
      return this.openDialog(FileMoverComponent, {
        showHeader: false,
        styleClass: `${DialogSize.FULL} ${DialogStyle.MINIMAL}`,
        maximizable: true,
        data: {
          bookIds: Array.from(bookIds),
        },
      });
    });
  }

  openCustomSendDialog(book: Book): Promise<DynamicDialogRef | null> {
    return this.dialogLauncherService.launchLazyDialog(async () => {
      const {BookSenderComponent} = await import('../book-sender/book-sender.component');
      const data: BookSenderDialogData = {book};
      return this.openDialog(BookSenderComponent, {
        showHeader: false,
        styleClass: `${DialogSize.SM} ${DialogStyle.MINIMAL}`,
        data,
      });
    });
  }

  openCoverSearchDialog(bookId: number, coverType?: 'ebook' | 'audiobook'): Promise<DynamicDialogRef | null> {
    return this.dialogLauncherService.launchLazyDialog(async () => {
      const {CoverSearchComponent} = await import('../../../metadata/component/cover-search/cover-search.component');
      return this.openDialog(CoverSearchComponent, {
        showHeader: false,
        styleClass: `${DialogSize.FULL} ${DialogStyle.MINIMAL}`,
        data: {bookId, coverType},
      });
    });
  }

  openAdditionalFileUploaderDialog(book: Book): Promise<DynamicDialogRef | null> {
    return this.dialogLauncherService.launchLazyDialog(async () => {
      const {AdditionalFileUploaderComponent} = await import('../additional-file-uploader/additional-file-uploader.component');
      const data: AdditionalFileUploaderDialogData = {book};
      return this.openDialog(AdditionalFileUploaderComponent, {
        showHeader: false,
        styleClass: `${DialogSize.MD} ${DialogStyle.MINIMAL}`,
        data,
      });
    });
  }

  openBookFileAttacherDialog(sourceBook: Book): Promise<DynamicDialogRef | null> {
    return this.dialogLauncherService.launchLazyDialog(async () => {
      const {BookFileAttacherComponent} = await import('../book-file-attacher/book-file-attacher.component');
      const data: BookFileAttacherDialogData = {sourceBook};
      return this.openDialog(BookFileAttacherComponent, {
        showHeader: false,
        styleClass: `${DialogSize.MD} ${DialogStyle.MINIMAL}`,
        data,
      });
    });
  }

  openBulkBookFileAttacherDialog(sourceBooks: Book[]): Promise<DynamicDialogRef | null> {
    return this.dialogLauncherService.launchLazyDialog(async () => {
      const {BookFileAttacherComponent} = await import('../book-file-attacher/book-file-attacher.component');
      const data: BookFileAttacherDialogData = {sourceBooks};
      return this.openDialog(BookFileAttacherComponent, {
        showHeader: false,
        styleClass: `${DialogSize.MD} ${DialogStyle.MINIMAL}`,
        data,
      });
    });
  }

  openDuplicateMergerDialog(libraryId: number): Promise<DynamicDialogRef | null> {
    return this.dialogLauncherService.launchLazyDialog(async () => {
      const {DuplicateMergerComponent} = await import('../duplicate-merger/duplicate-merger.component');
      const data: DuplicateMergerDialogData = {libraryId};
      return this.openDialog(DuplicateMergerComponent, {
        showHeader: false,
        styleClass: `${DialogSize.XL} ${DialogStyle.MINIMAL}`,
        data,
      });
    });
  }

  openAddPhysicalBookDialog(libraryId?: number): Promise<DynamicDialogRef | null> {
    return this.dialogLauncherService.launchLazyDialog(async () => {
      const {AddPhysicalBookDialogComponent} = await import('../add-physical-book-dialog/add-physical-book-dialog.component');
      const data: AddPhysicalBookDialogData = {libraryId};
      return this.openDialog(AddPhysicalBookDialogComponent, {
        showHeader: false,
        styleClass: `${DialogSize.LG} ${DialogStyle.MINIMAL}`,
        data,
      });
    });
  }

  openBulkIsbnImportDialog(libraryId?: number): Promise<DynamicDialogRef | null> {
    return this.dialogLauncherService.launchLazyDialog(async () => {
      const {BulkIsbnImportDialogComponent} = await import('../bulk-isbn-import-dialog/bulk-isbn-import-dialog.component');
      const data: BulkIsbnImportDialogData = {libraryId};
      return this.openDialog(BulkIsbnImportDialogComponent, {
        showHeader: false,
        styleClass: `${DialogSize.LG} ${DialogStyle.MINIMAL}`,
        data,
      });
    });
  }
}
