import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'rg-base-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (isOpen) {
      <div class="rg-modal-backdrop" (click)="onBackdropClick($event)">
        <div class="rg-modal-panel animate-scale-in" role="dialog" [attr.aria-label]="title">
          @if (title) {
            <div class="rg-modal-header">
              <h2 class="rg-modal-title">{{ title }}</h2>
              <button class="rg-modal-close" (click)="closed.emit()" aria-label="Fermer">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
          }
          <div class="rg-modal-body">
            <ng-content />
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .rg-modal-backdrop {
      position: fixed; inset: 0; z-index: 900;
      background: rgba(0,0,0,0.25);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      display: flex; align-items: center; justify-content: center;
      padding: 24px;
    }
    .rg-modal-panel {
      background: rgba(255,255,255,0.96);
      backdrop-filter: blur(40px) saturate(220%);
      -webkit-backdrop-filter: blur(40px) saturate(220%);
      border: 1px solid rgba(255,255,255,0.98);
      box-shadow: 0 32px 64px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.06);
      border-radius: 24px;
      width: 100%; max-width: 560px;
      max-height: 80vh; overflow-y: auto;
    }
    .rg-modal-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 20px 24px 16px;
      border-bottom: 1px solid rgba(0,0,0,0.06);
    }
    .rg-modal-title { font-size: 16px; font-weight: 700; color: #1D1D1F; margin: 0; letter-spacing: -0.02em; }
    .rg-modal-close {
      width: 28px; height: 28px; border-radius: 8px;
      background: rgba(0,0,0,0.05); border: none; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      color: #86868B; transition: all 120ms;
    }
    .rg-modal-close:hover { background: rgba(0,0,0,0.10); color: #1D1D1F; }
    .rg-modal-body { padding: 20px 24px 24px; }
  `],
})
export class BaseModalComponent {
  @Input() isOpen = false;
  @Input() title = '';
  @Output() closed = new EventEmitter<void>();

  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.closed.emit();
  }
}
