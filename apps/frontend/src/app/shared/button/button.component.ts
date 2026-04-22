import { ChangeDetectionStrategy, Component, Input, Output, EventEmitter } from '@angular/core';
import { NgClass } from '@angular/common';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive' | 'success' | 'icon';
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

@Component({
  selector: 'rg-button',
  standalone: true,
  imports: [NgClass],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      [type]="type"
      [disabled]="disabled || loading"
      [ngClass]="classes"
      (click)="clicked.emit($event)"
    >
      @if (loading) {
        <span class="rg-btn-spinner"></span>
      }
      <ng-content />
    </button>
  `,
  styles: [`
    :host { display: contents; }

    button {
      display: inline-flex; align-items: center; justify-content: center;
      gap: 6px; font-family: inherit; font-feature-settings: inherit;
      cursor: pointer; border: none; outline: none;
      transition: all 200ms cubic-bezier(0.4,0,0.2,1);
      position: relative; overflow: hidden; white-space: nowrap;
      -webkit-font-smoothing: antialiased;
    }
    button:disabled { opacity: 0.4; cursor: not-allowed; pointer-events: none; }

    /* Sizes */
    .rg-btn-xs  { padding: 4px 10px;  font-size: 11px; font-weight: 600; border-radius: 8px;  }
    .rg-btn-sm  { padding: 6px 14px;  font-size: 12px; font-weight: 600; border-radius: 10px; }
    .rg-btn-md  { padding: 8px 18px;  font-size: 13px; font-weight: 600; border-radius: 12px; }
    .rg-btn-lg  { padding: 10px 22px; font-size: 14px; font-weight: 600; border-radius: 14px; }
    .rg-btn-xl  { padding: 13px 28px; font-size: 15px; font-weight: 700; border-radius: 16px; }

    /* Variants */
    .rg-btn-primary {
      background: #1D1D1F;
      color: #FFFFFF;
      box-shadow: 0 2px 8px rgba(0,0,0,0.18);
    }
    .rg-btn-primary:hover:not(:disabled) {
      background: #000000;
      transform: translateY(-1px);
      box-shadow: 0 4px 14px rgba(0,0,0,0.28);
    }
    .rg-btn-primary:active:not(:disabled) { transform: translateY(0); }

    .rg-btn-secondary {
      background: rgba(0,0,0,0.05);
      color: #1D1D1F;
      border: 1px solid rgba(0,0,0,0.10);
    }
    .rg-btn-secondary:hover:not(:disabled) { background: rgba(0,0,0,0.08); }

    .rg-btn-ghost {
      background: transparent;
      color: #86868B;
    }
    .rg-btn-ghost:hover:not(:disabled) { background: #EBEBED; color: #1D1D1F; }

    .rg-btn-destructive {
      background: linear-gradient(135deg, #FF3B30, #D63126);
      color: #FFFFFF;
      box-shadow: 0 2px 12px rgba(255,59,48,0.25);
    }
    .rg-btn-destructive:hover:not(:disabled) { opacity: 0.9; transform: translateY(-1px); }

    .rg-btn-success {
      background: linear-gradient(135deg, #34C759, #28A046);
      color: #FFFFFF;
      box-shadow: 0 2px 12px rgba(52,199,89,0.25);
    }
    .rg-btn-success:hover:not(:disabled) { opacity: 0.9; transform: translateY(-1px); }

    .rg-btn-icon {
      background: transparent;
      color: #86868B;
      padding: 0;
      border-radius: 10px;
    }
    .rg-btn-icon.rg-btn-xs  { width: 28px; height: 28px; border-radius: 8px; }
    .rg-btn-icon.rg-btn-sm  { width: 32px; height: 32px; border-radius: 10px; }
    .rg-btn-icon.rg-btn-md  { width: 36px; height: 36px; border-radius: 10px; }
    .rg-btn-icon.rg-btn-lg  { width: 42px; height: 42px; border-radius: 12px; }
    .rg-btn-icon.rg-btn-xl  { width: 48px; height: 48px; border-radius: 14px; }
    .rg-btn-icon:hover:not(:disabled) { background: #EBEBED; color: #1D1D1F; }

    /* Spinner */
    .rg-btn-spinner {
      display: inline-block;
      width: 14px; height: 14px;
      border: 2px solid rgba(255,255,255,0.35);
      border-top-color: currentColor;
      border-radius: 50%;
      animation: btnSpin 0.7s linear infinite;
    }
    @keyframes btnSpin { to { transform: rotate(360deg); } }
  `],
})
export class ButtonComponent {
  @Input() variant: ButtonVariant = 'primary';
  @Input() size: ButtonSize = 'md';
  @Input() type: 'button' | 'submit' | 'reset' = 'button';
  @Input() disabled = false;
  @Input() loading = false;
  @Output() clicked = new EventEmitter<MouseEvent>();

  get classes(): Record<string, boolean> {
    return {
      [`rg-btn-${this.variant}`]: true,
      [`rg-btn-${this.size}`]: true,
    };
  }
}
