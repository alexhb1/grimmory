import {inject, Injectable} from '@angular/core';
import {ConfirmationService, MenuItem, MessageService} from 'primeng/api';
import {Router} from '@angular/router';
import {LibraryService} from './library.service';
import {ShelfService} from './shelf.service';
import {Library} from '../model/library.model';
import {Shelf} from '../model/shelf.model';
import {MetadataRefreshType} from '../../metadata/model/request/metadata-refresh-type.enum';
import {MagicShelf, MagicShelfService} from '../../magic-shelf/service/magic-shelf.service';
import {TaskHelperService} from '../../settings/task-management/task-helper.service';
import {UserService} from "../../settings/user-management/user.service";
import {LoadingService} from '../../../core/services/loading.service';
import {finalize} from 'rxjs';
import {TranslocoService} from '@jsverse/transloco';
import {ModalService} from '../../../shared/components/ui/modal/modal.service';
import {ConfirmService} from '../../../shared/components/ui/confirm-modal/confirm.service';
import {LibraryCreatorComponent} from '../../library-creator/library-creator.component';
import {AddPhysicalBookDialogComponent} from '../components/add-physical-book-dialog/add-physical-book-dialog.component';
import {BulkIsbnImportDialogComponent} from '../components/bulk-isbn-import-dialog/bulk-isbn-import-dialog.component';
import {MetadataFetchOptionsComponent} from '../../metadata/component/metadata-options-dialog/metadata-fetch-options/metadata-fetch-options.component';
import {DuplicateMergerComponent} from '../components/duplicate-merger/duplicate-merger.component';
import {ShelfEditDialogComponent} from '../components/shelf-edit-dialog/shelf-edit-dialog.component';
import {MagicShelfComponent} from '../../magic-shelf/component/magic-shelf-component';

@Injectable({
  providedIn: 'root',
})
export class LibraryShelfMenuService {

  private confirmationService = inject(ConfirmationService);
  private messageService = inject(MessageService);
  private libraryService = inject(LibraryService);
  private shelfService = inject(ShelfService);
  private taskHelperService = inject(TaskHelperService);
  private router = inject(Router);
  private magicShelfService = inject(MagicShelfService);
  private userService = inject(UserService);
  private loadingService = inject(LoadingService);
  private readonly t = inject(TranslocoService);
  private modalService = inject(ModalService);
  private confirmService = inject(ConfirmService);

