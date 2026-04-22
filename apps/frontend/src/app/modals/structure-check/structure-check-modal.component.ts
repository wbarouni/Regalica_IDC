import {
  ChangeDetectionStrategy, Component, EventEmitter, Input, Output, signal, computed,
} from '@angular/core';
import { NgClass } from '@angular/common';

export type CheckStatus = 'pending' | 'running' | 'pass' | 'fail';

export interface XsdStep {
  id: number;
  label: string;
  status: CheckStatus;
  detail?: string;
}

@Component({
  selector: 'rg-structure-check-modal',
  standalone: true,
  imports: [NgClass],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (isOpen) {
      <div class="backdrop" (click)="onBackdrop($event)">
        <div class="panel animate-scale-in" role="dialog" aria-label="Vérification de structure XSD">

          <div class="header">
            <div class="header-icon" [ngClass]="overallStatus()">
              @if (overallStatus() === 'pass') {
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#34C759" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>
              } @else if (overallStatus() === 'fail') {
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FF3B30" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              } @else {
                <div class="spinner-sm"></div>
              }
            </div>
            <div>
              <h2 class="title">Vérification XSD</h2>
              <p class="subtitle">{{ fileName }} · {{ passCount() }}/{{ steps().length }} étapes validées</p>
            </div>
            @if (overallStatus() !== 'running') {
              <button class="close-btn" (click)="closed.emit()">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            }
          </div>

          <div class="steps-list">
            @for (step of steps(); track step.id) {
              <div class="step-row" [ngClass]="'step-' + step.status">
                <div class="step-indicator">
                  @if (step.status === 'pass') {
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                  } @else if (step.status === 'fail') {
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  } @else if (step.status === 'running') {
                    <div class="mini-spinner"></div>
                  }
                </div>
                <div class="step-info">
                  <span class="step-label">{{ step.label }}</span>
                  @if (step.detail) {
                    <span class="step-detail">{{ step.detail }}</span>
                  }
                </div>
              </div>
            }
          </div>

        </div>
      </div>
    }
  `,
  styles: [`
    .backdrop { position:fixed; inset:0; z-index:900; background:rgba(0,0,0,0.25); backdrop-filter:blur(8px); -webkit-backdrop-filter:blur(8px); display:flex; align-items:center; justify-content:center; padding:24px; }
    .panel { background:rgba(255,255,255,0.97); backdrop-filter:blur(40px) saturate(220%); -webkit-backdrop-filter:blur(40px) saturate(220%); border:1px solid rgba(255,255,255,0.98); box-shadow:0 32px 64px rgba(0,0,0,0.18),0 0 0 1px rgba(0,0,0,0.06); border-radius:24px; width:100%; max-width:480px; overflow:hidden; }
    .header { display:flex; align-items:center; gap:12px; padding:20px 20px 14px; border-bottom:1px solid rgba(0,0,0,0.06); }
    .header-icon { width:36px; height:36px; border-radius:10px; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
    .header-icon.pass { background:rgba(52,199,89,0.10); }
    .header-icon.fail { background:rgba(255,59,48,0.10); }
    .header-icon.running, .header-icon.pending { background:rgba(0,0,0,0.06); }
    .title { font-size:16px; font-weight:700; color:#1D1D1F; margin:0; letter-spacing:-0.02em; }
    .subtitle { font-size:12px; color:#86868B; margin:2px 0 0; }
    .close-btn { margin-left:auto; width:28px; height:28px; border-radius:8px; background:rgba(0,0,0,0.05); border:none; cursor:pointer; display:flex; align-items:center; justify-content:center; color:#86868B; }
    .steps-list { padding:12px 20px 20px; display:flex; flex-direction:column; gap:4px; max-height:400px; overflow-y:auto; }
    .step-row { display:flex; align-items:flex-start; gap:10px; padding:7px 0; }
    .step-indicator { width:22px; height:22px; border-radius:50%; display:flex; align-items:center; justify-content:center; flex-shrink:0; margin-top:1px; }
    .step-pending  .step-indicator { background:rgba(0,0,0,0.07); }
    .step-running  .step-indicator { background:rgba(0,0,0,0.07); }
    .step-pass     .step-indicator { background:#34C759; }
    .step-fail     .step-indicator { background:#FF3B30; }
    .step-info { display:flex; flex-direction:column; gap:2px; }
    .step-label { font-size:13px; font-weight:500; color:#1D1D1F; }
    .step-pending .step-label { color:#AEAEB2; }
    .step-running .step-label { color:#1D1D1F; font-weight:600; }
    .step-detail { font-size:11px; color:#86868B; font-family:monospace; }
    .step-fail .step-detail { color:#FF3B30; }
    .spinner-sm { width:16px; height:16px; border:2px solid rgba(0,0,0,0.14); border-top-color:#1D1D1F; border-radius:50%; animation:spin 0.7s linear infinite; }
    .mini-spinner { width:12px; height:12px; border:2px solid rgba(0,0,0,0.14); border-top-color:#1D1D1F; border-radius:50%; animation:spin 0.7s linear infinite; }
    @keyframes spin { to { transform:rotate(360deg); } }
    @keyframes scaleIn { from { opacity:0; transform:scale(0.92) translateY(10px); } to { opacity:1; transform:scale(1) translateY(0); } }
    .animate-scale-in { animation: scaleIn 300ms cubic-bezier(0.34,1.56,0.64,1) both; }
  `],
})
export class StructureCheckModalComponent {
  @Input() isOpen = false;
  @Input() fileName = '';
  @Input() steps = signal<XsdStep[]>([
    { id: 1,  label: 'Encodage UTF-8',              status: 'pending' },
    { id: 2,  label: 'Déclaration XML namespace',   status: 'pending' },
    { id: 3,  label: 'Racine <BCT_RAPPORT>',        status: 'pending' },
    { id: 4,  label: 'En-tête obligatoire',         status: 'pending' },
    { id: 5,  label: 'Code établissement (5 chiffres)', status: 'pending' },
    { id: 6,  label: 'Période de référence (YYYY-MM)', status: 'pending' },
    { id: 7,  label: 'Présence de toutes les annexes', status: 'pending' },
    { id: 8,  label: 'Ordre des blocs XML',         status: 'pending' },
    { id: 9,  label: 'Types numériques (decimal)',   status: 'pending' },
    { id: 10, label: 'Signes autorisés',             status: 'pending' },
    { id: 11, label: 'Longueurs de champs',          status: 'pending' },
    { id: 12, label: 'Références croisées',          status: 'pending' },
    { id: 13, label: 'Contrôle de totalisation',     status: 'pending' },
    { id: 14, label: 'Signature XSD finale',         status: 'pending' },
  ]);
  @Output() closed = new EventEmitter<void>();

  readonly passCount = computed(() => this.steps().filter(s => s.status === 'pass').length);
  readonly overallStatus = computed<CheckStatus>(() => {
    const s = this.steps();
    if (s.some(x => x.status === 'fail'))    return 'fail';
    if (s.some(x => x.status === 'running')) return 'running';
    if (s.every(x => x.status === 'pass'))   return 'pass';
    return 'pending';
  });

  onBackdrop(e: MouseEvent): void { if (e.target === e.currentTarget) this.closed.emit(); }
}
