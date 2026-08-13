import {Component, EventEmitter, inject, Input, OnChanges, OnInit, Output, signal, SimpleChanges} from '@angular/core';
import {FormControl, FormGroup, ReactiveFormsModule} from '@angular/forms';
import {TranslocoDirective, TranslocoService} from '@jsverse/transloco';
import {Button} from '@openng/optimus-ui/button';
import {InputText} from '@openng/optimus-ui/inputtext';
import {Textarea} from '@openng/optimus-ui/textarea';
import {Tooltip} from '@openng/optimus-ui/tooltip';
import {Image} from '@openng/optimus-ui/image';
import {FileUpload} from '@openng/optimus-ui/fileupload';
import {ProgressSpinner} from '@openng/optimus-ui/progressspinner';
import {Divider} from '@openng/optimus-ui/divider';
import {MessageService} from '@openng/optimus-ui/api';
import {DialogService} from '@openng/optimus-ui/dynamicdialog';
import {AuthorService} from '../../service/author.service';
import {AuthorDetails, AuthorUpdateRequest} from '../../model/author.model';
import {AuthorPhotoSearchComponent, AuthorPhotoSearchDialogData} from '../author-photo-search/author-photo-search.component';

type LockableAuthorField = 'name' | 'description' | 'asin';

type AuthorEditorForm = FormGroup<{
  name: FormControl<string>;
  nameLocked: FormControl<boolean>;
  description: FormControl<string>;
  descriptionLocked: FormControl<boolean>;
  asin: FormControl<string>;
  asinLocked: FormControl<boolean>;
  photoLocked: FormControl<boolean>;
}>;

@Component({
  selector: 'app-author-editor',
  standalone: true,
  templateUrl: './author-editor.component.html',
  styleUrls: ['./author-editor.component.scss'],
  imports: [
    ReactiveFormsModule,
    TranslocoDirective,
    Button,
    InputText,
    Textarea,
    Tooltip,
    Image,
    FileUpload,
    ProgressSpinner,
    Divider
  ],
  providers: [DialogService]
})
export class AuthorEditorComponent implements OnInit, OnChanges {

  @Input({required: true}) authorId!: number;
  @Input({required: true}) author!: AuthorDetails;
  @Output() authorUpdated = new EventEmitter<AuthorDetails>();

  private authorService = inject(AuthorService);
  private messageService = inject(MessageService);
  private dialogService = inject(DialogService);
  private t = inject(TranslocoService);
  private readonly lockableFields: readonly LockableAuthorField[] = ['name', 'description', 'asin'];
  private readonly lockControlNames = {
    name: 'nameLocked',
    description: 'descriptionLocked',
    asin: 'asinLocked',
  } as const;

  form!: AuthorEditorForm;
  isSaving = signal(false);
  isUploading = signal(false);
  hasPhoto = true;
  photoTimestamp = Date.now();

  get photoUrl(): string {
    return this.authorService.getAuthorPhotoUrl(this.authorId) + '&t=' + this.photoTimestamp;
  }

