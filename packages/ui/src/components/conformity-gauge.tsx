import * as React from 'react';

interface ConformityGaugeProps {
  score: number;
  size?: number;
  label?: string;
  className?: string;
}

export function ConformityGauge({ score, size = 240, label, className }: ConformityGaugeProps) {
  const clampedScore = Math.min(100, Math.max(0, score));
  const radius = (size - 24) / 2;
  const arcAngle = 240;
  const startAngle = 150;
  const endAngle = startAngle + arcAngle;

  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const cx = size / 2;
  const cy = size / 2;

  const arcStart = {
    x: cx + radius * Math.cos(toRad(startAngle)),
    y: cy + radius * Math.sin(toRad(startAngle)),
  };
  const arcEnd = {
    x: cx + radius * Math.cos(toRad(endAngle)),
    y: cy + radius * Math.sin(toRad(endAngle)),
  };

  const progressAngle = startAngle + (arcAngle * clampedScore) / 100;
  const progressEnd = {
    x: cx + radius * Math.cos(toRad(progressAngle)),
    y: cy + radius * Math.sin(toRad(progressAngle)),
  };

  const strokeColor =
    clampedScore >= 80
      ? 'var(--functional-pass)'
      : clampedScore >= 50
        ? 'var(--functional-skipped)'
        : 'var(--functional-fail)';

  return (
    <div className={className} style={{ width: size, height: size, position: 'relative' }}>
      <svg width={size} height={size}>
        <path
          d={`M ${arcStart.x} ${arcStart.y} A ${radius} ${radius} 0 1 1 ${arcEnd.x} ${arcEnd.y}`}
          fill="none"
          stroke="var(--mono-silver)"
          strokeWidth={12}
          strokeLinecap="round"
        />
        {clampedScore > 0 && (
          <path
            d={`M ${arcStart.x} ${arcStart.y} A ${radius} ${radius} 0 ${clampedScore > 50 ? 1 : 0} 1 ${progressEnd.x} ${progressEnd.y}`}
            fill="none"
            stroke={strokeColor}
            strokeWidth={12}
            strokeLinecap="round"
            style={{ transition: 'stroke 0.4s var(--ease-standard)' }}
          />
        )}
      </svg>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span
          style={{
            color: strokeColor,
            fontSize: 'var(--text-4xl)',
            fontWeight: 'var(--font-semibold)',
            lineHeight: 1,
            transition: 'color 0.4s var(--ease-standard)',
          }}
        >
          {clampedScore}
        </span>
        <span style={{ color: 'var(--mono-steel)', fontSize: 'var(--text-xs)', marginTop: '4px' }}>
          {label ?? 'Conformite'}
        </span>
      </div>
    </div>
  );
}
