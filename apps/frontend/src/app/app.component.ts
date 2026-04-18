import {
  ChangeDetectionStrategy, Component, ElementRef,
  OnInit, ViewChild, computed, inject, signal,
} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { RouterOutlet } from '@angular/router';
import { NgClass, DatePipe, DecimalPipe } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';
import { catchError, of } from 'rxjs';

// ── Icon lib (SVG inline, no font deps) ─────────────────────────────────────
const I: Record<string, string> = {
  upload:  `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>`,
  send:    `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`,
  file:    `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`,
  check:   `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>`,
  x:       `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  alert:   `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
  spark:   `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`,
  eye:     `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`,
  history: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><polyline points="12 8 12 12 14 14"/><path d="M3.05 11a9 9 0 1 1 .5 4m-.5 5v-5h5"/></svg>`,
  arrow:   `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>`,
};

export type MsgRole = 'ai' | 'user';
export interface ChatMessage {
  id: string; role: MsgRole; text: string;
  ts: Date; citations?: string[]; confidence?: number;
}

export interface UploadedFile {
  id: string; name: string;
  status: 'ok' | 'fail' | 'analyzing' | 'pending';
  score?: number; pass?: number; fail?: number; skip?: number;
}

export interface VerdictItem {
  ruleId: string; annexeCode: string; numRegle: number;
  gap: string; domaine: string; rubrique: string;
}

const WELCOME: ChatMessage = {
  id: 'w0', role: 'ai', ts: new Date(),
  text: `Bonjour, je suis **Regalica**, votre co-pilote de conformité BCT.\n\nDéposez vos fichiers XML d'annexes dans le panneau de gauche pour que j'analyse leur conformité aux 4 611 règles RDG. Je vous fournirai un rapport détaillé avec les écarts détectés, leur cause racine, et les corrections recommandées.\n\nQue souhaitez-vous faire ?`,
  citations: [], confidence: 1,
};

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, NgClass, DatePipe, DecimalPipe, FormsModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly sanitizer = inject(DomSanitizer);

  @ViewChild('chatBottom') chatBottom?: ElementRef<HTMLElement>;
  @ViewChild('fileInput') fileInput?: ElementRef<HTMLInputElement>;

  // ── State ──────────────────────────────────────────────────────────────────
  readonly messages  = signal<ChatMessage[]>([WELCOME]);
  readonly inputText = signal('');
  readonly aiTyping  = signal(false);
  readonly dragOver  = signal(false);

  readonly files     = signal<UploadedFile[]>([]);
  readonly verdicts  = signal<VerdictItem[]>([]);
  readonly analyzing = signal(false);
  readonly progress  = signal(0);

  readonly apiOk = signal<boolean | null>(null);

  // ── Computed ───────────────────────────────────────────────────────────────
  readonly totalPass = computed(() => this.files().reduce((s, f) => s + (f.pass ?? 0), 0));
  readonly totalFail = computed(() => this.files().reduce((s, f) => s + (f.fail ?? 0), 0));
  readonly totalSkip = computed(() => this.files().reduce((s, f) => s + (f.skip ?? 0), 0));
  readonly scored    = computed(() => this.totalPass() + this.totalFail());
  readonly score     = computed(() => this.scored() > 0 ? (this.totalPass() / this.scored()) * 100 : 0);

  readonly scoreArc  = computed(() => {
    const r = 30, circ = 2 * Math.PI * r, pct = Math.min(this.score() / 100, 1);
    return { circ, dash: circ * pct, gap: circ * (1 - pct) };
  });

  readonly hasFiles   = computed(() => this.files().length > 0);
  readonly hasVerdicts = computed(() => this.verdicts().length > 0);

  // ── Lifecycle ──────────────────────────────────────────────────────────────
  ngOnInit(): void {
    this.http.get('/api/health').pipe(
      catchError(() => { this.apiOk.set(false); return of(null); }),
    ).subscribe(r => { if (r) this.apiOk.set(true); });
  }

  // ── Icon helper ────────────────────────────────────────────────────────────
  icon(name: string): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(I[name] ?? '');
  }

  // ── Upload ─────────────────────────────────────────────────────────────────
  openFilePicker(): void { this.fileInput?.nativeElement.click(); }

  onFileInputChange(e: Event): void {
    const input = e.target as HTMLInputElement;
    if (input.files) this.handleFiles(Array.from(input.files));
  }

  onDrop(e: DragEvent): void {
    e.preventDefault(); this.dragOver.set(false);
    const files = Array.from(e.dataTransfer?.files ?? []);
    this.handleFiles(files.filter(f => f.name.toLowerCase().endsWith('.xml')));
  }

  onDragOver(e: DragEvent): void { e.preventDefault(); this.dragOver.set(true); }
  onDragLeave(): void { this.dragOver.set(false); }

  private handleFiles(raw: File[]): void {
    if (!raw.length) return;
    const newFiles: UploadedFile[] = raw.map(f => ({
      id: crypto.randomUUID(), name: f.name, status: 'pending',
    }));
    this.files.update(fs => [...fs, ...newFiles]);
    void this.simulateAnalysis(newFiles);
  }

  private async simulateAnalysis(newFiles: UploadedFile[]): Promise<void> {
    this.analyzing.set(true);
    this.progress.set(0);
    this.addAiMessage(`Analyse en cours pour **${newFiles.length}** fichier(s)… Validation structure + ${newFiles.length * 1054} règles RDG applicables.`);

    for (const f of newFiles) {
      this.files.update(fs => fs.map(x => x.id === f.id ? { ...x, status: 'analyzing' } : x));
      await this.sleep(800 + Math.random() * 600);

      const isFail = f.name.includes('640');
      const pass = isFail ? 744 : Math.floor(900 + Math.random() * 150);
      const fail = isFail ? 12 : Math.floor(1 + Math.random() * 3);
      const skip = Math.floor(15 + Math.random() * 30);
      const s = (pass / (pass + fail)) * 100;

      this.files.update(fs => fs.map(x =>
        x.id === f.id ? { ...x, status: isFail ? 'fail' : 'ok', score: s, pass, fail, skip } : x,
      ));

      if (isFail) {
        this.verdicts.update(vs => [...vs, {
          ruleId: crypto.randomUUID(),
          annexeCode: '630', numRegle: 47,
          gap: '-57985.000', domaine: 'REPORTING COMPTABLE',
          rubrique: 'PA030202000000',
        }]);
      }

      this.progress.set(Math.round(((newFiles.indexOf(f) + 1) / newFiles.length) * 100));
    }

    await this.sleep(400);
    this.analyzing.set(false);

    const totalFail = newFiles.reduce((s, f) => {
      const found = this.files().find(x => x.id === f.id);
      return s + (found?.fail ?? 0);
    }, 0);

    if (totalFail > 0) {
      this.addAiMessage(
        `Analyse terminée. J'ai détecté **${totalFail} écart(s) réglementaire(s) SEVERE** dans vos annexes.\n\nLa rubrique **PA030202000000** (Ventilation des Ressources, annexe 630) présente un écart de **−57 985 TND** — exactement le type d'incohérence inter-annexe qui peut déclencher une observation BCT.\n\nSouhaitez-vous que j'effectue une analyse approfondie de ces FAIL ?`,
        ['rule:630-47', 'kb:bct-circulaire-2014-14'],
      );
    } else {
      this.addAiMessage(
        `✓ Toutes les annexes sont conformes — aucun écart réglementaire détecté. Score global : **${this.score().toFixed(1)}%**.\n\nVous pouvez procéder à la signature et au dépôt BCT.`,
        ['kb:procedure-depot-bct'],
      );
    }
    this.scrollChat();
  }

  // ── Chat ───────────────────────────────────────────────────────────────────
  sendMessage(): void {
    const text = this.inputText().trim();
    if (!text) return;
    this.messages.update(ms => [...ms, { id: crypto.randomUUID(), role: 'user', text, ts: new Date() }]);
    this.inputText.set('');
    this.aiTyping.set(true);
    this.scrollChat();

    setTimeout(() => {
      this.aiTyping.set(false);
      this.addAiResponse(text);
      this.scrollChat();
    }, 1400 + Math.random() * 600);
  }

  onEnter(e: KeyboardEvent): void {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.sendMessage(); }
  }

  private addAiResponse(question: string): void {
    const q = question.toLowerCase();
    let reply: string;
    let citations: string[] = [];

    if (q.includes('fail') || q.includes('écart') || q.includes('pa030')) {
      reply = `La rubrique **PA030202000000** correspond à la ventilation sectorielle des ressources clientèle (Ventilation par secteur institutionnel — annexe 630).\n\nL'écart de **−57 985 TND** signifie que la somme déclarée en colonne 1 diffère de la valeur attendue calculée à partir des annexes 00 et 51.\n\n**Correction suggérée :** Vérifiez la ligne PA030202 dans votre fichier \`640-2024-03-31.XML\` — la valeur en colonne 1 doit être égale à AC050100.col8 − PA030100.col3.\n\n*Pilier 4 — Suggest Don't Repair : c'est vous qui effectuez la correction dans votre XML.*`;
      citations = ['rule:630-47', 'kb:bct-rubrique-PA030202', 'circulaire:2014-14'];
    } else if (q.includes('score') || q.includes('conformité')) {
      reply = `Le score de conformité global est calculé comme : **PASS / (PASS + FAIL) × 100**.\n\nAvec ${this.totalPass().toLocaleString('fr')} règles satisfaites et ${this.totalFail()} écarts, vous atteignez **${this.score().toFixed(1)}%** — ce qui est dans la fourchette acceptable pour une banque tunisienne de taille moyenne.`;
      citations = ['kb:methode-scoring-bct'];
    } else if (q.includes('règle') || q.includes('rdg')) {
      reply = `Le RDG (Recueil de Déclarations et de Gestion) contient **4 611 règles** réparties sur **52 annexes**. Chaque règle définit une contrainte mathématique entre rubriques déclarées.\n\nPour vos 5 annexes déposées, **1 054 règles sont applicables**. Les 3 557 restantes concernent des annexes non incluses dans votre lot.`;
      citations = ['kb:rdg-taxonomie', 'kb:annexes-bct'];
    } else {
      reply = `Je suis à votre disposition pour analyser vos rapports BCT, expliquer les écarts détectés, ou répondre à toute question sur les règles RDG.\n\nN'hésitez pas à me poser une question précise sur un FAIL, une rubrique, ou une circulaire.`;
      citations = ['kb:faq-conformite-bct'];
    }

    this.addAiMessage(reply, citations, 0.97);
  }

  private addAiMessage(text: string, citations: string[] = [], confidence = 1): void {
    this.messages.update(ms => [...ms, {
      id: crypto.randomUUID(), role: 'ai', text, ts: new Date(), citations, confidence,
    }]);
  }

  private scrollChat(): void {
    setTimeout(() => this.chatBottom?.nativeElement.scrollIntoView({ behavior: 'smooth' }), 50);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(r => setTimeout(r, ms));
  }

  // ── Markdown-lite renderer ─────────────────────────────────────────────────
  renderMd(text: string): SafeHtml {
    const html = text
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code>$1</code>')
      .replace(/\n/g, '<br>');
    return this.sanitizer.bypassSecurityTrustHtml(html);
  }
}
