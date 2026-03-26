import { Component, ElementRef, input, output, signal, viewChild } from '@angular/core';

@Component({
  selector: 'app-file-drop',
  standalone: true,
  template: `
    <div
      class="fd-zone"
      [class.fd-active]="dragging()"
      [class.fd-disabled]="disabled()"
      (dragover)="onDragOver($event)"
      (dragleave)="onDragLeave($event)"
      (drop)="onDrop($event)"
      (click)="openPicker()"
    >
      <ng-content select="[dropzone-content]" />
      <div class="fd-default">
        <svg class="fd-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="17 8 12 3 7 8"/>
          <line x1="12" y1="3" x2="12" y2="15"/>
        </svg>
        <p class="fd-title">Drop files here or click to browse</p>
        @if (accept()) {
          <p class="fd-hint">{{ accept() }}</p>
        }
      </div>
    </div>
    <input
      #fileInput
      type="file"
      [accept]="accept()"
      [multiple]="multiple()"
      [disabled]="disabled()"
      (change)="onInputChange($event)"
      hidden
    />
  `,
  styles: [`
    :host { display: block; }
    .fd-zone {
      position: relative;
      border: 2px dashed var(--color-edge);
      border-radius: 6px;
      padding: 24px;
      cursor: pointer;
      transition: border-color 0.15s ease, background 0.15s ease;
      text-align: center;
    }
    .fd-zone:hover {
      border-color: var(--color-ink-muted);
    }
    .fd-active {
      border-color: var(--color-accent) !important;
      background: var(--color-accent-wash);
    }
    .fd-disabled {
      opacity: 0.5;
      pointer-events: none;
    }
    .fd-default {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
    }
    .fd-icon {
      width: 32px;
      height: 32px;
      color: var(--color-ink-muted);
    }
    .fd-active .fd-icon {
      color: var(--color-accent);
    }
    .fd-title {
      font-size: 14px;
      font-weight: 500;
      color: var(--color-ink-light);
      margin: 0;
    }
    .fd-hint {
      font-size: 12px;
      color: var(--color-ink-muted);
      margin: 0;
    }
  `],
})
export class FileDropComponent {
  accept = input('');
  multiple = input(true);
  disabled = input(false);

  filesSelected = output<File[]>();

  dragging = signal(false);

  private fileInput = viewChild<ElementRef<HTMLInputElement>>('fileInput');

  onDragOver(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (!this.disabled()) {
      this.dragging.set(true);
    }
  }

  onDragLeave(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.dragging.set(false);
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.dragging.set(false);
    if (this.disabled() || !event.dataTransfer?.files.length) return;

    const files = this.filterFiles(Array.from(event.dataTransfer.files));
    if (files.length) {
      this.filesSelected.emit(files);
    }
  }

  openPicker() {
    if (this.disabled()) return;
    this.fileInput()?.nativeElement.click();
  }

  onInputChange(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;
    const files = this.filterFiles(Array.from(input.files));
    if (files.length) {
      this.filesSelected.emit(files);
    }
    input.value = '';
  }

  private filterFiles(files: File[]): File[] {
    const acceptStr = this.accept();
    if (!acceptStr) return this.multiple() ? files : files.slice(0, 1);

    const extensions = acceptStr.split(',').map(e => e.trim().toLowerCase());
    const filtered = files.filter(f => {
      const ext = '.' + f.name.split('.').pop()?.toLowerCase();
      return extensions.includes(ext) || extensions.includes(f.type);
    });

    return this.multiple() ? filtered : filtered.slice(0, 1);
  }
}
