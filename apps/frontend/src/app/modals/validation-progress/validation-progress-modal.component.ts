import {
  ChangeDetectionStrategy, Component, EventEmitter, Input, OnChanges,
  OnDestroy, Output, SimpleChanges, signal, computed,
} from '@angular/core';
import { NgClass, DecimalPipe } from '@angular/common';
import { io, Socket } from 'socket.io-client';

export interface PipelineStep {
  id: number;
  label: string;
  status: 'pending' | 'running' | 'done' | 'error';
}

const PIPELINE_STEPS: Omit<PipelineStep, 'status'>[] = [
  { id: 1,  label: 'Réception du fichier XML' },
  { id: 2,  label: 'Validation XSD (structure)' },
  { id: 3,  label: 'Détection de l\'encodage UTF-8' },
  { id: 4,  label: 'Extraction des cellules' },
  { id: 5,  label: 'Résolution des références croisées' },
  { id: 6,  label: 'Chargement des règles RDG' },
  { id: 7,  label: 'Évaluation Agent 1 (totaux)' },
  { id: 8,  label: 'Évaluation Agent 2 (ratios)' },
  { id: 9,  label: 'Évaluation Agent 3 (limites)' },
  { id: 10, label: 'Évaluation Agent 4 (cohérence)' },
  { id: 11, label: 'Calcul des écarts (Decimal 38)' },
  { id: 12, label: 'Génération des verdicts' },
  { id: 13, label: 'Persistance en base de données' },
  { id: 14, label: 'Notification Socket.IO' },
];

