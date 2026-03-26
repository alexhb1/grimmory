import {Component, inject, OnDestroy, OnInit} from '@angular/core';
import {CoverPlaceholderComponent} from '../../../../shared/components/cover-generator/cover-generator.component';
import {FormsModule} from '@angular/forms';
import {Subject, takeUntil} from 'rxjs';
import {BookFileService} from '../../service/book-file.service';
import {BookService} from '../../service/book.service';
import {Book, DuplicateDetectionRequest, DuplicateGroup} from '../../model/book.model';
import {ConfirmationService, MessageService} from 'primeng/api';
import {TranslocoDirective, TranslocoPipe, TranslocoService} from '@jsverse/transloco';
import {ConfirmService} from '../../../../shared/components/ui/confirm-modal/confirm.service';
import {UrlHelperService} from '../../../../shared/service/url-helper.service';
import {AppSettingsService} from '../../../../shared/service/app-settings.service';
import {ModalRef} from '../../../../shared/components/ui/modal/modal.service';
import {MODAL_DATA} from '../../../../shared/components/ui/modal/modal-host';
import {ButtonComponent} from '../../../../shared/components/ui/button/button';
import {CheckboxComponent} from '../../../../shared/components/ui/checkbox/checkbox';
import {SelectButtonComponent} from '../../../../shared/components/ui/select-button/select-button';
import {TagComponent} from '../../../../shared/components/ui/tag/tag';
import {RadioComponent} from '../../../../shared/components/ui/radio/radio';
import {Paginator} from 'primeng/paginator';

type PresetMode = 'strict' | 'balanced' | 'aggressive' | 'custom';

interface DisplayGroup extends DuplicateGroup {
  selectedTargetBookId: number;
  dismissed: boolean;
  selectedForDeletion: Set<number>;
}

@Component({
  selector: 'app-duplicate-merger',
  standalone: true,
  imports: [
    FormsModule,
    ButtonComponent,
    CheckboxComponent,
    SelectButtonComponent,
    TagComponent,
    RadioComponent,
    Paginator,
    TranslocoDirective,
    TranslocoPipe,
    CoverPlaceholderComponent,
  ],
  templateUrl: './duplicate-merger.component.html',
  host: {class: 'flex flex-col flex-1 min-h-0'},
})
export class DuplicateMergerComponent implements OnInit, OnDestroy {
  libraryId!: number;
  presetMode: PresetMode = 'balanced';
  showAdvanced = false;

  matchByIsbn = true;
  matchByExternalId = true;
  matchByTitleAuthor = true;
  matchByDirectory = false;
  matchByFilename = false;

  isScanning = false;
  isMerging = false;
  hasScanned = false;
  moveFiles = false;
  mergeProgress = 0;
  mergeTotal = 0;

  groups: DisplayGroup[] = [];
  presetOptions: { label: string; value: string }[] = [];

  pageFirst = 0;
  pageSize = 20;