  get uploadUrl(): string {
    return this.authorService.getUploadAuthorPhotoUrl(this.authorId);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['author'] && !changes['author'].firstChange) {
      this.hasPhoto = true;
      this.photoTimestamp = Date.now();
    }
  }

  ngOnInit(): void {
    this.form = new FormGroup({
      name: new FormControl(this.author.name, {nonNullable: true}),
      nameLocked: new FormControl(this.author.nameLocked, {nonNullable: true}),
      description: new FormControl(this.author.description ?? '', {nonNullable: true}),
      descriptionLocked: new FormControl(this.author.descriptionLocked, {nonNullable: true}),
      asin: new FormControl(this.author.asin ?? '', {nonNullable: true}),
      asinLocked: new FormControl(this.author.asinLocked, {nonNullable: true}),
      photoLocked: new FormControl(this.author.photoLocked, {nonNullable: true})
    });

    this.applyLockStates();
  }

  toggleLock(field: LockableAuthorField): void {
    const fieldControl = this.form.controls[field];
    const lockedControl = this.form.controls[this.lockControlNames[field]];
    const isLocked = !lockedControl.value;
    lockedControl.setValue(isLocked);

    if (isLocked) {
      fieldControl.disable();
    } else {
      fieldControl.enable();
    }

    this.saveMetadata();
  }

  togglePhotoLock(): void {
    const lockedControl = this.form.controls.photoLocked;
    lockedControl.setValue(!lockedControl.value);
    this.saveMetadata();
  }

  onSave(): void {
    this.saveMetadata();
  }

  lockAll(): void {
    for (const field of this.lockableFields) {
      const fieldControl = this.form.controls[field];
      const lockedControl = this.form.controls[this.lockControlNames[field]];
      lockedControl.setValue(true);
      fieldControl.disable();
    }
    this.form.controls.photoLocked.setValue(true);
    this.saveMetadata();
  }

  unlockAll(): void {
    for (const field of this.lockableFields) {
      const fieldControl = this.form.controls[field];
      const lockedControl = this.form.controls[this.lockControlNames[field]];
      lockedControl.setValue(false);
      fieldControl.enable();
    }
    this.form.controls.photoLocked.setValue(false);
    this.saveMetadata();
  }

  openPhotoSearch(): void {
    const data: AuthorPhotoSearchDialogData = {
      authorId: this.authorId,
      authorName: this.author.name
    };
    const ref = this.dialogService.open(AuthorPhotoSearchComponent, {
      data,
      header: this.t.translate('authorBrowser.editor.searchPhotoTitle'),
      width: '70vw',
      height: '80vh',
      modal: true,
      closable: true,
      dismissableMask: true,
      contentStyle: {'overflow': 'hidden', 'padding': '0', 'display': 'flex', 'flex-direction': 'column'}
    });
    ref?.onClose.subscribe((result: unknown) => {
      if (result === true) {
        this.photoTimestamp = Date.now();
        this.hasPhoto = true;
        this.authorUpdated.emit(this.author);
      }
    });
  }

  onPhotoError(): void {
    this.hasPhoto = false;
  }

  onBeforeUpload(): void {
    this.isUploading.set(true);
  }

  onUpload(): void {
    this.isUploading.set(false);
    this.photoTimestamp = Date.now();
    this.hasPhoto = true;
    this.authorUpdated.emit(this.author);
    this.messageService.add({
      severity: 'success',
      summary: this.t.translate('authorBrowser.editor.toast.photoUploadedSummary'),
      detail: this.t.translate('authorBrowser.editor.toast.photoUploadedDetail')
    });
  }

  onUploadError(): void {
    this.isUploading.set(false);
    this.messageService.add({
      severity: 'error',
      summary: this.t.translate('authorBrowser.editor.toast.errorSummary'),
      detail: this.t.translate('authorBrowser.editor.toast.photoUploadErrorDetail')
    });
  }

  private saveMetadata(): void {
    if (this.isSaving()) return;
    this.isSaving.set(true);

    const formValue = this.form.getRawValue();
    const request: AuthorUpdateRequest = {
      name: formValue.name.trim() || undefined,
      description: formValue.description.trim(),
      asin: formValue.asin.trim(),
      nameLocked: formValue.nameLocked,
      descriptionLocked: formValue.descriptionLocked,
      asinLocked: formValue.asinLocked,
      photoLocked: formValue.photoLocked
    };

    this.authorService.updateAuthor(this.authorId, request).subscribe({
      next: (updated) => {
        this.isSaving.set(false);
        this.authorUpdated.emit(updated);
        this.messageService.add({
          severity: 'success',
          summary: this.t.translate('authorBrowser.editor.toast.successSummary'),
          detail: this.t.translate('authorBrowser.editor.toast.successDetail')
        });
      },
      error: () => {
        this.isSaving.set(false);
        this.messageService.add({
          severity: 'error',
          summary: this.t.translate('authorBrowser.editor.toast.errorSummary'),
          detail: this.t.translate('authorBrowser.editor.toast.errorDetail')
        });
      }
    });
  }

  private applyLockStates(): void {
    for (const field of this.lockableFields) {
      const fieldControl = this.form.controls[field];
      const lockedControl = this.form.controls[this.lockControlNames[field]];
      if (lockedControl.value) {
        fieldControl.disable();
      }
    }
  }
}
