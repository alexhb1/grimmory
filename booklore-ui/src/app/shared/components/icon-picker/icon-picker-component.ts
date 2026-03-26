import {Component, inject, OnInit} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {IconService} from '../../services/icon.service';
import {IconCacheService} from '../../services/icon-cache.service';
import {DomSanitizer, SafeHtml} from '@angular/platform-browser';
import DOMPurify from 'dompurify';
import {MessageService} from 'primeng/api';
import {IconCategoriesHelper} from '../../helpers/icon-categories.helper';
import {UserService} from '../../../features/settings/user-management/user.service';
import {ModalRef} from '../ui/modal/modal.service';
import {InputDirective} from '../ui/input/input';
import {ButtonComponent} from '../ui/button/button';
import {TabsComponent, TabListComponent, TabComponent, TabPanelComponent} from '../ui/tabs/tabs';

interface SvgEntry {
  name: string;
  content: string;
  preview: SafeHtml | null;
  error: string;
}

interface IconSaveResult {
  iconName: string;
  success: boolean;
  errorMessage: string;
}

interface SvgIconBatchResponse {
  totalRequested: number;
  successCount: number;
  failureCount: number;
  results: IconSaveResult[];
}

@Component({
  selector: 'app-icon-picker-component',
  imports: [FormsModule, InputDirective, ButtonComponent, TabsComponent, TabListComponent, TabComponent, TabPanelComponent],
  templateUrl: './icon-picker-component.html',
  host: {class: 'flex flex-col flex-1 min-h-0'},
})
export class IconPickerComponent implements OnInit {

  private readonly MAX_ICON_NAME_LENGTH = 255;
  private readonly MAX_SVG_SIZE = 1048576;
  private readonly ICON_NAME_PATTERN = /^[a-zA-Z0-9_-]+$/;
  private readonly ERROR_MESSAGES = {
    NO_CONTENT: 'Please paste SVG content',
    NO_NAME: 'Please provide a name for the icon',
    INVALID_NAME: 'Icon name can only contain alphanumeric characters and hyphens',
    NAME_TOO_LONG: `Icon name must not exceed ${this.MAX_ICON_NAME_LENGTH} characters`,
    INVALID_SVG: 'Invalid SVG content. Please paste valid SVG code.',
    MISSING_SVG_TAG: 'Content must include <svg> tag',
    SVG_TOO_LARGE: 'SVG content must not exceed 1MB',
    PARSE_ERROR: 'Failed to parse SVG content',
    LOAD_ICONS_ERROR: 'Failed to load SVG icons. Please try again.',
    DELETE_ERROR: 'Failed to delete icon. Please try again.'
  };

  readonly modalRef = inject(ModalRef);
  private iconService = inject(IconService);
  private iconCache = inject(IconCacheService);
  private sanitizer = inject(DomSanitizer);
  private messageService = inject(MessageService);
  private userService = inject(UserService);

  searchText = '';
  selectedIcon: string | null = null;
  icons: string[] = IconCategoriesHelper.createIconList();

  private _activeTabIndex = '0';

  get activeTabIndex(): string {
    return this._activeTabIndex;
  }

  set activeTabIndex(value: string) {
    this._activeTabIndex = value;
    if (value === '1' && this.svgIcons.length === 0) {
      this.loadSvgIconsFromCache();
    }
  }

  svgContent = '';
  svgName = '';
  svgPreview: SafeHtml | null = null;
  errorMessage = '';

  svgEntries: SvgEntry[] = [];
  isSavingBatch = false;
  batchErrorMessage = '';

  svgIcons: string[] = [];
  svgSearchText = '';
  isLoadingSvgIcons = false;
  svgIconsError = '';
  selectedSvgIcon: string | null = null;

  draggedSvgIcon: string | null = null;
  isTrashHover = false;

  get canManageIcons(): boolean {
    const user = this.userService.getCurrentUser();
    return user?.permissions.canManageIcons || user?.permissions.admin || false;
  }

  ngOnInit(): void {
    if (this.activeTabIndex === '1') {
      this.loadSvgIconsFromCache();
    }
  }

  filteredIcons(): string[] {
    if (!this.searchText) return this.icons;
    return this.icons.filter(icon => icon.toLowerCase().includes(this.searchText.toLowerCase()));
  }

  filteredSvgIcons(): string[] {
    if (!this.svgSearchText) return this.svgIcons;
    return this.svgIcons.filter(icon => icon.toLowerCase().includes(this.svgSearchText.toLowerCase()));
  }

  selectIcon(icon: string): void {
    this.selectedIcon = icon;
    this.modalRef.close({type: 'PRIME_NG', value: icon});
  }

  private loadSvgIconsFromCache(): void {
    this.svgIcons = this.iconCache.getAllIconNames();
  }

  getSvgContent(iconName: string): SafeHtml | null {
    return this.iconCache.getCachedSanitized(iconName) || null;
  }

  selectSvgIcon(iconName: string): void {
    this.selectedSvgIcon = iconName;
    this.modalRef.close({type: 'CUSTOM_SVG', value: iconName});
  }