  private destroy$ = new Subject<void>();
  private readonly bookFileService = inject(BookFileService);
  private readonly bookService = inject(BookService);
  private readonly messageService = inject(MessageService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly confirmService = inject(ConfirmService);
  readonly modalRef = inject(ModalRef);
  private data = inject(MODAL_DATA) as {libraryId?: number} | null;
  private readonly t = inject(TranslocoService);
  readonly urlHelper = inject(UrlHelperService);
  private readonly appSettingsService = inject(AppSettingsService);

  ngOnInit(): void {
    this.libraryId = this.data?.libraryId!;

    const settings = this.appSettingsService.appSettings();
    if (settings) {
      this.moveFiles = settings.metadataPersistenceSettings?.moveFilesToLibraryPattern ?? false;
    }

    this.presetOptions = [
      {label: this.t.translate('book.duplicateMerger.presetStrict'), value: 'strict'},
      {label: this.t.translate('book.duplicateMerger.presetBalanced'), value: 'balanced'},
      {label: this.t.translate('book.duplicateMerger.presetAggressive'), value: 'aggressive'},
      {label: this.t.translate('book.duplicateMerger.presetCustom'), value: 'custom'},
    ];
    this.applyPreset('balanced');
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onPresetChange(value: string): void {
    this.presetMode = value as PresetMode;
    if (this.presetMode !== 'custom') {
      this.applyPreset(this.presetMode);
    }
  }

  onSignalToggle(): void {
    this.presetMode = 'custom';
  }

  applyPreset(mode: PresetMode): void {
    switch (mode) {
      case 'strict':
        this.matchByIsbn = true;
        this.matchByExternalId = true;
        this.matchByTitleAuthor = false;
        this.matchByDirectory = false;
        this.matchByFilename = false;
        break;
      case 'balanced':
        this.matchByIsbn = true;
        this.matchByExternalId = true;
        this.matchByTitleAuthor = true;
        this.matchByDirectory = false;
        this.matchByFilename = false;
        break;
      case 'aggressive':
        this.matchByIsbn = true;
        this.matchByExternalId = true;
        this.matchByTitleAuthor = true;
        this.matchByDirectory = true;
        this.matchByFilename = true;
        break;
    }
  }

  scan(): void {
    this.isScanning = true;
    this.hasScanned = false;
    this.groups = [];
    this.pageFirst = 0;

    const request: DuplicateDetectionRequest = {
      libraryId: this.libraryId,
      matchByIsbn: this.matchByIsbn,
      matchByExternalId: this.matchByExternalId,
      matchByTitleAuthor: this.matchByTitleAuthor,
      matchByDirectory: this.matchByDirectory,
      matchByFilename: this.matchByFilename,
    };

    this.bookFileService.findDuplicates(request).pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: (groups) => {
        this.groups = groups.map(g => ({
          ...g,
          selectedTargetBookId: g.suggestedTargetBookId,
          dismissed: false,
          selectedForDeletion: new Set<number>(),
        }));
        this.isScanning = false;
        this.hasScanned = true;
      },
      error: (err) => {
        this.isScanning = false;
        this.hasScanned = true;
        this.messageService.add({
          severity: 'error',
          summary: this.t.translate('book.duplicateMerger.toast.scanFailedSummary'),
          detail: err?.error?.message || this.t.translate('book.duplicateMerger.toast.scanFailedDetail'),
        });
      }
    });
  }

  get activeGroups(): DisplayGroup[] {
    return this.groups.filter(g => !g.dismissed);
  }

  get pagedGroups(): DisplayGroup[] {
    return this.activeGroups.slice(this.pageFirst, this.pageFirst + this.pageSize);
  }

  get canScan(): boolean {
    return !this.isScanning && !this.isMerging &&
      (this.matchByIsbn || this.matchByExternalId || this.matchByTitleAuthor ||
        this.matchByDirectory || this.matchByFilename);
  }

  onPageChange(event: any): void {
    this.pageFirst = event.first;
    this.pageSize = event.rows;
  }

  getBookFormats(book: Book): string[] {
    const formats: string[] = [];
    if (book.primaryFile?.bookType) {
      formats.push(book.primaryFile.bookType);
    }
    if (book.alternativeFormats) {
      for (const alt of book.alternativeFormats) {
        if (alt.bookType) {
          formats.push(alt.bookType);
        }
      }
    }
    return formats;
  }

  getFileCount(book: Book): number {
    let count = book.primaryFile ? 1 : 0;
    count += book.alternativeFormats?.length ?? 0;
    return count;
  }

  getMatchReasonLabel(reason: string): string {
    return this.t.translate(`book.duplicateMerger.reason.${reason}`);
  }

  hasSameFormatConflict(group: DisplayGroup): boolean {
    const formats = new Set<string>();
    for (const book of group.books) {
      if (book.primaryFile?.bookType) {
        if (formats.has(book.primaryFile.bookType)) return true;
        formats.add(book.primaryFile.bookType);
      }
    }
    return false;
  }

  getBookFilePath(book: Book): string {
    const subPath = book.primaryFile?.fileSubPath;
    const fileName = book.primaryFile?.fileName || '';
    if (subPath) return `${subPath}/${fileName}`;
    return fileName;
  }

  formatFileSize(sizeKb?: number): string {
    if (!sizeKb) return '';
    if (sizeKb < 1024) return `${sizeKb} KB`;
    const sizeMb = sizeKb / 1024;
    if (sizeMb < 1024) return `${sizeMb.toFixed(1)} MB`;
    return `${(sizeMb / 1024).toFixed(2)} GB`;
  }

