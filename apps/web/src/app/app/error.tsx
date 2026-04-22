'use client';

import { useEffect } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // In production, forward to error monitoring
  }, [error]);

  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="max-w-sm w-full p-6 rounded-2xl border border-white/40 bg-white/65 backdrop-blur-[12px] shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
        <div className="flex items-center gap-3 mb-3">
          <AlertCircle className="text-[#FF3B30]" size={20} />
          <h2 className="text-base font-semibold text-[#1D1D1F]">Erreur de l&apos;espace de travail</h2>
        </div>
        <p className="text-sm text-[#71717A] mb-4">
          Une erreur inattendue s&apos;est produite. Vos données ne sont pas affectées.
        </p>
        <button
          onClick={reset}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#5B4FE4] text-white text-sm font-medium hover:bg-[#4a40d4] transition-colors"
        >
          <RefreshCw size={14} />
          Réessayer
        </button>
      </div>
    </div>
  );
}
