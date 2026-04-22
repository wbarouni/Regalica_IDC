import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { NgClass } from '@angular/common';
import { ToastService, Toast } from './toast.service';
import { ButtonComponent } from '../button/button.component';

@Component({
  selector: 'rg-toast-container',
  standalone: true,
  imports: [NgClass, ButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toast-container">
      @for (toast of toastSvc.toasts(); track toast.id) {
        <div class="toast animate-slide-in" [ngClass]="'toast-' + toast.type">
          <span class="toast-icon">{{ icons[toast.type] }}</span>
          <p class="toast-msg">{{ toast.message }}</p>
          <button class="toast-close" (click)="toastSvc.dismiss(toast.id)">×</button>
        </div>
      }
    </div>
  `,
  styles: [`
    .toast-container {
      position: fixed; bottom: 24px; right: 24px; z-index: 9999;
      display: flex; flex-direction: column; gap: 8px; max-width: 360px;
    }
    .toast {
      display: flex; align-items: center; gap: 10px;
      padding: 12px 16px; border-radius: 14px; font-size: 13px; font-weight: 500;
      background: rgba(255,255,255,0.96);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      box-shadow: 0 8px 24px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.06);
    }
    .toast-success { border-left: 3px solid #34C759; }
    .toast-error   { border-left: 3px solid #FF3B30; }
    .toast-warning { border-left: 3px solid #FF9500; }
    .toast-info    { border-left: 3px solid #1D1D1F; }
    .toast-msg { flex: 1; color: #1D1D1F; line-height: 1.4; }
    .toast-icon { font-size: 16px; }
    .toast-close {
      background: none; border: none; cursor: pointer;
      font-size: 18px; color: #86868B; line-height: 1;
      padding: 0 2px; transition: color 120ms;
    }
    .toast-close:hover { color: #1D1D1F; }
  `],
})
export class ToastContainerComponent {
  protected readonly toastSvc = inject(ToastService);
  protected readonly icons: Record<string, string> = {
    success: '✓', error: '✕', warning: '⚠', info: 'ℹ'
  };
}
