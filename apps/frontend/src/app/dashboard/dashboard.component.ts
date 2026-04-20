import {
  ChangeDetectionStrategy, Component, OnInit,
  computed, inject, signal,
} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { DecimalPipe } from '@angular/common';
import { Router } from '@angular/router';
import { catchError, of } from 'rxjs';

interface LastRun {
  runId: string;
  pass: number;
  fail: number;
  skip: number;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [DecimalPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="dash-page">

      <div class="dash-header">
        <h1 class="dash-title">Tableau de bord</h1>
        <button class="btn-primary" (click)="goWorkspace()">Lancer une analyse</button>
      </div>

      <div class="api-status">
        <span class="dot" [class]="apiOk() === true ? 'dot-pass' : apiOk() === false ? 'dot-fail' : 'dot-idle'"></span>
        <span class="api-label">API {{ apiOk() === true ? 'en ligne' : apiOk() === false ? 'hors ligne' : 'vérification…' }}</span>
      </div>

      @if (lastRun()) {
        <div class="kpi-grid">
          <div class="kpi-card pass">
            <span class="kpi-val">{{ lastRun()!.pass | number }}</span>
            <span class="kpi-lbl">PASS</span>
          </div>
          <div class="kpi-card fail">
            <span class="kpi-val">{{ lastRun()!.fail | number }}</span>
            <span class="kpi-lbl">FAIL</span>
          </div>
          <div class="kpi-card skip">
            <span class="kpi-val">{{ lastRun()!.skip | number }}</span>
            <span class="kpi-lbl">SKIP</span>
          </div>
          <div class="kpi-card score">
            <span class="kpi-val">{{ score() | number:'1.1-1' }}%</span>
            <span class="kpi-lbl">Score</span>
          </div>
        </div>

        <div class="gauge-wrap">
          <svg width="140" height="140" viewBox="0 0 140 140">
            <circle cx="70" cy="70" r="55" fill="none" stroke="rgba(0,0,0,0.07)" stroke-width="10"/>
            <circle cx="70" cy="70" r="55" fill="none"
              [attr.stroke]="lastRun()!.fail > 0 ? '#FF3B30' : '#34C759'"
              stroke-width="10" stroke-linecap="round"
              [attr.stroke-dasharray]="arc().dash + ' ' + arc().gap"
              transform="rotate(-90 70 70)"
              style="transition: stroke-dasharray 0.8s cubic-bezier(.4,0,.2,1)"/>
            <text x="70" y="75" text-anchor="middle"
              font-family="Inter,system-ui" font-size="22" font-weight="700"
              [attr.fill]="lastRun()!.fail > 0 ? '#FF3B30' : '#34C759'">
              {{ score() | number:'1.0-0' }}%
            </text>
            <text x="70" y="95" text-anchor="middle"
              font-family="Inter,system-ui" font-size="11" fill="#86868B">
              conformité
            </text>
          </svg>
          <p class="gauge-run-id">Run : {{ lastRun()!.runId }}</p>
        </div>
      } @else {
        <div class="empty-dash">
          <p class="empty-dash-label">Aucune analyse récente.</p>
          <p class="empty-dash-sub">Lancez une analyse depuis l'espace de travail pour voir vos KPIs ici.</p>
        </div>
      }

    </div>
  `,
  styles: [`
    .dash-page {
      min-height: 100vh;
      background: linear-gradient(135deg, #F0F0F5 0%, #EBEBF0 40%, #E8E8EF 100%);
      padding: 32px;
      font-family: Inter, system-ui, sans-serif;
    }
    .dash-header {
      display: flex; align-items: center; justify-content: space-between;
      margin-bottom: 24px;
    }
    .dash-title { font-size: 24px; font-weight: 700; color: #1D1D1F; margin: 0; }
    .btn-primary {
      padding: 10px 20px; border-radius: 10px; border: none; cursor: pointer;
      background: linear-gradient(135deg, #6E56CF, #5A40B8);
      color: white; font-size: 14px; font-weight: 600;
      box-shadow: 0 2px 8px rgba(110,86,207,0.35);
    }
    .btn-primary:hover { opacity: 0.88; }
    .api-status {
      display: flex; align-items: center; gap: 6px;
      font-size: 12px; color: #86868B; margin-bottom: 28px;
    }
    .dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
    .dot-pass { background: #34C759; }
    .dot-fail { background: #FF3B30; }
    .dot-idle { background: #86868B; }
    .kpi-grid {
      display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px;
      margin-bottom: 32px;
    }
    .kpi-card {
      display: flex; flex-direction: column; align-items: center; gap: 4px;
      padding: 20px; border-radius: 16px;
      background: rgba(255,255,255,0.75);
      border: 1px solid rgba(0,0,0,0.06);
      backdrop-filter: blur(12px);
    }
    .kpi-val { font-size: 28px; font-weight: 700; }
    .kpi-lbl { font-size: 12px; font-weight: 500; color: #86868B; }
    .kpi-card.pass .kpi-val { color: #34C759; }
    .kpi-card.fail .kpi-val { color: #FF3B30; }
    .kpi-card.skip .kpi-val { color: #FF9500; }
    .kpi-card.score .kpi-val { color: #6E56CF; }
    .gauge-wrap {
      display: flex; flex-direction: column; align-items: center; gap: 12px;
    }
    .gauge-run-id { font-size: 11px; color: #86868B; font-family: 'JetBrains Mono', monospace; }
    .empty-dash {
      display: flex; flex-direction: column; align-items: center;
      gap: 8px; margin-top: 80px; text-align: center;
    }
    .empty-dash-label { font-size: 18px; font-weight: 600; color: #86868B; }
    .empty-dash-sub   { font-size: 14px; color: #AEAEB2; }
  `],
})
export class DashboardComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  readonly apiOk   = signal<boolean | null>(null);
  readonly lastRun = signal<LastRun | null>(null);

  readonly score = computed(() => {
    const r = this.lastRun();
    if (!r) return 0;
    const scored = r.pass + r.fail;
    return scored > 0 ? (r.pass / scored) * 100 : 0;
  });

  readonly arc = computed(() => {
    const r = 55, circ = 2 * Math.PI * r, pct = Math.min(this.score() / 100, 1);
    return { circ, dash: circ * pct, gap: circ * (1 - pct) };
  });

  ngOnInit(): void {
    this.http.get('/api/health').pipe(
      catchError(() => { this.apiOk.set(false); return of(null); }),
    ).subscribe(r => { if (r) this.apiOk.set(true); });

    const raw = localStorage.getItem('regalica_last_run');
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as LastRun;
        this.lastRun.set(parsed);
      } catch {
        // malformed entry — ignore
      }
    }
  }

  goWorkspace(): void {
    void this.router.navigate(['/workspace']);
  }
}