  onSvgContentChange(): void {
    this.errorMessage = '';

    if (!this.svgContent.trim()) {
      this.svgPreview = null;
      return;
    }

    const trimmedContent = this.svgContent.trim();
    if (!trimmedContent.includes('<svg')) {
      this.svgPreview = null;
      this.errorMessage = this.ERROR_MESSAGES.MISSING_SVG_TAG;
      return;
    }

    try {
      const sanitized = DOMPurify.sanitize(this.svgContent, {
        USE_PROFILES: {svg: true},
        FORBID_TAGS: ['script', 'style', 'foreignObject']
      });
      this.svgPreview = this.sanitizer.bypassSecurityTrustHtml(sanitized);
    } catch {
      this.svgPreview = null;
      this.errorMessage = this.ERROR_MESSAGES.PARSE_ERROR;
    }
  }

  addSvgEntry(): void {
    const validationError = this.validateSvgInput();
    if (validationError) {
      this.errorMessage = validationError;
      return;
    }

    const existingIndex = this.svgEntries.findIndex(entry => entry.name === this.svgName);
    if (existingIndex !== -1) {
      this.svgEntries[existingIndex] = {name: this.svgName, content: this.svgContent, preview: this.svgPreview, error: ''};
    } else {
      this.svgEntries.push({name: this.svgName, content: this.svgContent, preview: this.svgPreview, error: ''});
    }

    this.resetSvgForm();
  }

  removeSvgEntry(index: number): void {
    this.svgEntries.splice(index, 1);
  }

  clearAllEntries(): void {
    this.svgEntries = [];
    this.batchErrorMessage = '';
  }

  saveAllSvgs(): void {
    if (this.svgEntries.length === 0) {
      this.batchErrorMessage = 'No SVG icons to save';
      return;
    }

    this.isSavingBatch = true;
    this.batchErrorMessage = '';
    this.svgEntries.forEach(entry => entry.error = '');

    const svgData = this.svgEntries.map(entry => ({svgName: entry.name, svgData: entry.content}));

    this.iconService.saveBatchSvgIcons(svgData).subscribe({
      next: (response: SvgIconBatchResponse) => {
        this.isSavingBatch = false;
        let successCount = 0;
        let failureCount = 0;

        response.results.forEach(result => {
          if (result.success) {
            successCount++;
          } else {
            failureCount++;
            const entry = this.svgEntries.find(e => e.name === result.iconName);
            if (entry) entry.error = result.errorMessage;
          }
        });

        if (successCount > 0 && failureCount === 0) {
          this.messageService.add({severity: 'success', summary: 'Icons Saved', detail: `${successCount} SVG icon${successCount > 1 ? 's' : ''} saved successfully.`, life: 2500});
        } else if (successCount > 0) {
          this.messageService.add({severity: 'warn', summary: 'Partial Success', detail: `${successCount} saved, ${failureCount} failed.`, life: 3500});
        } else if (failureCount > 0) {
          this.messageService.add({severity: 'error', summary: 'Save Failed', detail: `Failed to save ${failureCount} icon${failureCount > 1 ? 's' : ''}.`, life: 4000});
        }

        this.clearAllEntries();
        this.loadSvgIconsFromCache();
      },
      error: () => {
        this.isSavingBatch = false;
        this.batchErrorMessage = 'Failed to save SVG icons. Please try again.';
      }
    });
  }

  onSvgIconDragStart(iconName: string): void {
    this.draggedSvgIcon = iconName;
  }

  onSvgIconDragEnd(): void {
    this.draggedSvgIcon = null;
  }

  onTrashDragOver(event: DragEvent): void {
    event.preventDefault();
    this.isTrashHover = true;
  }

  onTrashDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.isTrashHover = false;
  }

  onTrashDrop(event: DragEvent): void {
    event.preventDefault();
    this.isTrashHover = false;
    if (this.draggedSvgIcon) {
      this.deleteSvgIcon(this.draggedSvgIcon);
      this.draggedSvgIcon = null;
    }
  }

  private deleteSvgIcon(iconName: string): void {
    this.isLoadingSvgIcons = true;
    this.iconService.deleteSvgIcon(iconName).subscribe({
      next: () => {
        this.messageService.add({severity: 'success', summary: 'Icon Deleted', detail: 'SVG icon deleted successfully.', life: 2500});
        this.svgIcons = this.svgIcons.filter(name => name !== iconName);
        this.isLoadingSvgIcons = false;
      },
      error: (error) => {
        this.isLoadingSvgIcons = false;
        this.messageService.add({severity: 'error', summary: 'Delete Failed', detail: error.error?.message || this.ERROR_MESSAGES.DELETE_ERROR, life: 4000});
      }
    });
  }

  private validateSvgInput(): string | null {
    if (!this.svgContent.trim()) return this.ERROR_MESSAGES.NO_CONTENT;
    if (!this.svgName.trim()) return this.ERROR_MESSAGES.NO_NAME;
    if (this.svgName.length > this.MAX_ICON_NAME_LENGTH) return this.ERROR_MESSAGES.NAME_TOO_LONG;
    if (!this.ICON_NAME_PATTERN.test(this.svgName)) return this.ERROR_MESSAGES.INVALID_NAME;
    const svgSize = new Blob([this.svgContent]).size;
    if (svgSize > this.MAX_SVG_SIZE) return this.ERROR_MESSAGES.SVG_TOO_LARGE;
    return null;
  }

  private resetSvgForm(): void {
    this.svgContent = '';
    this.svgName = '';
    this.svgPreview = null;
    this.errorMessage = '';
  }
}
