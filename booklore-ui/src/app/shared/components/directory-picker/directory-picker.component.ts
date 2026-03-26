import {Component, inject, OnInit} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {TranslocoDirective, TranslocoPipe} from '@jsverse/transloco';
import {UtilityService} from './utility.service';
import {ModalRef} from '../ui/modal/modal.service';
import {InputDirective} from '../ui/input/input';
import {ButtonComponent} from '../ui/button/button';
import {CheckboxComponent} from '../ui/checkbox/checkbox';

@Component({
  selector: 'app-directory-picker-v2',
  standalone: true,
  templateUrl: './directory-picker.component.html',
  imports: [FormsModule, InputDirective, ButtonComponent, CheckboxComponent, TranslocoDirective, TranslocoPipe],
  host: {class: 'flex flex-col flex-1 min-h-0'},
})
export class DirectoryPickerComponent implements OnInit {
  paths: string[] = [];
  filteredPaths: string[] = [];
  selectedProductName = '';
  selectedFolders: string[] = [];
  searchQuery = '';
  isLoading = false;

  private utilityService = inject(UtilityService);
  readonly modalRef = inject(ModalRef);

  ngOnInit() {
    this.getFolders('/');
  }

  getFolders(path: string): void {
    this.isLoading = true;
    this.filteredPaths = [];
    this.utilityService.getFolders(path).subscribe({
      next: (folders: string[]) => {
        this.paths = folders;
        this.filteredPaths = folders;
        this.isLoading = false;
        this.selectedProductName = path;
      },
      error: (error) => {
        console.error('Error fetching folders:', error);
        this.isLoading = false;
      }
    });
  }

  onRowClick(path: string): void {
    this.getFolders(path);
    this.searchQuery = '';
  }

  goUp(): void {
    if (!this.selectedProductName || this.selectedProductName === '/') return;
    const parent = this.selectedProductName.substring(0, this.selectedProductName.lastIndexOf('/')) || '/';
    this.getFolders(parent);
    this.searchQuery = '';
  }

  onSearch(): void {
    if (!this.searchQuery.trim()) {
      this.filteredPaths = this.paths;
      return;
    }
    const query = this.searchQuery.toLowerCase();
    this.filteredPaths = this.paths.filter(path => path.toLowerCase().includes(query));
  }

  onCheckboxChange(path: string, checked: boolean): void {
    if (checked && !this.selectedFolders.includes(path)) {
      this.selectedFolders.push(path);
    } else if (!checked) {
      this.selectedFolders = this.selectedFolders.filter(f => f !== path);
    }
  }

  isFolderSelected(path: string): boolean {
    return this.selectedFolders.includes(path);
  }

  get allVisibleSelected(): boolean {
    return this.filteredPaths.length > 0 && this.filteredPaths.every(f => this.selectedFolders.includes(f));
  }

  toggleSelectAll(checked: boolean): void {
    if (checked) {
      this.filteredPaths.forEach(folder => {
        if (!this.selectedFolders.includes(folder)) {
          this.selectedFolders.push(folder);
        }
      });
    } else {
      const visible = new Set(this.filteredPaths);
      this.selectedFolders = this.selectedFolders.filter(f => !visible.has(f));
    }
  }

  selectCurrent(): void {
    const currentPath = this.selectedProductName || '/';
    if (!this.selectedFolders.includes(currentPath)) {
      this.selectedFolders.push(currentPath);
    }
  }

  getFolderName(path: string): string {
    return path.split('/').filter(p => p).pop() || path;
  }

  onSelect(): void {
    this.modalRef.close(this.selectedFolders);
  }

  onCancel(): void {
    this.modalRef.close(null);
  }
}
