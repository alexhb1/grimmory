import {Component, DestroyRef, inject, OnInit} from '@angular/core';
import {takeUntilDestroyed} from '@angular/core/rxjs-interop';
import {InputText} from '@openng/optimus-ui/inputtext';
import {FormBuilder, FormsModule, ReactiveFormsModule, Validators} from '@angular/forms';
import {Checkbox} from '@openng/optimus-ui/checkbox';
import {MultiSelect} from '@openng/optimus-ui/multiselect';
import {Library} from '../../../book/model/library.model';
import {Button} from '@openng/optimus-ui/button';
import {LibraryService} from '../../../book/service/library.service';
import {type UserCreateRequest, UserService} from '../user.service';
import {MessageService} from '@openng/optimus-ui/api';
import {DynamicDialogRef} from '@openng/optimus-ui/dynamicdialog';
import {passwordMatchValidator} from '../../../../shared/validators/password-match.validator';
import {TranslocoDirective, TranslocoPipe, TranslocoService} from '@jsverse/transloco';
import {getApiErrorMessage} from '../../../../shared/models/api-exception.model';
import {HttpErrorResponse} from '@angular/common/http';

const ADMIN_PERMISSION_CONTROLS = [
  'permissionUpload',
  'permissionDownload',
  'permissionEditMetadata',
  'permissionManageLibrary',
  'permissionEmailBook',
  'permissionDeleteBook',
  'permissionAccessOpds',
  'permissionSyncKoreader',
  'permissionSyncKobo',
  'permissionManageMetadataConfig',
  'permissionAccessBookdrop',
  'permissionAccessLibraryStats',
  'permissionAccessUserStats',
  'permissionAccessTaskManager',
  'permissionManageGlobalPreferences',
  'permissionManageIcons',
  'permissionManageFonts',
  'permissionBulkAutoFetchMetadata',
  'permissionBulkCustomFetchMetadata',
  'permissionBulkEditMetadata',
  'permissionBulkRegenerateCover',
  'permissionMoveOrganizeFiles',
  'permissionBulkLockUnlockMetadata',
  'permissionBulkResetGrimmoryReadProgress',
  'permissionBulkResetKoReaderReadProgress',
  'permissionBulkResetBookReadStatus',
] as const;

@Component({
  selector: 'app-create-user-dialog',
  standalone: true,
  imports: [
    InputText,
    ReactiveFormsModule,
    FormsModule,
    Checkbox,
    MultiSelect,
    Button,
    TranslocoDirective,
    TranslocoPipe
  ],
  templateUrl: './create-user-dialog.component.html',
  styleUrl: './create-user-dialog.component.scss'
})
export class CreateUserDialogComponent implements OnInit {
  private readonly fb = inject(FormBuilder).nonNullable;
  private libraryService = inject(LibraryService);
  private userService = inject(UserService);
  private messageService = inject(MessageService);
  private ref = inject(DynamicDialogRef);
  private t = inject(TranslocoService);
  private destroyRef = inject(DestroyRef);

  readonly userForm = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(3)]],
    email: ['', [Validators.required, Validators.email]],
    username: ['', Validators.required],
    password: ['', [Validators.required, Validators.minLength(8)]],
    confirmPassword: ['', Validators.required],
    selectedLibraries: this.fb.control<Library[]>([], Validators.required),
    permissionUpload: false,
    permissionDownload: false,
    permissionEditMetadata: false,
    permissionManageLibrary: false,
    permissionEmailBook: false,
    permissionDeleteBook: false,
    permissionAccessOpds: false,
    permissionSyncKoreader: false,
    permissionSyncKobo: false,
    permissionManageMetadataConfig: false,
    permissionAccessBookdrop: false,
    permissionAccessLibraryStats: false,
    permissionAccessUserStats: false,
    permissionAccessTaskManager: false,
    permissionManageGlobalPreferences: false,
    permissionManageIcons: false,
    permissionManageFonts: false,
    permissionAdmin: false,
    permissionBulkAutoFetchMetadata: false,
    permissionBulkCustomFetchMetadata: false,
    permissionBulkEditMetadata: false,
    permissionBulkRegenerateCover: false,
    permissionMoveOrganizeFiles: false,
    permissionBulkLockUnlockMetadata: false,
    permissionBulkResetGrimmoryReadProgress: false,
    permissionBulkResetKoReaderReadProgress: false,
    permissionBulkResetBookReadStatus: false,
  }, {validators: [passwordMatchValidator('password', 'confirmPassword')]});

  get libraries(): Library[] {
    return this.libraryService.libraries();
  }

  ngOnInit() {
    this.userForm.controls.permissionAdmin.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((isAdmin) => {
        ADMIN_PERMISSION_CONTROLS.forEach((controlName) => {
          this.userForm.controls[controlName].setValue(isAdmin, {emitEvent: false});
        });
      });
  }

  createUser() {
    if (this.userForm.invalid) {
      this.showValidationError();
      return;
    }
    const {confirmPassword: _confirmPassword, selectedLibraries, ...userFields} = this.userForm.getRawValue();
    const selectedLibraryIds: number[] = [];
    for (const library of selectedLibraries) {
      if (library.id === undefined) {
        this.showValidationError();
        return;
      }
      selectedLibraryIds.push(library.id);
    }

    const userData: UserCreateRequest = {
      ...userFields,
      selectedLibraries: selectedLibraryIds,
    };

    this.userService.createUser(userData).subscribe({
      next: () => {
        this.messageService.add({
          severity: 'success',
          summary: this.t.translate('common.success'),
          detail: this.t.translate('settingsUsers.createDialog.createSuccess')
        });
        this.ref.close(true);
      },
      error: (error: unknown) => {
        const fallback = this.t.translate('settingsUsers.createDialog.createError');
        const message = error instanceof HttpErrorResponse
          ? getApiErrorMessage(error, fallback)
          : fallback;
        this.messageService.add({
          severity: 'error',
          summary: this.t.translate('common.error'),
          detail: message === fallback
            ? fallback
            : this.t.translate('settingsUsers.createDialog.createFailed', {
              message,
            }),
        });
      }
    });
  }

  closeDialog(): void {
    this.ref.close();
  }

  private showValidationError(): void {
    this.messageService.add({
      severity: 'warn',
      summary: this.t.translate('common.error'),
      detail: this.t.translate('settingsUsers.createDialog.validationError')
    });
  }
}
