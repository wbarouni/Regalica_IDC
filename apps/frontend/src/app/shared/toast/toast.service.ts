import { Injectable, signal } from '@angular/core';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly toasts = signal<Toast[]>([]);

  show(message: string, type: ToastType = 'info', duration = 4000): void {
    const id = crypto.randomUUID();
    this.toasts.update(t => [...t, { id, type, message, duration }]);
    if (duration > 0) setTimeout(() => this.dismiss(id), duration);
  }

  dismiss(id: string): void {
    this.toasts.update(t => t.filter(toast => toast.id !== id));
  }

  success(msg: string): void { this.show(msg, 'success'); }
  error(msg: string): void   { this.show(msg, 'error', 6000); }
  warning(msg: string): void { this.show(msg, 'warning'); }
  info(msg: string): void    { this.show(msg, 'info'); }
}
