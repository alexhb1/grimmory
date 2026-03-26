import {Component, effect, inject} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {Select} from 'primeng/select';
import {AutoComplete, AutoCompleteCompleteEvent} from 'primeng/autocomplete';
import {BookService} from '../../service/book.service';
import {BookMetadataService} from '../../service/book-metadata.service';
import {LibraryService} from '../../service/library.service';
import {Library} from '../../model/library.model';
import {CreatePhysicalBookRequest} from '../../model/book.model';
import {TranslocoDirective} from '@jsverse/transloco';
import {ModalRef} from '../../../../shared/components/ui/modal/modal.service';
import {MODAL_DATA} from '../../../../shared/components/ui/modal/modal-host';
import {InputDirective} from '../../../../shared/components/ui/input/input';
import {ButtonComponent} from '../../../../shared/components/ui/button/button';
import {DividerComponent} from '../../../../shared/components/ui/divider/divider';

@Component({
  selector: 'app-add-physical-book-dialog',
  standalone: true,
  templateUrl: './add-physical-book-dialog.component.html',
  imports: [FormsModule, Select, AutoComplete, InputDirective, ButtonComponent, DividerComponent, TranslocoDirective],
  host: {class: 'flex flex-col flex-1 min-h-0'},
})
export class AddPhysicalBookDialogComponent {
  readonly modalRef = inject(ModalRef);
  private data = inject(MODAL_DATA) as {libraryId?: number} | null;
  private bookService = inject(BookService);
  private bookMetadataService = inject(BookMetadataService);
  private libraryService = inject(LibraryService);

  selectedLibraryId: number | null = null;
  title = '';
  isbn = '';
  authors: string[] = [];
  description = '';
  publisher = '';
  publishedDate = '';
  language = '';
  pageCount: number | null = null;
  categories: string[] = [];

  get allAuthors(): string[] { return this.bookService.uniqueMetadata().authors; }
  get allCategories(): string[] { return this.bookService.uniqueMetadata().categories; }
  filteredAuthors: string[] = [];
  filteredCategories: string[] = [];

  coverUrl: string | null = null;
  isLoading = false;
  isFetchingMetadata = false;

  private readonly initializeSelectedLibraryEffect = effect(() => {
    const libraries = this.libraries;
    if (libraries.length === 0) return;

    if (this.data?.libraryId) {
      this.selectedLibraryId = this.data.libraryId;
      return;
    }

    if (this.selectedLibraryId == null && libraries[0].id !== undefined) {
      this.selectedLibraryId = libraries[0].id;
    }
  });

  get libraries(): Library[] {
    return this.libraryService.libraries();
  }

  filterAuthors(event: AutoCompleteCompleteEvent): void {
    const query = event.query.toLowerCase();
    this.filteredAuthors = this.allAuthors.filter(a => a.toLowerCase().includes(query));
  }

  filterCategories(event: AutoCompleteCompleteEvent): void {
    const query = event.query.toLowerCase();
    this.filteredCategories = this.allCategories.filter(c => c.toLowerCase().includes(query));
  }

  onAutoCompleteKeyUp(fieldName: 'authors' | 'categories', event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      const input = event.target as HTMLInputElement;
      const value = input.value?.trim();
      if (value) {
        const values = this[fieldName];
        if (!values.includes(value)) {
          this[fieldName] = [...values, value];
        }
        input.value = '';
      }
    }
  }

  onAutoCompleteSelect(fieldName: 'authors' | 'categories', event: {value: string, originalEvent: Event}): void {
    const values = this[fieldName];
    if (!values.includes(event.value)) {
      this[fieldName] = [...values, event.value];
    }
    (event.originalEvent.target as HTMLInputElement).value = '';
  }

  fetchMetadataByIsbn(): void {
    const isbnValue = this.isbn.trim();
    if (!isbnValue || this.isFetchingMetadata) return;

    this.isFetchingMetadata = true;
    this.bookMetadataService.lookupByIsbn(isbnValue).subscribe({
      next: (metadata) => {
        if (metadata.title) this.title = metadata.title;
        if (metadata.authors?.length) this.authors = [...metadata.authors];
        if (metadata.description) this.description = metadata.description;
        if (metadata.publisher) this.publisher = metadata.publisher;
        if (metadata.publishedDate) this.publishedDate = metadata.publishedDate;
        if (metadata.language) this.language = metadata.language;
        if (metadata.pageCount) this.pageCount = metadata.pageCount;
        if (metadata.categories?.length) this.categories = [...metadata.categories];
        this.coverUrl = metadata.thumbnailUrl || null;
        this.isFetchingMetadata = false;
      },
      error: () => {
        this.isFetchingMetadata = false;
      }
    });
  }

  canCreate(): boolean {
    return !!this.selectedLibraryId && (!!this.title.trim() || !!this.isbn.trim());
  }

  createBook(): void {
    if (!this.canCreate() || this.isLoading) return;

    this.isLoading = true;

    const request: CreatePhysicalBookRequest = {
      libraryId: this.selectedLibraryId!,
      title: this.title.trim() || undefined,
      isbn: this.isbn.trim() || undefined,
      authors: this.authors.length > 0 ? this.authors : undefined,
      description: this.description.trim() || undefined,
      publisher: this.publisher.trim() || undefined,
      publishedDate: this.publishedDate.trim() || undefined,
      language: this.language.trim() || undefined,
      pageCount: this.pageCount ?? undefined,
      categories: this.categories.length > 0 ? this.categories : undefined,
      thumbnailUrl: this.coverUrl || undefined
    };

    this.bookService.createPhysicalBook(request).subscribe({
      next: (book) => {
        this.isLoading = false;
        this.modalRef.close(book);
      },
      error: () => {
        this.isLoading = false;
      }
    });
  }
}
