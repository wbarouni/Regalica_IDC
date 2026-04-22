'use client';

import { useEffect } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // In production, forward to error monitoring (Sentry, etc.)
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#FAFAFF] via-white to-[#FAF8FF]">
      <div className="max-w-md w-full mx-4 p-8 rounded-2xl border border-white/40 bg-white/65 backdrop-blur-[12px] shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
        <div className="flex items-center gap-3 mb-4">
          <AlertCircle className="text-[#FF3B30]" size={24} />
          <h1 className="text-lg font-semibold text-[#1D1D1F]">Une erreur est survenue</h1>
        </div>
        <p className="text-sm text-[#71717A] mb-6">
          {error.digest ? `Ref: ${error.digest}` : 'Veuillez recharger la page ou contacter le support.'}
        </p>
        <button
          onClick={reset}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#5B4FE4] text-white text-sm font-medium hover:bg-[#4a40d4] transition-colors"
        >
          <RefreshCw size={14} />
          Recharger
        </button>
      </div>
    </div>
  );
}
