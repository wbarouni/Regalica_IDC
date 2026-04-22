import {
  ChangeDetectionStrategy, Component, ElementRef,
  OnInit, ViewChild, computed, inject, signal,
} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { NgClass, DatePipe, DecimalPipe } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';
import { catchError, of } from 'rxjs';
import { io, Socket } from 'socket.io-client';
import { UploadReportModalComponent, ValidationProgressModalComponent, DeepDiveModalComponent } from './modals';
import type { UploadPayload, VerdictContext } from './modals';
import { ToastContainerComponent } from './shared';

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
  ruleId: string;
  annexeCode: string;
  numRegle: number;
  operRegle: string;
  status: string;
  lhs: string | null;
  rhs: string | null;
  gap: string | null;
  skipReason: string | null;
  rubrique?: string;
  domaine?: string;
}

interface EvalResult {
  runId: string;
  pass: number;
  fail: number;
  skip: number;
  verdicts: Array<{
    ruleId: string;
    annexeCode: string;
    numRegle: number;
    operRegle: string;
    status: string;
    lhs: string | null;
    rhs: string | null;
    gap: string | null;
    skipReason: string | null;
  }>;
}

interface ChatApiResponse {
  reply: string;
  citations: string[];
  confidence: number;
  model_id: string;
  tokens_used: number;
  latency_ms: number;
  low_confidence: boolean;
}

interface PromptApiResponse {
  key: string;
  content: string;
  variables: string[];
  locale: string;
  version: number;
}

