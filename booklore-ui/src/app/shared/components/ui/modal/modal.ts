import { Component, input, model, output, signal } from '@angular/core';

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl';

@Component({
  selector: 'app-modal',
  standalone: true,
  host: {
    '(document:keydown.escape)': 'onEscape()',
  },
  template: `
    @if (visible()) {
      <div
        class="fixed inset-0 z-[100] bg-black/60"
        [class]="closing() ? 'animate-[fadeOut_0.15s_ease_forwards]' : 'animate-[fadeIn_0.15s_ease]'"
        (click)="dismissible() && close()"
      ></div>
      <div class="fixed inset-0 z-[101] flex items-center justify-center pointer-events-none p-4">
        <div
          class="bg-surface rounded-[6px] w-full pointer-events-auto flex flex-col shadow-[0_16px_48px_rgba(0,0,0,0.5),0_0_0_1px_rgba(255,255,255,0.04)]"
          [class]="(closing() ? 'animate-[modalOut_0.15s_ease_forwards]' : 'animate-[modalIn_0.15s_ease]') + ' ' + sizeClass()"
          [style.height]="height()"
        >
          <!-- Header (optional) -->
          <ng-content select="[modal-header]" />
          <!-- Body -->
          <div class="flex-1 min-h-0 flex flex-col">
            <ng-content />
          </div>
          <!-- Footer (optional) -->
          <ng-content select="[modal-footer]" />
        </div>
      </div>
    }
  `,
})
export class ModalComponent {
  visible = model(false);
  size = input<ModalSize>('md');
  height = input<string | null>(null);
  dismissible = input(true);
  /** Set to false for programmatic modals where the host manages ESC. */
  escEnabled = input(true);
  closed = output<void>();

  closing = signal(false);

  private sizeClasses: Record<ModalSize, string> = {
    sm: 'max-w-lg',
    md: 'max-w-2xl',
    lg: 'max-w-4xl',
    xl: 'max-w-6xl',
  };

  sizeClass(): string {
    return this.sizeClasses[this.size()];
  }

  onEscape() {
    if (this.escEnabled() && this.visible() && !this.closing() && this.dismissible()) {
      this.close();
    }
  }

  open() {
    this.closing.set(false);
    this.visible.set(true);
  }

  close() {
    if (this.closing()) return;
    this.closing.set(true);
    setTimeout(() => {
      this.visible.set(false);
      this.closing.set(false);
      this.closed.emit();
    }, 150);
  }
}
