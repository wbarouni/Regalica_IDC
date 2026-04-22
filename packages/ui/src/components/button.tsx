import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/cn';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-all focus-visible:outline-none disabled:opacity-50 disabled:pointer-events-none select-none',
  {
    variants: {
      variant: {
        primary: [
          'text-white',
          '[background:var(--brand-violet)]',
          'hover:[background:var(--brand-violet-hi)]',
          'active:[background:var(--brand-violet-lo)]',
        ],
        secondary: [
          '[color:var(--mono-graphite)]',
          '[background:var(--mono-pearl)]',
          'border border-[color:var(--mono-silver)]',
          'hover:[background:var(--mono-white)]',
        ],
        ghost: [
          '[color:var(--mono-slate)]',
          'hover:[background:var(--mono-pearl)]',
          'active:[background:var(--mono-silver)]',
        ],
        destructive: [
          'text-white',
          '[background:var(--functional-fail)]',
          'hover:opacity-90',
        ],
        success: [
          'text-white',
          '[background:var(--functional-pass)]',
          'hover:opacity-90',
        ],
        outline: [
          '[color:var(--brand-violet)]',
          'border border-[color:var(--brand-violet)]',
          '[background:var(--brand-violet-bg)]',
          'hover:[background:var(--brand-violet)]',
          'hover:text-white',
        ],
      },
      size: {
        xs: 'h-7 px-2.5 text-xs gap-1',
        sm: 'h-8 px-3 text-sm',
        md: 'h-10 px-4 text-sm',
        lg: 'h-11 px-5 text-base',
        xl: 'h-12 px-6 text-base',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, loading, children, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        disabled={disabled || loading}
        aria-busy={loading}
        {...props}
      >
        {loading && (
          <span className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
        )}
        {children}
      </button>
    );
  },
);

Button.displayName = 'Button';
