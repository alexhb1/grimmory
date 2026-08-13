import {Component, inject, OnInit} from '@angular/core';
import {FormControl, FormGroup, ReactiveFormsModule, Validators} from '@angular/forms';
import {Button} from '@openng/optimus-ui/button';
import {InputText} from '@openng/optimus-ui/inputtext';
import {ProgressSpinner} from '@openng/optimus-ui/progressspinner';
import {Image} from '@openng/optimus-ui/image';
import {Tooltip} from '@openng/optimus-ui/tooltip';
import {DynamicDialogConfig, DynamicDialogRef} from '@openng/optimus-ui/dynamicdialog';
import {TranslocoDirective, TranslocoService} from '@jsverse/transloco';
import {MessageService} from '@openng/optimus-ui/api';
import {finalize} from 'rxjs/operators';
import {AuthorService} from '../../service/author.service';
import {AuthorPhotoResult} from '../../model/author.model';

export interface AuthorPhotoSearchDialogData {
  authorId: number;
  authorName?: string;
}

@Component({
  selector: 'app-author-photo-search',
  templateUrl: './author-photo-search.component.html',
  styleUrls: ['./author-photo-search.component.scss'],
  imports: [
    ReactiveFormsModule,
    Button,
    InputText,
    ProgressSpinner,
    Image,
    Tooltip,
    TranslocoDirective
  ]
})
export class AuthorPhotoSearchComponent implements OnInit {
  readonly searchForm = new FormGroup({
    query: new FormControl('', {nonNullable: true, validators: [Validators.required]})
  });
  photos: AuthorPhotoResult[] = [];
  searching = false;
  hasSearched = false;

  private authorService = inject(AuthorService);
  private dynamicDialogConfig = inject<DynamicDialogConfig<AuthorPhotoSearchDialogData>>(DynamicDialogConfig);
  protected dynamicDialogRef = inject(DynamicDialogRef);
  private messageService = inject(MessageService);
  private t = inject(TranslocoService);

  private authorId!: number;

  ngOnInit(): void {
    const dialogData = this.dynamicDialogConfig.data;
    if (!dialogData) {
      throw new Error('Author photo search requires dialog data');
    }

    this.authorId = dialogData.authorId;
    const authorName = dialogData.authorName;

    if (authorName) {
      this.searchForm.patchValue({query: authorName});
      if (this.searchForm.valid) {
        this.onSearch();
      }
    }
  }

  onSearch(): void {
    if (!this.searchForm.valid) return;
    this.searching = true;
    this.photos = [];

    this.authorService.searchAuthorPhotos(this.authorId, this.searchForm.controls.query.value)
      .pipe(finalize(() => {
        this.searching = false;
        this.hasSearched = true;
      }))
      .subscribe({
        next: (photo) => {
          this.photos.push(photo);
          this.photos.sort((a, b) => a.index - b.index);
        },
        error: () => {
          console.error('Error searching photos');
        }
      });
  }

  selectAndUploadPhoto(photo: AuthorPhotoResult): void {
    this.authorService.uploadAuthorPhotoFromUrl(this.authorId, photo.url).subscribe({
      next: () => {
        this.messageService.add({
          severity: 'success',
          summary: this.t.translate('authorBrowser.editor.toast.photoUploadedSummary'),
          detail: this.t.translate('authorBrowser.editor.toast.photoUploadedDetail')
        });
        this.dynamicDialogRef.close(true);
      },
      error: () => {
        this.messageService.add({
          severity: 'error',
          summary: this.t.translate('authorBrowser.editor.toast.errorSummary'),
          detail: this.t.translate('authorBrowser.editor.toast.photoUploadErrorDetail')
        });
      }
    });
  }

  onClear(): void {
    this.searchForm.reset();
    this.photos = [];
    this.hasSearched = false;
  }
}
