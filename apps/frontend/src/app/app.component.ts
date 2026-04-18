import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { RouterOutlet } from '@angular/router';
import { catchError, of } from 'rxjs';

export interface HealthResponse {
  status: string;
  service: string;
  version: string;
  uptime: number;
  timestamp: string;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent implements OnInit {
  private readonly http = inject(HttpClient);

  readonly health = signal<HealthResponse | null>(null);
  readonly error = signal<string | null>(null);
  readonly loading = signal(true);

  ngOnInit(): void {
    this.http
      .get<HealthResponse>('/api/health')
      .pipe(
        catchError((err: { message?: string }) => {
          this.error.set(err.message ?? 'Unknown error');
          return of(null);
        }),
      )
      .subscribe((res) => {
        if (res) {
          this.health.set(res);
        }
        this.loading.set(false);
      });
  }
}
