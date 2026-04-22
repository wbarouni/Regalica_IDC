import {
  ChangeDetectionStrategy, Component, EventEmitter, Input, OnInit, Output, signal,
} from '@angular/core';
import { NgClass } from '@angular/common';

export interface VerdictContext {
  ruleId: string;
  annexeCode: string;
  numRegle: number;
  operRegle: string;
  gap: string | null;
  lhs: string | null;
  rhs: string | null;
  rubrique?: string;
  domaine?: string;
}

interface AccordionLayer {
  id: string;
  icon: string;
  title: string;
  content: string;
  isLoading: boolean;
}

@Component({
  selector: 'rg-deep-dive-modal',
  standalone: true,
  imports: [NgClass],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (isOpen && verdict) {
      <div class="backdrop" (click)="onBackdrop($event)">
        <div class="panel animate-scale-in" role="dialog" aria-label="Analyse approfondie">

          <div class="header">
            <div class="header-badge fail">FAIL · SEVERE</div>
            <div class="header-meta">
              <span class="annexe">Annexe {{ verdict.annexeCode }}</span>
              <span class="rule">Règle {{ verdict.numRegle }}</span>
              <span class="gap">Écart : {{ verdict.gap ?? '—' }} TND</span>
            </div>
            <button class="close-btn" (click)="closed.emit()" aria-label="Fermer">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>

          <!-- 5 accordion layers -->
          <div class="accordion">
            @for (layer of layers(); track layer.id) {
              <div class="layer" [ngClass]="{ 'layer-open': openLayer() === layer.id }">
                <button class="layer-trigger" (click)="toggleLayer(layer.id)">
                  <span class="layer-icon">{{ layer.icon }}</span>
                  <span class="layer-title">{{ layer.title }}</span>
                  <svg class="layer-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="6 9 12 15 18 9"/></svg>
                </button>
                @if (openLayer() === layer.id) {
                  <div class="layer-body animate-slide-down">
                    @if (layer.isLoading) {
                      <div class="loading-row">
                        <div class="shimmer-line"></div>
                        <div class="shimmer-line short"></div>
                      </div>
                    } @else {
                      <p class="layer-content">{{ layer.content }}</p>
                    }
                  </div>
                }
              </div>
            }
          </div>

          <!-- Ask Regalica -->
          <div class="ask-bar">
            <div class="ai-badge">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1D1D1F" stroke-width="1.8" stroke-linecap="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
              Regalica AI
            </div>
            <p class="ask-hint">Posez une question ciblée sur cette règle dans l'assistant.</p>
            <button class="btn-primary" (click)="askRegalica()">
              Analyser avec Regalica →
            </button>
          </div>

        </div>
      </div>
    }
  `,
  styles: [`
    .backdrop { position:fixed; inset:0; z-index:900; background:rgba(0,0,0,0.25); backdrop-filter:blur(8px); -webkit-backdrop-filter:blur(8px); display:flex; align-items:center; justify-content:center; padding:24px; }
    .panel { background:rgba(255,255,255,0.97); backdrop-filter:blur(40px) saturate(220%); -webkit-backdrop-filter:blur(40px) saturate(220%); border:1px solid rgba(255,255,255,0.98); box-shadow:0 32px 64px rgba(0,0,0,0.18),0 0 0 1px rgba(0,0,0,0.06); border-radius:24px; width:100%; max-width:600px; overflow:hidden; }
    .header { display:flex; align-items:center; gap:10px; padding:18px 20px 14px; border-bottom:1px solid rgba(0,0,0,0.06); flex-wrap:wrap; }
    .header-badge { padding:4px 10px; border-radius:99px; font-size:11px; font-weight:700; letter-spacing:0.04em; }
    .fail { background:rgba(255,59,48,0.10); color:#FF3B30; }
    .header-meta { display:flex; align-items:center; gap:8px; flex:1; flex-wrap:wrap; }
    .annexe, .rule { font-size:12px; font-weight:600; color:#1D1D1F; background:rgba(0,0,0,0.05); padding:3px 8px; border-radius:6px; }
    .gap { font-size:12px; font-weight:700; color:#FF3B30; font-family:monospace; }
    .close-btn { width:28px; height:28px; border-radius:8px; background:rgba(0,0,0,0.05); border:none; cursor:pointer; display:flex; align-items:center; justify-content:center; color:#86868B; }
    .accordion { padding:8px 0; }
    .layer { border-bottom:1px solid rgba(0,0,0,0.05); }
    .layer-trigger { width:100%; display:flex; align-items:center; gap:10px; padding:12px 20px; background:none; border:none; cursor:pointer; text-align:left; transition:background 120ms; }
    .layer-trigger:hover { background:rgba(0,0,0,0.02); }
    .layer-icon { font-size:16px; }
    .layer-title { flex:1; font-size:13px; font-weight:600; color:#1D1D1F; }
    .layer-chevron { color:#86868B; transition:transform 200ms; }
    .layer-open .layer-chevron { transform:rotate(180deg); }
    .layer-body { padding:4px 20px 16px 46px; }
    .layer-content { font-size:13px; color:#48484A; line-height:1.6; margin:0; }
    .loading-row { display:flex; flex-direction:column; gap:8px; }
    .shimmer-line { height:12px; border-radius:6px; background:linear-gradient(90deg,#EBEBED 25%,#F5F5F7 50%,#EBEBED 75%); background-size:200% 100%; animation:shimmer 1.5s ease-in-out infinite; }
    .shimmer-line.short { width:60%; }
    @keyframes shimmer { from { background-position:-200% 0; } to { background-position:200% 0; } }
    .ask-bar { display:flex; align-items:center; gap:12px; padding:14px 20px; background:rgba(0,0,0,0.03); border-top:1px solid rgba(0,0,0,0.07); flex-wrap:wrap; }
    .ai-badge { display:flex; align-items:center; gap:5px; font-size:12px; font-weight:700; color:#1D1D1F; }
    .ask-hint { flex:1; font-size:12px; color:#86868B; margin:0; }
    .btn-primary { display:inline-flex; align-items:center; padding:8px 16px; border-radius:10px; font-size:12px; font-weight:600; color:#fff; background:linear-gradient(135deg,#1D1D1F,#000000); border:none; cursor:pointer; transition:all 200ms; white-space:nowrap; }
    .btn-primary:hover { transform:translateY(-1px); }
    @keyframes scaleIn { from { opacity:0; transform:scale(0.92) translateY(10px); } to { opacity:1; transform:scale(1) translateY(0); } }
    .animate-scale-in { animation: scaleIn 300ms cubic-bezier(0.34,1.56,0.64,1) both; }
    @keyframes slideDown { from { opacity:0; transform:translateY(-8px); } to { opacity:1; transform:translateY(0); } }
    .animate-slide-down { animation: slideDown 200ms ease-out both; }
  `],
})
export class DeepDiveModalComponent implements OnInit {
  @Input() isOpen = false;
  @Input() verdict: VerdictContext | null = null;
  @Output() closed = new EventEmitter<void>();
  @Output() askAI = new EventEmitter<VerdictContext>();

  readonly openLayer = signal<string | null>('regle');
  readonly layers = signal<AccordionLayer[]>([
    { id: 'regle',      icon: '📋', title: 'Règle RDG',         content: '', isLoading: false },
    { id: 'donnees',    icon: '🔢', title: 'Données XML',        content: '', isLoading: false },
    { id: 'calcul',     icon: '🧮', title: 'Détail du calcul',   content: '', isLoading: false },
    { id: 'contexte',   icon: '📖', title: 'Contexte réglementaire', content: '', isLoading: false },
    { id: 'recommandation', icon: '💡', title: 'Recommandation', content: '', isLoading: false },
  ]);

  ngOnInit(): void { this.populateLayers(); }

  toggleLayer(id: string): void {
    this.openLayer.update(curr => curr === id ? null : id);
  }

  askRegalica(): void {
    if (this.verdict) this.askAI.emit(this.verdict);
    this.closed.emit();
  }

  onBackdrop(e: MouseEvent): void { if (e.target === e.currentTarget) this.closed.emit(); }

  private populateLayers(): void {
    if (!this.verdict) return;
    const v = this.verdict;
    this.layers.update(ls => ls.map(l => {
      switch (l.id) {
        case 'regle':
          return { ...l, content: `Règle n°${v.numRegle} · Opérateur : ${v.operRegle}. Cette règle vérifie la cohérence de la rubrique déclarée avec les totaux de l'annexe ${v.annexeCode}.` };
        case 'donnees':
          return { ...l, content: `Valeur déclarée (LHS) : ${v.lhs ?? '—'} TND\nValeur attendue (RHS) : ${v.rhs ?? '—'} TND` };
        case 'calcul':
          return { ...l, content: `Écart calculé : ${v.gap ?? '—'} TND (Decimal 38 chiffres, arrondi HALF_EVEN). Tolérance ZERO : tout écart non nul est SEVERE.` };
        case 'contexte':
          return { ...l, content: `Circulaire BCT applicable. L'annexe ${v.annexeCode} est soumise aux contrôles de cohérence inter-rubriques définis dans le RDG. Confiance KB ≥ 95% requise pour tout verdict critique.` };
        case 'recommandation':
          return { ...l, content: `Vérifiez la ligne de saisie correspondant à la rubrique en écart. Corrigez directement dans votre XML source (principe SUGGEST DON'T REPAIR — l'IA ne modifie jamais votre fichier). Soumettez une nouvelle version via « Déposer un rapport ».` };
        default:
          return l;
      }
    }));
  }
}