  initializeLibraryMenuItems(entity: Library | Shelf | MagicShelf | null): MenuItem[] {
    return [
      {
        label: this.t.translate('book.shelfMenuService.library.optionsLabel'),
        items: [
          {
            label: this.t.translate('book.shelfMenuService.library.addPhysicalBook'),
            icon: 'pi pi-book',
            command: () => {
              this.modalService.open(AddPhysicalBookDialogComponent, {
                title: this.t.translate('book.shelfMenuService.library.addPhysicalBook'),
                size: 'md',
                height: '85vh',
                data: { libraryId: entity?.id },
              });
            }
          },
          {
            label: this.t.translate('book.shelfMenuService.library.bulkIsbnImport'),
            icon: 'pi pi-barcode',
            command: () => {
              this.modalService.open(BulkIsbnImportDialogComponent, {
                title: this.t.translate('book.shelfMenuService.library.bulkIsbnImport'),
                size: 'md',
                height: '85vh',
                data: { libraryId: entity?.id },
              });
            }
          },
          {
            separator: true
          },
          {
            label: this.t.translate('book.shelfMenuService.library.editLibrary'),
            icon: 'pi pi-pen-to-square',
            command: () => {
              this.modalService.open(LibraryCreatorComponent, {
                title: this.t.translate('book.shelfMenuService.library.editLibrary'),
                size: 'md',
                height: '85vh',
                data: { mode: 'edit', libraryId: entity!.id },
              });
            }
          },
          {
            label: this.t.translate('book.shelfMenuService.library.rescanLibrary'),
            icon: 'pi pi-refresh',
            command: () => {
              this.confirmService.open({
                title: this.t.translate('book.shelfMenuService.confirm.header'),
                message: this.t.translate('book.shelfMenuService.confirm.rescanLibraryMessage', {name: entity?.name}),
                confirmLabel: this.t.translate('book.shelfMenuService.confirm.rescanLabel'),
              }).subscribe(confirmed => {
                if (!confirmed) return;
                this.libraryService.refreshLibrary(entity?.id!).subscribe({
                  complete: () => {
                    this.messageService.add({severity: 'info', summary: this.t.translate('common.success'), detail: this.t.translate('book.shelfMenuService.toast.libraryRefreshSuccessDetail')});
                  },
                  error: () => {
                    this.messageService.add({severity: 'error', summary: this.t.translate('book.shelfMenuService.toast.failedSummary'), detail: this.t.translate('book.shelfMenuService.toast.libraryRefreshFailedDetail')});
                  }
                });
              });
            }
          },
          {
            label: this.t.translate('book.shelfMenuService.library.customFetchMetadata'),
            icon: 'pi pi-sync',
            command: () => {
              this.modalService.open(MetadataFetchOptionsComponent, {
                title: this.t.translate('book.shelfMenuService.library.customFetchMetadata'),
                size: 'xl',
                height: '85vh',
                data: { libraryId: entity?.id, metadataRefreshType: MetadataRefreshType.LIBRARY },
              });
            }
          },
          {
            label: this.t.translate('book.shelfMenuService.library.autoFetchMetadata'),
            icon: 'pi pi-bolt',
            command: () => {
              this.taskHelperService.refreshMetadataTask({
                refreshType: MetadataRefreshType.LIBRARY,
                libraryId: entity?.id ?? undefined
              }).subscribe();
            }
          },
          {
            label: this.t.translate('book.shelfMenuService.library.findDuplicates'),
            icon: 'pi pi-copy',
            command: () => {
              this.modalService.open(DuplicateMergerComponent, {
                title: this.t.translate('book.shelfMenuService.library.findDuplicates'),
                size: 'xl',
                height: '85vh',
                data: { libraryId: entity?.id },
              });
            }
          },
          {
            separator: true
          },
          {
            label: this.t.translate('book.shelfMenuService.library.deleteLibrary'),
            icon: 'pi pi-trash',
            command: () => {
              this.confirmService.open({
                title: this.t.translate('book.shelfMenuService.confirm.header'),
                message: this.t.translate('book.shelfMenuService.confirm.deleteLibraryMessage', {name: entity?.name}),
                confirmLabel: this.t.translate('common.yes'),
                confirmVariant: 'danger',
              }).subscribe(confirmed => {
                if (!confirmed) return;
                const loader = this.loadingService.show(this.t.translate('book.shelfMenuService.loading.deletingLibrary', {name: entity?.name}));
                this.libraryService.deleteLibrary(entity?.id!)
                  .pipe(finalize(() => this.loadingService.hide(loader)))
                  .subscribe({
                    complete: () => {
                      this.router.navigate(['/']);
                      this.messageService.add({severity: 'info', summary: this.t.translate('common.success'), detail: this.t.translate('book.shelfMenuService.toast.libraryDeletedDetail')});
                    },
                    error: () => {
                      this.messageService.add({severity: 'error', summary: this.t.translate('book.shelfMenuService.toast.failedSummary'), detail: this.t.translate('book.shelfMenuService.toast.libraryDeleteFailedDetail')});
                    }
                  });
              });
            }
          }
        ]
      }
    ];
  }

