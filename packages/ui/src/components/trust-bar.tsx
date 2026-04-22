import { Shield, CheckCircle2, Clock, Lock } from 'lucide-react';
import { cn } from '../lib/cn';

const TRUST_ITEMS = [
  { icon: Shield, label: 'Zero Hallucination' },
  { icon: CheckCircle2, label: 'Citations obligatoires' },
  { icon: Clock, label: 'Audit 10 ans' },
  { icon: Lock, label: 'RLS multi-tenant' },
] as const;

export interface TrustBarProps {
  className?: string;
}

export function TrustBar({ className }: TrustBarProps) {
  return (
    <div className={cn('flex items-center gap-4', className)} role="status" aria-label="Garanties de conformite">
      {TRUST_ITEMS.map(({ icon: Icon, label }) => (
        <div key={label} className="flex items-center gap-1.5">
          <Icon
            size={14}
            aria-hidden="true"
            style={{ color: 'var(--brand-violet)' }}
          />
          <span
            style={{
              color: 'var(--mono-steel)',
              fontSize: 'var(--text-xs)',
              letterSpacing: 'var(--tracking-uppercase)',
              textTransform: 'uppercase' as const,
            }}
          >
            {label}
          </span>
        </div>
      ))}
    </div>
  );
}
