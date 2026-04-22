import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/cn';

const glassCardVariants = cva(
  'rounded-xl overflow-hidden',
  {
    variants: {
      material: {
        chrome: [
          '[background:var(--glass-chrome)]',
          'border border-[color:var(--glass-border-lo)]',
          'shadow-[var(--shadow-sm)]',
        ],
        thick: [
          '[background:var(--glass-thick)]',
          'border border-[color:var(--glass-border-lo)]',
          'shadow-[var(--shadow-md)]',
          'backdrop-blur-xl',
        ],
        regular: [
          '[background:var(--glass-regular)]',
          'border border-[color:var(--glass-border-hi)/30]',
          'shadow-[var(--shadow-sm)]',
          'backdrop-blur-md',
        ],
        thin: [
          '[background:var(--glass-thin)]',
          'border border-[color:var(--glass-border-hi)/20]',
          'backdrop-blur-sm',
        ],
      },
      interactive: {
        true: 'cursor-pointer hover:shadow-[var(--shadow-md)] transition-shadow duration-200',
        false: '',
      },
    },
    defaultVariants: {
      material: 'regular',
      interactive: false,
    },
  },
);

export interface GlassCardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof glassCardVariants> {}

export const GlassCard = React.forwardRef<HTMLDivElement, GlassCardProps>(
  ({ className, material, interactive, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(glassCardVariants({ material, interactive }), className)}
        {...props}
      />
    );
  },
);

GlassCard.displayName = 'GlassCard';