  initializeShelfMenuItems(entity: any): MenuItem[] {
    const user = this.userService.getCurrentUser();
    const isOwner = entity?.userId === user?.id;
    const isPublicShelf = entity?.publicShelf ?? false;
    const disableOptions = !isOwner;

    return [
      {
        label: (isPublicShelf ? this.t.translate('book.shelfMenuService.shelf.publicShelfPrefix') : '') + (disableOptions ? this.t.translate('book.shelfMenuService.shelf.readOnly') : this.t.translate('book.shelfMenuService.shelf.optionsLabel')),
        items: [
          {
            label: this.t.translate('book.shelfMenuService.shelf.editShelf'),
            icon: 'pi pi-pen-to-square',
            disabled: disableOptions,
            command: () => {
              this.modalService.open(ShelfEditDialogComponent, {
                title: this.t.translate('book.shelfMenuService.shelf.editShelf'),
                size: 'sm',
                data: { shelfId: entity?.id },
              });
            }
          },
          {
            separator: true
          },
          {
            label: this.t.translate('book.shelfMenuService.shelf.deleteShelf'),
            icon: 'pi pi-trash',
            disabled: disableOptions,
            command: () => {
              this.confirmService.open({
                title: this.t.translate('book.shelfMenuService.confirm.header'),
                message: this.t.translate('book.shelfMenuService.confirm.deleteShelfMessage', {name: entity?.name}),
                confirmLabel: this.t.translate('common.yes'),
                confirmVariant: 'danger',
              }).subscribe(confirmed => {
                if (!confirmed) return;
                this.shelfService.deleteShelf(entity?.id!).subscribe({
                  complete: () => {
                    this.router.navigate(['/']);
                    this.messageService.add({severity: 'info', summary: this.t.translate('common.success'), detail: this.t.translate('book.shelfMenuService.toast.shelfDeletedDetail')});
                  },
                  error: () => {
                    this.messageService.add({severity: 'error', summary: this.t.translate('book.shelfMenuService.toast.failedSummary'), detail: this.t.translate('book.shelfMenuService.toast.shelfDeleteFailedDetail')});
                  }
                });
              });
            }
          }
        ]
      }
    ];
  }

  initializeMagicShelfMenuItems(entity: MagicShelf | null): MenuItem[] {
    const isAdmin = this.userService.getCurrentUser()?.permissions.admin ?? false;
    const isPublicShelf = entity?.isPublic ?? false;
    const disableOptions = isPublicShelf && !isAdmin;

    return [
      {
        label: this.t.translate('book.shelfMenuService.magicShelf.optionsLabel'),
        items: [
          {
            label: this.t.translate('book.shelfMenuService.magicShelf.editMagicShelf'),
            icon: 'pi pi-pen-to-square',
            disabled: disableOptions,
            command: () => {
              this.modalService.open(MagicShelfComponent, {
                title: this.t.translate('book.shelfMenuService.magicShelf.editMagicShelf'),
                size: 'xl',
                height: '85vh',
                data: { id: entity?.id, editMode: true },
              });
            }
          },
          {
            label: this.t.translate('book.shelfMenuService.magicShelf.exportJson'),
            icon: 'pi pi-copy',
            command: () => {
              if (entity?.filterJson) {
                navigator.clipboard.writeText(entity.filterJson).then(() => {
                  this.messageService.add({severity: 'success', summary: this.t.translate('common.success'), detail: this.t.translate('book.shelfMenuService.toast.magicShelfJsonCopiedDetail')});
                });
              }
            }
          },
          {
            separator: true
          },
          {
            label: this.t.translate('book.shelfMenuService.magicShelf.deleteMagicShelf'),
            icon: 'pi pi-trash',
            disabled: disableOptions,
            command: () => {
              this.confirmService.open({
                title: this.t.translate('book.shelfMenuService.confirm.header'),
                message: this.t.translate('book.shelfMenuService.confirm.deleteMagicShelfMessage', {name: entity?.name}),
                confirmLabel: this.t.translate('common.yes'),
                confirmVariant: 'danger',
              }).subscribe(confirmed => {
                if (!confirmed) return;
                this.magicShelfService.deleteShelf(entity?.id!).subscribe({
                  complete: () => {
                    this.router.navigate(['/']);
                    this.messageService.add({severity: 'info', summary: this.t.translate('common.success'), detail: this.t.translate('book.shelfMenuService.toast.magicShelfDeletedDetail')});
                  },
                  error: () => {
                    this.messageService.add({severity: 'error', summary: this.t.translate('book.shelfMenuService.toast.failedSummary'), detail: this.t.translate('book.shelfMenuService.toast.magicShelfDeleteFailedDetail')});
                  }
                });
              });
            }
          }
        ]
      }
    ];
  }
}
