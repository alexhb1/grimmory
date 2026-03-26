import { Component, inject } from '@angular/core';
import { ToastService } from './toast.service';

@Component({
  selector: 'app-toast-host',
  standalone: true,
  template: `
    <div class="fixed top-4 right-4 z-[200] flex flex-col gap-2 pointer-events-none">
      @for (toast of toastService.toasts(); track toast.id) {
        <div
          class="toast pointer-events-auto"
          [class.toast-removing]="toast.removing"
          [class]="'toast-' + toast.severity"
        >
          <div class="toast-icon">
            @switch (toast.severity) {
              @case ('success') {
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6 9 17l-5-5"/></svg>
              }
              @case ('error') {
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>
              }
              @case ('warn') {
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
              }
              @case ('info') {
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
              }
            }
          </div>
          <div class="toast-content">
            <div class="toast-summary">{{ toast.summary }}</div>
            @if (toast.detail) {
              <div class="toast-detail">{{ toast.detail }}</div>
            }
          </div>
          <button class="toast-close" (click)="toastService.remove(toast.id)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </button>
        </div>
      }
    </div>
  `,
  styles: [`
    .toast {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      min-width: 300px;
      max-width: 420px;
      padding: 12px 14px;
      border-radius: 6px;
      box-shadow: var(--shadow-paper-lifted);
      animation: toastIn 0.2s ease;
    }
    .toast-success { background: #166534; }
    .toast-error { background: #991b1b; }
    .toast-warn { background: #92400e; }
    .toast-info { background: #1e40af; }
    .toast-removing {
      animation: toastOut 0.2s ease forwards;
    }
    .toast-icon {
      flex-shrink: 0;
      width: 18px;
      height: 18px;
      margin-top: 1px;
    }
    .toast-icon svg {
      width: 100%;
      height: 100%;
    }
    .toast-icon { color: white; }

    .toast-content {
      flex: 1;
      min-width: 0;
    }
    .toast-summary {
      font-size: 13px;
      font-weight: 500;
      color: white;
    }
    .toast-detail {
      font-size: 12px;
      color: rgba(255, 255, 255, 0.75);
      margin-top: 2px;
    }
    .toast-close {
      flex-shrink: 0;
      width: 16px;
      height: 16px;
      margin-top: 1px;
      border: none;
      background: none;
      color: rgba(255, 255, 255, 0.5);
      cursor: pointer;
      padding: 0;
      transition: color 0.1s ease;
    }
    .toast-close:hover {
      color: white;
    }
    .toast-close svg {
      width: 100%;
      height: 100%;
    }

    @keyframes toastIn {
      from { opacity: 0; transform: translateX(20px); }
      to { opacity: 1; transform: translateX(0); }
    }
    @keyframes toastOut {
      from { opacity: 1; transform: translateX(0); }
      to { opacity: 0; transform: translateX(20px); }
    }
  `],
})
export class ToastHostComponent {
  toastService = inject(ToastService);
}