  getMatchReasonSeverity(reason: string): 'default' | 'info' | 'success' | 'warn' | 'danger' {
    switch (reason) {
      case 'ISBN':
      case 'EXTERNAL_ID':
        return 'success';
      case 'TITLE_AUTHOR':
        return 'info';
      case 'DIRECTORY':
        return 'warn';
      case 'FILENAME':
        return 'default';
      default:
        return 'info';
    }
  }

  onTargetChange(group: DisplayGroup, bookIdStr: string): void {
    group.selectedTargetBookId = Number(bookIdStr);
    group.selectedForDeletion.delete(group.selectedTargetBookId);
  }

  toggleDeleteSelection(group: DisplayGroup, bookId: number): void {
    if (group.selectedForDeletion.has(bookId)) {
      group.selectedForDeletion.delete(bookId);
    } else {
      group.selectedForDeletion.add(bookId);
    }
  }

  getDeleteSelectedCount(group: DisplayGroup): number {
    return group.selectedForDeletion.size;
  }

  dismissGroup(group: DisplayGroup): void {
    group.dismissed = true;
    if (this.pagedGroups.length === 0 && this.pageFirst > 0) {
      this.pageFirst = Math.max(0, this.pageFirst - this.pageSize);
    }
  }

  async mergeGroup(group: DisplayGroup): Promise<void> {
    const targetId = group.selectedTargetBookId;
    const sourceIds = group.books
      .filter(b => b.id !== targetId)
      .map(b => b.id);

    if (sourceIds.length === 0) return;

    group.dismissed = true;
    try {
      await this.bookFileService.attachBookFiles(targetId, sourceIds, this.moveFiles)
        .pipe(takeUntil(this.destroy$))
        .toPromise();
    } catch {
      group.dismissed = false;
      this.messageService.add({
        severity: 'error',
        summary: this.t.translate('book.duplicateMerger.toast.mergeFailedSummary'),
        detail: this.t.translate('book.duplicateMerger.toast.mergeFailedDetail'),
      });
    }
  }

  async mergeAll(): Promise<void> {
    const toMerge = this.activeGroups;
    if (toMerge.length === 0) return;

    this.isMerging = true;
    this.mergeTotal = toMerge.length;
    this.mergeProgress = 0;

    let successCount = 0;
    let failCount = 0;

    for (const group of toMerge) {
      const targetId = group.selectedTargetBookId;
      const sourceIds = group.books
        .filter(b => b.id !== targetId)
        .map(b => b.id);

      if (sourceIds.length === 0) {
        group.dismissed = true;
        this.mergeProgress++;
        continue;
      }

      try {
        await this.bookFileService.attachBookFiles(targetId, sourceIds, this.moveFiles)
          .pipe(takeUntil(this.destroy$))
          .toPromise();
        group.dismissed = true;
        successCount++;
      } catch {
        failCount++;
      }
      this.mergeProgress++;
    }

    this.isMerging = false;

    if (successCount > 0) {
      this.messageService.add({
        severity: 'success',
        summary: this.t.translate('book.duplicateMerger.toast.mergeSuccessSummary'),
        detail: this.t.translate('book.duplicateMerger.toast.mergeSuccessDetail', {count: successCount}),
      });
    }
    if (failCount > 0) {
      this.messageService.add({
        severity: 'error',
        summary: this.t.translate('book.duplicateMerger.toast.mergeFailedSummary'),
        detail: this.t.translate('book.duplicateMerger.toast.mergePartialDetail', {success: successCount, failed: failCount}),
      });
    }
  }

  deleteGroup(group: DisplayGroup): void {
    const idsToDelete = Array.from(group.selectedForDeletion);
    if (idsToDelete.length === 0) return;

    this.confirmService.open({
      title: this.t.translate('book.duplicateMerger.confirm.deleteHeader'),
      message: this.t.translate('book.duplicateMerger.confirm.deleteMessage', {count: idsToDelete.length}),
      confirmLabel: this.t.translate('common.yes'),
      confirmVariant: 'danger',
    }).subscribe(confirmed => {
      if (!confirmed) return;
      this.bookService.deleteBooks(new Set(idsToDelete)).pipe(
        takeUntil(this.destroy$)
      ).subscribe({
        next: () => {
          group.books = group.books.filter(b => !group.selectedForDeletion.has(b.id));
          group.selectedForDeletion.clear();
          if (group.books.length <= 1) {
            group.dismissed = true;
          }
        }
      });
    });
  }
}
