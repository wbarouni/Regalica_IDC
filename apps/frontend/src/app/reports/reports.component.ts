import {
  ChangeDetectionStrategy, Component,
  computed, inject, signal,
} from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { DecimalPipe } from '@angular/common';
import { catchError, of } from 'rxjs';

interface RunResult {
  runId: string;
  pass: number;
  fail: number;
  skip: number;
  status: string;
  createdAt?: string;
}

type LoadState = 'idle' | 'loading' | 'loaded' | 'not-found' | 'error';

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [DecimalPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="reports-page">

      <div class="reports-header">
        <h1 class="reports-title">Rapports d'analyse</h1>
      </div>

      <div class="search-bar glass">
        <label class="search-label" for="runId">Identifiant de run</label>
        <div class="search-row">
          <input
            id="runId"
            class="run-input"
            type="text"
            placeholder="ex: 550e8400-e29b-41d4-a716-446655440000"
            [value]="runIdInput()"
            (input)="runIdInput.set($any($event.target).value)"
            (keydown.enter)="loadRun()"
          />
          <button class="btn-primary" [disabled]="!runIdInput().trim() || loadState() === 'loading'" (click)="loadRun()">
            {{ loadState() === 'loading' ? 'Chargement…' : 'Charger' }}
          </button>
        </div>
      </div>

      @if (loadState() === 'not-found') {
        <div class="state-msg error-msg">Run introuvable. Vérifiez l'identifiant.</div>
      }
      @if (loadState() === 'error') {
        <div class="state-msg error-msg">Erreur lors de la récupération. Vérifiez la connexion à l'API.</div>
      }

      @if (loadState() === 'loaded' && runResult()) {
        <div class="result-card glass">
          <div class="result-header">
            <span class="result-run-id">{{ runResult()!.runId }}</span>
            <span class="badge" [class]="runResult()!.fail > 0 ? 'badge-fail' : 'badge-pass'">
              {{ runResult()!.fail > 0 ? 'NON CONFORME' : 'CONFORME' }}
            </span>
          </div>

          <div class="result-body">

            <!-- Gauge -->
            <div class="gauge-col">
              <svg width="120" height="120" viewBox="0 0 120 120">
                <circle cx="60" cy="60" r="48" fill="none" stroke="rgba(0,0,0,0.07)" stroke-width="9"/>
                <circle cx="60" cy="60" r="48" fill="none"
                  [attr.stroke]="runResult()!.fail > 0 ? '#FF3B30' : '#34C759'"
                  stroke-width="9" stroke-linecap="round"
                  [attr.stroke-dasharray]="arc().dash + ' ' + arc().gap"
                  transform="rotate(-90 60 60)"
                  style="transition: stroke-dasharray 0.8s cubic-bezier(.4,0,.2,1)"/>
                <text x="60" y="65" text-anchor="middle"
                  font-family="Inter,system-ui" font-size="19" font-weight="700"
                  [attr.fill]="runResult()!.fail > 0 ? '#FF3B30' : '#34C759'">
                  {{ score() | number:'1.0-0' }}%
                </text>
              </svg>
              <p class="gauge-lbl">Conformité</p>
            </div>

            <!-- Counts table -->
            <table class="counts-table">
              <thead>
                <tr>
                  <th>Statut</th>
                  <th>Nombre</th>
                  <th>Part</th>
                </tr>
              </thead>
              <tbody>
                <tr class="row-pass">
                  <td><span class="status-dot dot-pass"></span> PASS</td>
                  <td>{{ runResult()!.pass | number }}</td>
                  <td>{{ passShare() | number:'1.1-1' }}%</td>
                </tr>
                <tr class="row-fail">
                  <td><span class="status-dot dot-fail"></span> FAIL</td>
                  <td>{{ runResult()!.fail | number }}</td>
                  <td>{{ failShare() | number:'1.1-1' }}%</td>
                </tr>
                <tr class="row-skip">
                  <td><span class="status-dot dot-skip"></span> SKIP</td>
                  <td>{{ runResult()!.skip | number }}</td>
                  <td>{{ skipShare() | number:'1.1-1' }}%</td>
                </tr>
                <tr class="row-total">
                  <td><strong>Total</strong></td>
                  <td><strong>{{ total() | number }}</strong></td>
                  <td>100%</td>
                </tr>
              </tbody>
            </table>

          </div>

          @if (runResult()!.createdAt) {
            <p class="result-date">Créé le {{ runResult()!.createdAt }}</p>
          }
        </div>
      }

    </div>
  `,
  styles: [`
    .reports-page {
      min-height: 100vh;
      background: linear-gradient(135deg, #F0F0F5 0%, #EBEBF0 40%, #E8E8EF 100%);
      padding: 32px;
      font-family: Inter, system-ui, sans-serif;
    }
    .reports-header { margin-bottom: 24px; }
    .reports-title { font-size: 24px; font-weight: 700; color: #1D1D1F; margin: 0; }

    .glass {
      background: rgba(255,255,255,0.75);
      border: 1px solid rgba(0,0,0,0.06);
      backdrop-filter: blur(12px);
      border-radius: 16px;
    }

    .search-bar { padding: 20px; margin-bottom: 20px; }
    .search-label { display: block; font-size: 12px; font-weight: 600; color: #86868B; margin-bottom: 8px; }
    .search-row { display: flex; gap: 10px; }
    .run-input {
      flex: 1; padding: 10px 14px; border-radius: 10px;
      border: 1px solid rgba(0,0,0,0.12); font-size: 14px;
      font-family: 'JetBrains Mono', monospace;
      background: rgba(255,255,255,0.9); outline: none;
    }
    .run-input:focus { border-color: #6E56CF; box-shadow: 0 0 0 3px rgba(110,86,207,0.15); }

    .btn-primary {
      padding: 10px 20px; border-radius: 10px; border: none; cursor: pointer;
      background: linear-gradient(135deg, #6E56CF, #5A40B8);
      color: white; font-size: 14px; font-weight: 600;
      box-shadow: 0 2px 8px rgba(110,86,207,0.35);
      white-space: nowrap;
    }
    .btn-primary:hover:not(:disabled) { opacity: 0.88; }
    .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

    .state-msg { padding: 12px 16px; border-radius: 10px; font-size: 14px; margin-bottom: 16px; }
    .error-msg { background: rgba(255,59,48,0.08); color: #FF3B30; border: 1px solid rgba(255,59,48,0.2); }

    .result-card { padding: 24px; }
    .result-header {
      display: flex; align-items: center; justify-content: space-between;
      margin-bottom: 20px;
    }
    .result-run-id { font-size: 12px; font-family: 'JetBrains Mono', monospace; color: #86868B; }
    .badge { padding: 4px 10px; border-radius: 99px; font-size: 11px; font-weight: 700; }
    .badge-pass { background: rgba(52,199,89,0.12); color: #34C759; }
    .badge-fail { background: rgba(255,59,48,0.12); color: #FF3B30; }

    .result-body { display: flex; gap: 32px; align-items: flex-start; }
    .gauge-col { display: flex; flex-direction: column; align-items: center; gap: 6px; }
    .gauge-lbl { font-size: 12px; color: #86868B; }

    .counts-table { border-collapse: collapse; flex: 1; font-size: 14px; }
    .counts-table th {
      text-align: left; padding: 8px 12px;
      font-size: 11px; font-weight: 600; color: #86868B; text-transform: uppercase;
      border-bottom: 1px solid rgba(0,0,0,0.07);
    }
    .counts-table td { padding: 10px 12px; border-bottom: 1px solid rgba(0,0,0,0.04); }
    .status-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 6px; }
    .dot-pass { background: #34C759; }
    .dot-fail { background: #FF3B30; }
    .dot-skip { background: #FF9500; }
    .row-pass td:first-child { color: #34C759; font-weight: 600; }
    .row-fail td:first-child { color: #FF3B30; font-weight: 600; }
    .row-skip td:first-child { color: #FF9500; font-weight: 600; }
    .row-total td { font-weight: 700; border-top: 2px solid rgba(0,0,0,0.1); }

    .result-date { font-size: 11px; color: #AEAEB2; margin-top: 16px; }
  `],
})
export class ReportsComponent {
  private readonly http = inject(HttpClient);

  readonly runIdInput = signal('');
  readonly loadState  = signal<LoadState>('idle');
  readonly runResult  = signal<RunResult | null>(null);

  readonly score = computed(() => {
    const r = this.runResult();
    if (!r) return 0;
    const scored = r.pass + r.fail;
    return scored > 0 ? (r.pass / scored) * 100 : 0;
  });

  readonly total     = computed(() => {
    const r = this.runResult();
    return r ? r.pass + r.fail + r.skip : 0;
  });
  readonly passShare = computed(() => this.total() > 0 ? (this.runResult()!.pass / this.total()) * 100 : 0);
  readonly failShare = computed(() => this.total() > 0 ? (this.runResult()!.fail / this.total()) * 100 : 0);
  readonly skipShare = computed(() => this.total() > 0 ? (this.runResult()!.skip / this.total()) * 100 : 0);

  readonly arc = computed(() => {
    const r = 48, circ = 2 * Math.PI * r, pct = Math.min(this.score() / 100, 1);
    return { dash: circ * pct, gap: circ * (1 - pct) };
  });

  loadRun(): void {
    const id = this.runIdInput().trim();
    if (!id) return;

    this.loadState.set('loading');
    this.runResult.set(null);

    this.http.get<RunResult>(`/api/runs/${id}`, {
      headers: { 'x-tenant-id': '00000000-0000-0000-0000-000000000001' },
    }).pipe(
      catchError((err: HttpErrorResponse) => {
        this.loadState.set(err.status === 404 ? 'not-found' : 'error');
        return of(null);
      }),
    ).subscribe(result => {
      if (result) {
        this.runResult.set(result);
        this.loadState.set('loaded');
      }
    });
  }
}
