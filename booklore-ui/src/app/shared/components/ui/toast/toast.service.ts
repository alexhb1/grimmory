import { Injectable, signal } from '@angular/core';

export type ToastSeverity = 'success' | 'error' | 'warn' | 'info';

export interface Toast {
  id: number;
  severity: ToastSeverity;
  summary: string;
  detail?: string;
  removing?: boolean;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  toasts = signal<Toast[]>([]);

  private nextId = 0;

  add(severity: ToastSeverity, summary: string, detail?: string) {
    const id = this.nextId++;
    this.toasts.update(t => [...t, { id, severity, summary, detail }]);
    setTimeout(() => this.remove(id), 4000);
  }

  success(summary: string, detail?: string) { this.add('success', summary, detail); }
  error(summary: string, detail?: string) { this.add('error', summary, detail); }
  warn(summary: string, detail?: string) { this.add('warn', summary, detail); }
  info(summary: string, detail?: string) { this.add('info', summary, detail); }

  remove(id: number) {
    this.toasts.update(t => t.map(toast =>
      toast.id === id ? { ...toast, removing: true } : toast
    ));
    setTimeout(() => {
      this.toasts.update(t => t.filter(toast => toast.id !== id));
    }, 200);
  }
}
