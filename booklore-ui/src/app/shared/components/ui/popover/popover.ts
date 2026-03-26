import { Component, ElementRef, HostListener, input, signal } from '@angular/core';

@Component({
  selector: 'app-popover',
  standalone: true,
  template: `
    <div class="popover-anchor">
      <ng-content select="[popoverTrigger]" />
      @if (open()) {
        <div
          class="popover-panel"
          [class.popover-align-start]="align() === 'start'"
          [class.popover-align-end]="align() === 'end'"
        >
          <ng-content />
        </div>
      }
    </div>
  `,
  styles: [`
    .popover-anchor {
      position: relative;
      display: inline-flex;
    }

    .popover-panel {
      position: absolute;
      top: calc(100% + 6px);
      z-index: 20;
      background: var(--color-surface-raised);
      border: 1px solid var(--color-edge);
      border-radius: 6px;
      box-shadow: var(--shadow-paper-lifted);
      padding: 0.75rem;
      animation: popover-in 0.15s ease;
    }

    .popover-align-start {
      left: 0;
    }
    .popover-align-end {
      right: 0;
    }

    @keyframes popover-in {
      from {
        opacity: 0;
        transform: translateY(-4px) scale(0.97);
      }
      to {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
    }
  `],
})
export class PopoverComponent {
  align = input<'start' | 'end'>('end');
  open = signal(false);

  private el = new ElementRef(null as any);

  constructor(el: ElementRef) {
    this.el = el;
  }

  toggle() {
    this.open.set(!this.open());
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    if (!this.open()) return;
    if (!this.el.nativeElement.contains(event.target as Node)) {
      this.open.set(false);
    }
  }
}
