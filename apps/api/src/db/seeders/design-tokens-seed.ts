import { sequelize } from '../sequelize';
import { logger } from '../../logger';

interface TokenSeed {
  key: string;
  value: string;
  category: string;
  description?: string;
}

const TOKENS: TokenSeed[] = [
  // Colors — brand
  { key: '--rg-blue',       value: '#0066FF', category: 'color', description: 'Regalica primary blue accent' },
  { key: '--rg-blue-dark',  value: '#0050CC', category: 'color' },
  { key: '--rg-blue-light', value: '#3388FF', category: 'color' },
  { key: '--rg-blue-dim',   value: 'rgba(0,102,255,0.10)', category: 'color' },
  { key: '--rg-blue-glow',  value: 'rgba(0,102,255,0.25)', category: 'color' },
  // Colors — canvas
  { key: '--rg-canvas', value: '#FFFFFF', category: 'color', description: 'Pure white canvas' },
  { key: '--rg-bg-1',   value: '#F5F5F7', category: 'color' },
  { key: '--rg-bg-2',   value: '#EBEBED', category: 'color' },
  { key: '--rg-bg-3',   value: '#E0E0E5', category: 'color' },
  // Colors — text
  { key: '--rg-text-primary',   value: '#1D1D1F', category: 'color' },
  { key: '--rg-text-secondary', value: '#48484A', category: 'color' },
  { key: '--rg-text-muted',     value: '#86868B', category: 'color' },
  { key: '--rg-text-subtle',    value: '#AEAEB2', category: 'color' },
  // Colors — status
  { key: '--rg-pass',      value: '#34C759', category: 'color', description: 'BCT compliance pass' },
  { key: '--rg-pass-dim',  value: 'rgba(52,199,89,0.10)', category: 'color' },
  { key: '--rg-fail',      value: '#FF3B30', category: 'color', description: 'BCT compliance fail' },
  { key: '--rg-fail-dim',  value: 'rgba(255,59,48,0.10)', category: 'color' },
  { key: '--rg-warn',      value: '#FF9500', category: 'color' },
  { key: '--rg-warn-dim',  value: 'rgba(255,149,0,0.10)', category: 'color' },
  { key: '--rg-info',      value: '#007AFF', category: 'color' },
  { key: '--rg-gold',      value: '#C9A84C', category: 'color', description: 'Premium tier accent' },
  // Blur
  { key: '--blur-chrome',  value: '40px', category: 'blur', description: 'Chrome glass tier' },
  { key: '--blur-thick',   value: '28px', category: 'blur' },
  { key: '--blur-regular', value: '20px', category: 'blur' },
  { key: '--blur-thin',    value: '12px', category: 'blur' },
  // Shadows
  { key: '--shadow-sm',   value: '0 2px 8px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.04)', category: 'shadow' },
  { key: '--shadow-md',   value: '0 8px 24px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.05)', category: 'shadow' },
  { key: '--shadow-lg',   value: '0 20px 48px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.06)', category: 'shadow' },
  { key: '--shadow-blue', value: '0 2px 12px rgba(0,102,255,0.30)', category: 'shadow' },
  // Spacing
  { key: '--sp-1', value: '4px',  category: 'spacing' },
  { key: '--sp-2', value: '8px',  category: 'spacing' },
  { key: '--sp-3', value: '12px', category: 'spacing' },
  { key: '--sp-4', value: '16px', category: 'spacing' },
  { key: '--sp-6', value: '24px', category: 'spacing' },
  { key: '--sp-8', value: '32px', category: 'spacing' },
  // Radius
  { key: '--r-sm',   value: '8px',    category: 'radius' },
  { key: '--r-md',   value: '12px',   category: 'radius' },
  { key: '--r-lg',   value: '16px',   category: 'radius' },
  { key: '--r-xl',   value: '20px',   category: 'radius' },
  { key: '--r-2xl',  value: '24px',   category: 'radius' },
  { key: '--r-full', value: '9999px', category: 'radius' },
  // Motion
  { key: '--dur-fast',   value: '120ms', category: 'animation' },
  { key: '--dur-normal', value: '200ms', category: 'animation' },
  { key: '--dur-slow',   value: '300ms', category: 'animation' },
  { key: '--ease-spring', value: 'cubic-bezier(0.34,1.56,0.64,1)', category: 'animation' },
  // Typography
  { key: '--font-sans', value: "'Inter','SF Pro Text',system-ui,sans-serif", category: 'typography' },
  { key: '--font-mono', value: "'JetBrains Mono',ui-monospace,monospace",    category: 'typography' },
  // Layout
  { key: '--header-h',      value: '52px',  category: 'layout' },
  { key: '--panel-w-left',  value: '280px', category: 'layout' },
  { key: '--panel-w-right', value: '320px', category: 'layout' },
];

export async function seed(): Promise<void> {
  for (const token of TOKENS) {
    await sequelize.query(
      `
      INSERT INTO design_tokens (id, key, value, category, description, is_active)
      VALUES (gen_random_uuid(), :key, :value, :category, :description, TRUE)
      ON CONFLICT DO NOTHING;
      `,
      {
        replacements: {
          key: token.key,
          value: token.value,
          category: token.category,
          description: token.description ?? null,
        },
      },
    );
  }
  logger.info({ count: TOKENS.length }, 'design-tokens: seed complete');
}
