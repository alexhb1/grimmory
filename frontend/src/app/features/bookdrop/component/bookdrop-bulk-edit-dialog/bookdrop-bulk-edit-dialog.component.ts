import {Component, inject, OnInit, ChangeDetectorRef} from '@angular/core';
import {FormControl, FormGroup, FormsModule, ReactiveFormsModule} from '@angular/forms';
import {DynamicDialogConfig, DynamicDialogRef} from '@openng/optimus-ui/dynamicdialog';
import {Button} from '@openng/optimus-ui/button';
import {Checkbox} from '@openng/optimus-ui/checkbox';
import {InputText} from '@openng/optimus-ui/inputtext';
import {AutoComplete} from '@openng/optimus-ui/autocomplete';
import {Divider} from '@openng/optimus-ui/divider';
import {SelectButton} from '@openng/optimus-ui/selectbutton';
import type {Observable} from 'rxjs';
import {BookMetadata} from '../../../book/model/book.model';
import {TranslocoDirective, TranslocoPipe, TranslocoService} from '@jsverse/transloco';

export interface BulkEditResult {
  fields: Partial<BookMetadata>;
  enabledFields: Set<BulkEditFieldName>;
  mergeArrays: boolean;
}

export interface BookdropBulkEditDialogData {
  fileCount: number;
}

export type BulkEditFieldName = 'seriesName' | 'seriesTotal' | 'authors' | 'publisher' | 'language' | 'categories' | 'moods' | 'tags';
type BulkEditArrayFieldName = 'authors' | 'categories' | 'moods' | 'tags';

interface BulkEditField<T extends BulkEditFieldName = BulkEditFieldName> {
  name: T;
  label: string;
  type: 'text' | 'chips' | 'number';
  controlName: T;
}

@Component({
  selector: 'app-bookdrop-bulk-edit-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    FormsModule,
    Button,
    Checkbox,
    InputText,
    AutoComplete,
    Divider,
    SelectButton,
    TranslocoDirective,
    TranslocoPipe,
  ],
  templateUrl: './bookdrop-bulk-edit-dialog.component.html',
  styleUrl: './bookdrop-bulk-edit-dialog.component.scss'
})
export class BookdropBulkEditDialogComponent implements OnInit {

  private readonly dialogRef = inject(DynamicDialogRef);
  private readonly config = inject<DynamicDialogConfig<BookdropBulkEditDialogData>>(DynamicDialogConfig);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly t = inject(TranslocoService);

  fileCount: number = 0;
  mergeArrays = true;

  enabledFields = new Set<BulkEditFieldName>();

  bulkEditForm = new FormGroup({
    seriesName: new FormControl('', {nonNullable: true}),
    seriesTotal: new FormControl<number | null>(null),
    authors: new FormControl<string[]>([], {nonNullable: true}),
    publisher: new FormControl('', {nonNullable: true}),
    language: new FormControl('', {nonNullable: true}),
    categories: new FormControl<string[]>([], {nonNullable: true}),
    moods: new FormControl<string[]>([], {nonNullable: true}),
    tags: new FormControl<string[]>([], {nonNullable: true}),
  });

  textFields: BulkEditField[] = [
    {name: 'seriesName', label: this.t.translate('bookdrop.bulkEdit.seriesName'), type: 'text', controlName: 'seriesName'},
    {name: 'publisher', label: this.t.translate('bookdrop.bulkEdit.publisher'), type: 'text', controlName: 'publisher'},
    {name: 'language', label: this.t.translate('bookdrop.bulkEdit.language'), type: 'text', controlName: 'language'},
  ];

  numberFields: BulkEditField[] = [
    {name: 'seriesTotal', label: this.t.translate('bookdrop.bulkEdit.seriesTotal'), type: 'number', controlName: 'seriesTotal'},
  ];

  chipFields: BulkEditField<BulkEditArrayFieldName>[] = [
    {name: 'authors', label: this.t.translate('bookdrop.bulkEdit.authors'), type: 'chips', controlName: 'authors'},
    {name: 'categories', label: this.t.translate('bookdrop.bulkEdit.genres'), type: 'chips', controlName: 'categories'},
    {name: 'moods', label: this.t.translate('bookdrop.bulkEdit.moods'), type: 'chips', controlName: 'moods'},
    {name: 'tags', label: this.t.translate('bookdrop.bulkEdit.tags'), type: 'chips', controlName: 'tags'},
  ];

