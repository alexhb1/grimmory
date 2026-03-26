import { Component, DestroyRef, effect, HostListener, inject, Injector, input, InjectionToken, ViewContainerRef, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ModalComponent } from './modal';
import { ModalService, ModalRef, ActiveModal } from './modal.service';

/** Injection token for data passed to a programmatic modal. */
export const MODAL_DATA = new InjectionToken<unknown>('MODAL_DATA');

/**
 * Renders a single modal entry. One instance per stack item.
 */
@Component({
  selector: 'app-modal-instance',
  standalone: true,
  imports: [ModalComponent],
  template: `
    <app-modal
      #modal
      [escEnabled]="false"
      [size]="entry().config.size ?? 'md'"
      [height]="entry().config.height ?? null"
      [dismissible]="entry().config.dismissible ?? true"
      (closed)="onAnimationDone()"
    >
      @if (entry().config.title) {
        <div class="shrink-0 flex items-center justify-between px-6 pt-5 pb-4">
          <h2 class="font-heading text-2xl font-bold text-ink tracking-tight">{{ entry().config.title }}</h2>
          <button type="button" (click)="closeAnimated()"
            class="flex items-center justify-center w-7 h-7 rounded-[4px] text-ink-muted hover:text-ink-light hover:bg-surface-hover transition-colors cursor-pointer">
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
            </svg>
          </button>
        </div>
      }
      <ng-container #outlet />
    </app-modal>
  `,
})
export class ModalInstanceComponent {
  entry = input.required<ActiveModal>();

  private injector = inject(Injector);
  private destroyRef = inject(DestroyRef);
  private outlet = viewChild('outlet', { read: ViewContainerRef });
  private modal = viewChild<ModalComponent>('modal');

  constructor() {
    effect(() => {
      const entry = this.entry();
      const outlet = this.outlet();
      const modal = this.modal();

      if (entry && outlet && modal) {
        outlet.clear();

        const componentInjector = Injector.create({
          providers: [
            { provide: ModalRef, useValue: entry.ref },
            { provide: MODAL_DATA, useValue: entry.config.data ?? null },
          ],
          parent: this.injector,
        });

        outlet.createComponent(entry.component, { injector: componentInjector });

        // Listen for close requests (ESC key from host)
        entry.ref.closeRequested.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
          this.closeAnimated();
        });

        setTimeout(() => modal.open(), 0);
      }
    });
  }

  /** Trigger the modal's animated close (fade + scale out). */
  closeAnimated() {
    this.modal()?.close();
  }

  /** Called after the close animation finishes — finalize removal from stack. */
  onAnimationDone() {
    this.entry().ref._finalizeClose();
  }
}

/**
 * Place once in the app root template. Renders programmatically-opened modals.
 *
 * Usage: `<app-modal-host />`
 */
@Component({
  selector: 'app-modal-host',
  standalone: true,
  imports: [ModalInstanceComponent],
  template: `
    @for (entry of stack(); track entry.ref) {
      <app-modal-instance [entry]="entry" />
    }
  `,
})
export class ModalHostComponent {
  private modalService = inject(ModalService);
  stack = this.modalService.stack;

  @HostListener('document:keydown.escape')
  onEscape() {
    const s = this.stack();
    if (s.length === 0) return;

    // Find the ModalInstanceComponent for the top entry and animate-close it.
    // Since we can't get a ref to the @for child directly, we trigger close
    // via the top modal's ref, but we need the animation. The simplest path:
    // have ModalRef support an animated close callback.
    const top = s[s.length - 1];
    top.ref.close();
  }
}