const WELCOME: ChatMessage = {
  id: 'w0', role: 'ai', ts: new Date(),
  text: `Bonjour, je suis **Regalica**, votre co-pilote de conformité BCT.\n\nDéposez vos fichiers XML d'annexes dans le panneau de gauche pour que j'analyse leur conformité aux 4 611 règles RDG. Je vous fournirai un rapport détaillé avec les écarts détectés, leur cause racine, et les corrections recommandées.\n\nQue souhaitez-vous faire ?`,
  citations: [], confidence: 1,
};

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, NgClass, DatePipe, DecimalPipe, FormsModule,
    UploadReportModalComponent, ValidationProgressModalComponent, DeepDiveModalComponent, ToastContainerComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly sanitizer = inject(DomSanitizer);

  @ViewChild('chatBottom') chatBottom?: ElementRef<HTMLElement>;
  @ViewChild('fileInput') fileInput?: ElementRef<HTMLInputElement>;

  // ── Socket.IO ──────────────────────────────────────────────────────────────
  private socket!: Socket;

  // ── File object registry (id → raw File for FormData) ─────────────────────
  private fileObjects = new Map<string, File>();

  // ── Session ────────────────────────────────────────────────────────────────
  private readonly sessionId = crypto.randomUUID();

  // ── State ──────────────────────────────────────────────────────────────────
  readonly messages  = signal<ChatMessage[]>([WELCOME]);
  readonly currentRunId = signal<string | null>(null);
  readonly inputText = signal('');
  readonly aiTyping  = signal(false);
  readonly dragOver  = signal(false);

  readonly files     = signal<UploadedFile[]>([]);
  readonly verdicts  = signal<VerdictItem[]>([]);
  readonly analyzing = signal(false);
  readonly progress  = signal(0);

  readonly apiOk = signal<boolean | null>(null);

  // ── Modal state ────────────────────────────────────────────────────────────
  readonly showUploadModal   = signal(false);
  readonly showProgressModal = signal(false);
  readonly showDeepDiveModal = signal(false);
  readonly selectedVerdict   = signal<VerdictItem | null>(null);

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

  readonly hasFiles    = computed(() => this.files().length > 0);
  readonly hasVerdicts = computed(() => this.verdicts().length > 0);

  // ── Lifecycle ──────────────────────────────────────────────────────────────
  ngOnInit(): void {
    this.http.get('/api/health').pipe(
      catchError(() => { this.apiOk.set(false); return of(null); }),
    ).subscribe(r => { if (r) this.apiOk.set(true); });

    this.http.get<PromptApiResponse>('/api/prompts/regalica.opening', {
      params: { locale: 'fr' },
      headers: { 'x-tenant-id': '00000000-0000-0000-0000-000000000001' },
    }).pipe(
      catchError(() => of(null)),
    ).subscribe(resp => {
      if (resp?.content) {
        this.messages.update(ms => ms.map(m =>
          m.id === 'w0' ? { ...m, text: resp.content } : m,
        ));
      }
    });

    this.socket = io('http://localhost:3000', { transports: ['websocket', 'polling'] });

    this.socket.on('progress', (data: { runId: string; percentage: number }) => {
      this.progress.set(data.percentage);
    });

    this.socket.on('verdict', (v: VerdictItem) => {
      this.verdicts.update(vs => [...vs, v]);
    });
  }

  // ── Icon helper ────────────────────────────────────────────────────────────
  icon(name: string): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(I[name] ?? '');
  }

  // ── Upload ─────────────────────────────────────────────────────────────────
  openFilePicker(): void { this.showUploadModal.set(true); }

  openDeepDive(v: VerdictItem): void {
    this.selectedVerdict.set(v);
    this.showDeepDiveModal.set(true);
  }

  onModalFilesUploaded(payload: UploadPayload): void {
    this.showUploadModal.set(false);
    this.handleFiles(payload.files);
  }

  onAskAI(v: VerdictContext): void {
    const text = `Analyse approfondie — Annexe ${v.annexeCode}, Règle ${v.numRegle}: écart de ${v.gap ?? '?'} TND. Quelle est la cause réglementaire et comment corriger ?`;
    this.inputText.set(text);
    this.showDeepDiveModal.set(false);
  }

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
    const newFiles: UploadedFile[] = raw.map(f => {
      const id = crypto.randomUUID();
      this.fileObjects.set(id, f);
      return { id, name: f.name, status: 'pending' };
    });
    this.files.update(fs => [...fs, ...newFiles]);
    void this.realAnalysis(newFiles);
  }

  private async realAnalysis(newFiles: UploadedFile[]): Promise<void> {
    this.analyzing.set(true);
    this.showProgressModal.set(true);
    this.progress.set(0);
    this.addAiMessage(`Analyse en cours pour **${newFiles.length}** fichier(s)…`);

    // Mark all as 'analyzing'
    newFiles.forEach(f => {
      this.files.update(fs => fs.map(x => x.id === f.id ? { ...x, status: 'analyzing' } : x));
    });

    const formData = new FormData();
    for (const f of newFiles) {
      const file = this.fileObjects.get(f.id);
      if (file) formData.append('files', file);
    }

    try {
      const result = await this.http.post<EvalResult>(
        '/api/uploads/evaluate',
        formData,
        { headers: { 'x-tenant-id': '00000000-0000-0000-0000-000000000001' } },
      ).toPromise();

      if (result) {
        if (result.runId) {
          this.currentRunId.set(result.runId);
          // Persist summary for Dashboard page
          localStorage.setItem('regalica_last_run', JSON.stringify({
            runId: result.runId,
            pass: result.pass,
            fail: result.fail,
            skip: result.skip,
          }));
        }

        // Aggregate counts per annexeCode to map back to uploaded files by filename
        const countsByAnnexe = new Map<string, { pass: number; fail: number; skip: number }>();
        for (const v of result.verdicts) {
          const entry = countsByAnnexe.get(v.annexeCode) ?? { pass: 0, fail: 0, skip: 0 };
          if (v.status === 'PASS') { entry.pass++; }
          else if (v.status === 'FAIL') { entry.fail++; }
          else { entry.skip++; }
          countsByAnnexe.set(v.annexeCode, entry);
        }

        // Map each uploaded file to verdict counts by matching annexeCode in filename
        this.files.update(fs => fs.map(x => {
          if (!newFiles.find(nf => nf.id === x.id)) return x;

          // Try to find the annexeCode that appears in this file's name
          let matched: { pass: number; fail: number; skip: number } | undefined;
          for (const [annexeCode, counts] of countsByAnnexe) {
            if (x.name.includes(annexeCode)) { matched = counts; break; }
          }

          // Fall back to totals from the overall result when a file-level match is unavailable
          const pass = matched?.pass ?? result.pass;
          const fail = matched?.fail ?? result.fail;
          const skip = matched?.skip ?? result.skip;
          const scored = pass + fail;
          const score = scored > 0 ? (pass / scored) * 100 : 100;
          const status: UploadedFile['status'] = fail > 0 ? 'fail' : 'ok';

          return { ...x, status, score, pass, fail, skip };
        }));

        // Build AI summary message
        if (result.fail > 0) {
          this.addAiMessage(
            `Analyse terminée. J'ai détecté **${result.fail} écart(s) réglementaire(s) SEVERE** dans vos annexes.\n\nConsultez la liste des verdicts pour le détail des rubriques en écart et les valeurs attendues vs déclarées.\n\nSouhaitez-vous que j'effectue une analyse approfondie de ces FAIL ?`,
            ['kb:bct-circulaire-2014-14'],
          );
        } else {
          this.addAiMessage(
            `Toutes les annexes sont conformes — aucun écart réglementaire détecté. Score global : **${this.score().toFixed(1)}%**.\n\nVous pouvez procéder à la signature et au dépôt BCT.`,
            ['kb:procedure-depot-bct'],
          );
        }
      }
    } catch (_err) {
      newFiles.forEach(f => {
        this.files.update(fs => fs.map(x => x.id === f.id ? { ...x, status: 'fail' } : x));
      });
      this.addAiMessage('Erreur lors de l\'analyse. Vérifiez la connexion à l\'API.');
    }

    this.analyzing.set(false);
    this.showProgressModal.set(false);
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

    this.http.post<ChatApiResponse>('/chat', {
      message: text,
      run_id: this.currentRunId() ?? null,
      tenant_id: '00000000-0000-0000-0000-000000000001',
      session_id: this.sessionId,
      kb_snippets: [],
    }).pipe(
      catchError(() => of(null)),
    ).subscribe(resp => {
      this.aiTyping.set(false);
      if (resp) {
        this.addAiMessage(resp.reply, resp.citations, resp.confidence);
      } else {
        this.addAiMessage('Erreur de connexion au service IA. Vérifiez que le chatbot-py est démarré (port 8000).');
      }
      this.scrollChat();
    });
  }

  onEnter(e: KeyboardEvent): void {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.sendMessage(); }
  }

  private addAiMessage(text: string, citations: string[] = [], confidence = 1): void {
    this.messages.update(ms => [...ms, {
      id: crypto.randomUUID(), role: 'ai', text, ts: new Date(), citations, confidence,
    }]);
  }

  private scrollChat(): void {
    setTimeout(() => this.chatBottom?.nativeElement.scrollIntoView({ behavior: 'smooth' }), 50);
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