  mergeOptions = [
    {label: this.t.translate('bookdrop.bulkEdit.mergeOption'), value: true},
    {label: this.t.translate('bookdrop.bulkEdit.replaceOption'), value: false},
  ];

  ngOnInit(): void {
    this.fileCount = this.config.data?.fileCount ?? 0;
    this.setupFormValueChangeListeners();
  }

  private setupFormValueChangeListeners(): void {
    const enableWhenPopulated = (fieldName: BulkEditFieldName, value: unknown): void => {
      const hasValue = Array.isArray(value) ? value.length > 0 : value !== null && value !== '' && value !== undefined;
      if (hasValue && !this.enabledFields.has(fieldName)) {
        this.enabledFields.add(fieldName);
        this.cdr.detectChanges();
      }
    };

    const fields: readonly [BulkEditFieldName, Observable<unknown>][] = [
      ['seriesName', this.bulkEditForm.controls.seriesName.valueChanges],
      ['publisher', this.bulkEditForm.controls.publisher.valueChanges],
      ['language', this.bulkEditForm.controls.language.valueChanges],
      ['authors', this.bulkEditForm.controls.authors.valueChanges],
      ['categories', this.bulkEditForm.controls.categories.valueChanges],
      ['moods', this.bulkEditForm.controls.moods.valueChanges],
      ['tags', this.bulkEditForm.controls.tags.valueChanges],
      ['seriesTotal', this.bulkEditForm.controls.seriesTotal.valueChanges],
    ];

    for (const [fieldName, valueChanges] of fields) {
      valueChanges.subscribe(value => enableWhenPopulated(fieldName, value));
    }
  }

  onAutoCompleteBlur(fieldName: BulkEditArrayFieldName, event: Event): void {
    if (!(event.target instanceof HTMLInputElement)) {
      return;
    }

    const target = event.target;
    const inputValue = target.value.trim();
    const control = this.bulkEditForm.controls[fieldName];
    if (inputValue) {
      const currentValue = control.value;
      if (!currentValue.includes(inputValue)) {
        control.setValue([...currentValue, inputValue]);
      }
      target.value = '';
    }

    if (!this.enabledFields.has(fieldName)) {
      if (control.value.length > 0) {
        this.enabledFields.add(fieldName);
        this.cdr.detectChanges();
      }
    }
  }

  toggleField(fieldName: BulkEditFieldName): void {
    if (this.enabledFields.has(fieldName)) {
      this.enabledFields.delete(fieldName);
    } else {
      this.enabledFields.add(fieldName);
    }
  }

  isFieldEnabled(fieldName: BulkEditFieldName): boolean {
    return this.enabledFields.has(fieldName);
  }

  getControl<T extends BulkEditFieldName>(controlName: T): typeof this.bulkEditForm.controls[T] {
    return this.bulkEditForm.controls[controlName];
  }

  get hasEnabledFields(): boolean {
    return this.enabledFields.size > 0;
  }

  cancel(): void {
    this.dialogRef.close(null);
  }

  apply(): void {
    const values = this.bulkEditForm.getRawValue();
    const fields: Partial<BookMetadata> = {
      ...(this.enabledFields.has('seriesName') ? {seriesName: values.seriesName} : {}),
      ...(this.enabledFields.has('seriesTotal') && values.seriesTotal !== null ? {seriesTotal: values.seriesTotal} : {}),
      ...(this.enabledFields.has('authors') ? {authors: values.authors} : {}),
      ...(this.enabledFields.has('publisher') ? {publisher: values.publisher} : {}),
      ...(this.enabledFields.has('language') ? {language: values.language} : {}),
      ...(this.enabledFields.has('categories') ? {categories: values.categories} : {}),
      ...(this.enabledFields.has('moods') ? {moods: values.moods} : {}),
      ...(this.enabledFields.has('tags') ? {tags: values.tags} : {}),
    };

    const result: BulkEditResult = {
      fields,
      enabledFields: new Set(this.enabledFields),
      mergeArrays: this.mergeArrays,
    };

    this.dialogRef.close(result);
  }
}
