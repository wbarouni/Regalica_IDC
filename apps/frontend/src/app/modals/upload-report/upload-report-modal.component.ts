import {
  ChangeDetectionStrategy, Component, ElementRef, EventEmitter,
  Input, Output, ViewChild, signal,
} from '@angular/core';
import { NgClass } from '@angular/common';

export interface UploadPayload {
  files: File[];
  annexeType: 'COREP' | 'FINREP' | 'COSFI';
}

@Component({
  selector: 'rg-upload-report-modal',
  standalone: true,
  imports: [NgClass],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (isOpen) {
      <div class="backdrop" (click)="onBackdrop($event)">
        <div class="panel animate-scale-in" role="dialog" aria-label="Déposer un rapport XML">

          <div class="header">
            <div class="header-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1D1D1F" stroke-width="1.8" stroke-linecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            </div>
            <div>
              <h2 class="title">Déposer un rapport XML</h2>
              <p class="subtitle">Annexes BCT · UTF-8 · XSD certifié</p>
            </div>
            <button class="close-btn" (click)="closed.emit()" aria-label="Fermer">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>

          <div class="body">
            <!-- Annexe type selector -->
            <div class="type-row">
              <span class="type-label">Type d'annexe :</span>
              @for (t of annexeTypes; track t) {
                <button class="type-chip"
                  [ngClass]="{ 'type-chip-active': selectedType() === t }"
                  (click)="selectedType.set(t)">{{ t }}</button>
              }
            </div>

            <!-- Drop zone -->
            <div class="drop-zone"
              [ngClass]="{ 'drop-active': dragOver() }"
              (drop)="onDrop($event)" (dragover)="onDragOver($event)"
              (dragleave)="dragOver.set(false)" (click)="fileInput.click()">
              <svg class="drop-icon" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              <p class="drop-primary">Glissez vos fichiers XML ici</p>
              <p class="drop-secondary">ou cliquez pour parcourir · max 50 Mo par fichier</p>
              <input #fileInput type="file" accept=".xml" multiple hidden (change)="onFileInput($event)" />
            </div>

            <!-- File list -->
            @if (selectedFiles().length > 0) {
              <div class="file-list">
                @for (f of selectedFiles(); track f.name) {
                  <div class="file-row animate-fade-up">
                    <svg class="file-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1D1D1F" stroke-width="1.8" stroke-linecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                    <span class="file-name">{{ f.name }}</span>
                    <span class="file-size">{{ (f.size / 1024).toFixed(0) }} Ko</span>
                    <button class="file-remove" (click)="removeFile(f.name)">×</button>
                  </div>
                }
              </div>
            }

            <!-- Actions -->
            <div class="actions">
              <button class="btn-ghost" (click)="closed.emit()">Annuler</button>
              <button class="btn-primary"
                [disabled]="selectedFiles().length === 0"
                (click)="submit()">
                Lancer l'analyse
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
              </button>
            </div>
          </div>

        </div>
      </div>
    }
  `,
  styles: [`
    .backdrop { position:fixed; inset:0; z-index:900; background:rgba(0,0,0,0.25); backdrop-filter:blur(8px); -webkit-backdrop-filter:blur(8px); display:flex; align-items:center; justify-content:center; padding:24px; }
    .panel { background:rgba(255,255,255,0.97); backdrop-filter:blur(40px) saturate(220%); -webkit-backdrop-filter:blur(40px) saturate(220%); border:1px solid rgba(255,255,255,0.98); box-shadow:0 32px 64px rgba(0,0,0,0.18),0 0 0 1px rgba(0,0,0,0.06); border-radius:24px; width:100%; max-width:540px; overflow:hidden; }
    .header { display:flex; align-items:center; gap:12px; padding:20px 20px 16px; border-bottom:1px solid rgba(0,0,0,0.06); }
    .header-icon { width:36px; height:36px; border-radius:10px; background:rgba(0,0,0,0.06); display:flex; align-items:center; justify-content:center; flex-shrink:0; }
    .title { font-size:16px; font-weight:700; color:#1D1D1F; margin:0; letter-spacing:-0.02em; }
    .subtitle { font-size:12px; color:#86868B; margin:2px 0 0; }
    .close-btn { margin-left:auto; width:28px; height:28px; border-radius:8px; background:rgba(0,0,0,0.05); border:none; cursor:pointer; display:flex; align-items:center; justify-content:center; color:#86868B; transition:all 120ms; }
    .close-btn:hover { background:rgba(0,0,0,0.10); color:#1D1D1F; }
    .body { padding:20px; display:flex; flex-direction:column; gap:16px; }
    .type-row { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
    .type-label { font-size:12px; font-weight:600; color:#86868B; }
    .type-chip { padding:5px 12px; border-radius:99px; font-size:12px; font-weight:600; background:rgba(0,0,0,0.05); border:1px solid rgba(0,0,0,0.08); color:#48484A; cursor:pointer; transition:all 120ms; }
    .type-chip-active { background:rgba(0,0,0,0.07); border-color:rgba(0,0,0,0.20); color:#1D1D1F; }
    .drop-zone { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:6px; padding:28px 20px; border:1.5px dashed rgba(0,0,0,0.15); border-radius:16px; cursor:pointer; transition:all 200ms; text-align:center; }
    .drop-zone:hover, .drop-active { border-color:#1D1D1F; background:rgba(0,0,0,0.03); }
    .drop-icon { color:#AEAEB2; transition:color 200ms; }
    .drop-zone:hover .drop-icon, .drop-active .drop-icon { color:#1D1D1F; }
    .drop-primary { font-size:14px; font-weight:600; color:#1D1D1F; margin:0; }
    .drop-secondary { font-size:12px; color:#86868B; margin:0; }
    .file-list { display:flex; flex-direction:column; gap:6px; max-height:160px; overflow-y:auto; }
    .file-row { display:flex; align-items:center; gap:8px; padding:8px 10px; border-radius:10px; background:rgba(0,0,0,0.03); border:1px solid rgba(0,0,0,0.07); }
    .file-icon { flex-shrink:0; }
    .file-name { flex:1; font-size:12px; font-weight:500; color:#1D1D1F; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .file-size { font-size:11px; color:#86868B; font-family:monospace; }
    .file-remove { background:none; border:none; cursor:pointer; font-size:16px; color:#86868B; line-height:1; padding:0 4px; }
    .file-remove:hover { color:#FF3B30; }
    .actions { display:flex; justify-content:flex-end; gap:8px; padding-top:4px; }
    .btn-primary { display:inline-flex; align-items:center; gap:6px; padding:9px 18px; border-radius:12px; font-size:13px; font-weight:600; color:#fff; background:linear-gradient(135deg,#1D1D1F,#000000); border:none; cursor:pointer; transition:all 200ms; box-shadow:0 2px 12px rgba(0,0,0,0.20); }
    .btn-primary:hover:not(:disabled) { transform:translateY(-1px); box-shadow:0 4px 20px rgba(0,0,0,0.28); }
    .btn-primary:disabled { opacity:0.4; cursor:not-allowed; }
    .btn-ghost { display:inline-flex; align-items:center; padding:9px 14px; border-radius:12px; font-size:13px; font-weight:500; color:#86868B; background:transparent; border:none; cursor:pointer; transition:all 200ms; }
    .btn-ghost:hover { background:#EBEBED; color:#1D1D1F; }
    @keyframes scaleIn { from { opacity:0; transform:scale(0.92) translateY(10px); } to { opacity:1; transform:scale(1) translateY(0); } }
    .animate-scale-in { animation: scaleIn 300ms cubic-bezier(0.34,1.56,0.64,1) both; }
    @keyframes fadeUp { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
    .animate-fade-up { animation: fadeUp 200ms ease-out both; }
  `],
})
export class UploadReportModalComponent {
  @Input() isOpen = false;
  @Output() closed = new EventEmitter<void>();
  @Output() filesUploaded = new EventEmitter<UploadPayload>();
  @ViewChild('fileInput') fileInputRef!: ElementRef<HTMLInputElement>;

  readonly annexeTypes: Array<'COREP' | 'FINREP' | 'COSFI'> = ['COREP', 'FINREP', 'COSFI'];
  readonly selectedType = signal<'COREP' | 'FINREP' | 'COSFI'>('COREP');
  readonly selectedFiles = signal<File[]>([]);
  readonly dragOver = signal(false);

  onDragOver(e: DragEvent): void { e.preventDefault(); this.dragOver.set(true); }
  onDrop(e: DragEvent): void {
    e.preventDefault(); this.dragOver.set(false);
    const files = Array.from(e.dataTransfer?.files ?? []).filter(f => f.name.endsWith('.xml'));
    this.selectedFiles.update(curr => [...curr, ...files]);
  }
  onFileInput(e: Event): void {
    const files = Array.from((e.target as HTMLInputElement).files ?? []);
    this.selectedFiles.update(curr => [...curr, ...files]);
  }
  removeFile(name: string): void { this.selectedFiles.update(f => f.filter(x => x.name !== name)); }
  onBackdrop(e: MouseEvent): void { if (e.target === e.currentTarget) this.closed.emit(); }
  submit(): void {
    if (this.selectedFiles().length > 0)
      this.filesUploaded.emit({ files: this.selectedFiles(), annexeType: this.selectedType() });
  }
}
