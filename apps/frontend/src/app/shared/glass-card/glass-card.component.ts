import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { NgClass } from '@angular/common';

export type GlassVariant = 'chrome' | 'thick' | 'regular' | 'thin' | 'ai' | 'flat';

@Component({
  selector: 'rg-glass-card',
  standalone: true,
  imports: [NgClass],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div [ngClass]="['rg-card', 'rg-card-' + variant, rounded ? 'rg-card-rounded-' + rounded : '']">
      <ng-content />
    </div>
  `,
  styles: [`
    :host { display: contents; }

    .rg-card { overflow: hidden; }

    .rg-card-rounded-sm  { border-radius: 12px; }
    .rg-card-rounded-md  { border-radius: 16px; }
    .rg-card-rounded-lg  { border-radius: 20px; }
    .rg-card-rounded-xl  { border-radius: 24px; }

    .rg-card-chrome {
      background: rgba(255,255,255,0.95);
      backdrop-filter: blur(40px) saturate(220%);
      -webkit-backdrop-filter: blur(40px) saturate(220%);
      border: 1px solid rgba(255,255,255,0.98);
      box-shadow: 0 20px 48px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.06);
    }
    .rg-card-thick {
      background: rgba(255,255,255,0.88);
      backdrop-filter: blur(28px) saturate(200%);
      -webkit-backdrop-filter: blur(28px) saturate(200%);
      border: 1px solid rgba(255,255,255,0.92);
      box-shadow: 0 8px 24px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.05);
    }
    .rg-card-regular {
      background: rgba(255,255,255,0.72);
      backdrop-filter: blur(20px) saturate(180%);
      -webkit-backdrop-filter: blur(20px) saturate(180%);
      border: 1px solid rgba(255,255,255,0.85);
      box-shadow: 0 2px 8px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.04);
    }
    .rg-card-thin {
      background: rgba(255,255,255,0.50);
      backdrop-filter: blur(12px) saturate(160%);
      -webkit-backdrop-filter: blur(12px) saturate(160%);
      border: 1px solid rgba(255,255,255,0.70);
    }
    .rg-card-ai {
      background: rgba(0,0,0,0.04);
      backdrop-filter: blur(20px) saturate(180%);
      -webkit-backdrop-filter: blur(20px) saturate(180%);
      border: 1px solid rgba(0,0,0,0.10);
      box-shadow: 0 2px 12px rgba(0,0,0,0.06);
    }
    .rg-card-flat {
      background: #FFFFFF;
      border: 1px solid rgba(0,0,0,0.08);
      box-shadow: 0 2px 8px rgba(0,0,0,0.06);
    }
  `],
})
export class GlassCardComponent {
  @Input() variant: GlassVariant = 'regular';
  @Input() rounded: 'sm' | 'md' | 'lg' | 'xl' = 'lg';
}