@Component({
  selector: 'rg-validation-progress-modal',
  standalone: true,
  imports: [NgClass, DecimalPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (isOpen) {
      <div class="backdrop">
        <div class="panel animate-scale-in" role="dialog" aria-label="Analyse en cours">

          <div class="header">
            <div class="header-icon spin-ring">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1D1D1F" stroke-width="1.8" stroke-linecap="round"><polyline points="12 8 12 12 14 14"/><path d="M3.05 11a9 9 0 1 1 .5 4m-.5 5v-5h5"/></svg>
            </div>
            <div class="header-text">
              <h2 class="title">Analyse en cours…</h2>
              <p class="subtitle">{{ progressPct() | number:'1.0-0' }}% · étape {{ currentStepIdx() + 1 }}/{{ steps().length }}</p>
            </div>
            @if (isDone()) {
              <button class="close-btn" (click)="closed.emit()" aria-label="Fermer">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            }
          </div>

          <!-- Progress bar -->
          <div class="progress-track">
            <div class="progress-fill" [style.width.%]="progressPct()"></div>
          </div>

          <!-- Steps list -->
          <div class="steps-list">
            @for (step of steps(); track step.id) {
              <div class="step-row" [ngClass]="'step-' + step.status">
                <div class="step-dot">
                  @if (step.status === 'done') {
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                  } @else if (step.status === 'running') {
                    <div class="step-spinner"></div>
                  } @else if (step.status === 'error') {
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  }
                </div>
                <span class="step-label">{{ step.label }}</span>
              </div>
            }
          </div>

          @if (isDone()) {
            <div class="footer">
              <div class="result-kpi pass">
                <span class="kpi-val">{{ passCount() }}</span>
                <span class="kpi-lbl">PASS</span>
              </div>
              <div class="result-kpi fail">
                <span class="kpi-val">{{ failCount() }}</span>
                <span class="kpi-lbl">FAIL</span>
              </div>
              <button class="btn-primary" (click)="closed.emit()">Voir les résultats →</button>
            </div>
          }

        </div>
      </div>
    }
  `,
  styles: [`
    .backdrop { position:fixed; inset:0; z-index:900; background:rgba(0,0,0,0.25); backdrop-filter:blur(8px); -webkit-backdrop-filter:blur(8px); display:flex; align-items:center; justify-content:center; padding:24px; }
    .panel { background:rgba(255,255,255,0.97); backdrop-filter:blur(40px) saturate(220%); -webkit-backdrop-filter:blur(40px) saturate(220%); border:1px solid rgba(255,255,255,0.98); box-shadow:0 32px 64px rgba(0,0,0,0.18),0 0 0 1px rgba(0,0,0,0.06); border-radius:24px; width:100%; max-width:480px; overflow:hidden; }
    .header { display:flex; align-items:center; gap:12px; padding:20px 20px 14px; }
    .header-icon { width:36px; height:36px; border-radius:10px; background:rgba(0,0,0,0.06); display:flex; align-items:center; justify-content:center; flex-shrink:0; }
    .title { font-size:16px; font-weight:700; color:#1D1D1F; margin:0; letter-spacing:-0.02em; }
    .subtitle { font-size:12px; color:#86868B; margin:2px 0 0; font-family:monospace; }
    .close-btn { margin-left:auto; width:28px; height:28px; border-radius:8px; background:rgba(0,0,0,0.05); border:none; cursor:pointer; display:flex; align-items:center; justify-content:center; color:#86868B; }
    .progress-track { height:4px; background:rgba(0,0,0,0.06); margin:0; }
    .progress-fill { height:100%; background:linear-gradient(90deg,#1D1D1F,#3388FF); border-radius:0 4px 4px 0; transition:width 400ms ease; }
    .steps-list { padding:12px 20px; display:flex; flex-direction:column; gap:2px; max-height:320px; overflow-y:auto; }
    .step-row { display:flex; align-items:center; gap:10px; padding:5px 0; }
    .step-dot { width:20px; height:20px; border-radius:50%; display:flex; align-items:center; justify-content:center; flex-shrink:0; font-size:10px; }
    .step-pending .step-dot { background:rgba(0,0,0,0.05); color:transparent; }
    .step-running .step-dot { background:rgba(0,0,0,0.07); }
    .step-done    .step-dot { background:#34C759; color:#fff; }
    .step-error   .step-dot { background:#FF3B30; color:#fff; }
    .step-label { font-size:12px; color:#1D1D1F; }
    .step-pending .step-label { color:#AEAEB2; }
    .step-running .step-label { color:#1D1D1F; font-weight:600; }
    .step-spinner { width:12px; height:12px; border:2px solid rgba(0,0,0,0.14); border-top-color:#1D1D1F; border-radius:50%; animation:spin 0.7s linear infinite; }
    @keyframes spin { to { transform:rotate(360deg); } }
    .footer { display:flex; align-items:center; gap:12px; padding:14px 20px 20px; border-top:1px solid rgba(0,0,0,0.06); }
    .result-kpi { display:flex; flex-direction:column; align-items:center; gap:2px; padding:8px 16px; border-radius:10px; }
    .result-kpi.pass { background:rgba(52,199,89,0.10); }
    .result-kpi.fail { background:rgba(255,59,48,0.10); }
    .kpi-val { font-size:20px; font-weight:700; font-family:monospace; }
    .result-kpi.pass .kpi-val { color:#34C759; }
    .result-kpi.fail .kpi-val { color:#FF3B30; }
    .kpi-lbl { font-size:10px; font-weight:600; color:#86868B; letter-spacing:0.05em; }
    .btn-primary { margin-left:auto; display:inline-flex; align-items:center; gap:6px; padding:9px 18px; border-radius:12px; font-size:13px; font-weight:600; color:#fff; background:linear-gradient(135deg,#1D1D1F,#000000); border:none; cursor:pointer; transition:all 200ms; box-shadow:0 2px 12px rgba(0,0,0,0.20); }
    .btn-primary:hover { transform:translateY(-1px); }
    @keyframes scaleIn { from { opacity:0; transform:scale(0.92) translateY(10px); } to { opacity:1; transform:scale(1) translateY(0); } }
    .animate-scale-in { animation: scaleIn 300ms cubic-bezier(0.34,1.56,0.64,1) both; }
  `],
})
export class ValidationProgressModalComponent implements OnChanges, OnDestroy {
  @Input() isOpen = false;
  @Input() runId: string | null = null;
  @Output() closed = new EventEmitter<void>();

  readonly steps = signal<PipelineStep[]>(PIPELINE_STEPS.map(s => ({ ...s, status: 'pending' })));
  readonly passCount = signal(0);
  readonly failCount = signal(0);

  readonly currentStepIdx = computed(() => {
    const s = this.steps();
    let idx = -1;
    for (let i = s.length - 1; i >= 0; i--) {
      if (s[i]!.status === 'running' || s[i]!.status === 'done') { idx = i; break; }
    }
    return idx < 0 ? 0 : idx;
  });

  readonly progressPct = computed(() => {
    const done = this.steps().filter(s => s.status === 'done' || s.status === 'error').length;
    return (done / this.steps().length) * 100;
  });

  readonly isDone = computed(() => this.steps().every(s => s.status === 'done' || s.status === 'error'));

  private socket: Socket | null = null;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isOpen']?.currentValue === true && this.runId) this.connect();
    if (changes['isOpen']?.currentValue === false) this.disconnect();
  }

  ngOnDestroy(): void { this.disconnect(); }

  private connect(): void {
    this.socket = io('http://localhost:3000', { transports: ['websocket', 'polling'] });
    this.socket.on('run:progress', (data: { step: number; pass: number; fail: number }) => {
      this.steps.update(s => s.map((step, i) => ({
        ...step,
        status: i < data.step - 1 ? 'done' : i === data.step - 1 ? 'running' : 'pending',
      })));
    });
    this.socket.on('run:complete', (data: { pass: number; fail: number }) => {
      this.steps.update(s => s.map(step => ({ ...step, status: 'done' })));
      this.passCount.set(data.pass);
      this.failCount.set(data.fail);
    });
  }

  private disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
    this.steps.set(PIPELINE_STEPS.map(s => ({ ...s, status: 'pending' })));
  }
}
