import { useTranslation } from 'react-i18next';
import { Routes, Route } from 'react-router-dom';

import { LanguageSwitcher } from './components/primitives/LanguageSwitcher';
import { useDir } from './hooks/useDir';

function WorkspacePlaceholder() {
  const { t } = useTranslation();
  const steps = ['step1', 'step2', 'step3'] as const;
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center">
      <div className="w-px h-16 bg-marigold-400 mx-auto" />
      <div>
        <h1 className="font-bold text-xl sm:text-2xl tracking-tight mb-2">{t('nav.workspace')}</h1>
        <p className="text-stone-500 text-sm font-mono">Phase 4 · REGFlow Edition One</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full max-w-md">
        {steps.map((step, i) => (
          <div key={step} className="border border-stone-200 rounded-lg p-3 text-left">
            <div className="text-xs font-mono text-stone-500 mb-1">{i + 1}/3</div>
            <div className="text-xs font-medium">{t(`bct.${step}`)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PagePlaceholder({ tKey }: { tKey: string }) {
  const { t } = useTranslation();
  return <div className="text-stone-500 font-mono text-sm">{t(tKey)} — Phase 4</div>;
}

export default function App() {
  const { t } = useTranslation();
  useDir();

  return (
    <div className="min-h-screen bg-paper text-ink font-sans">
      <header
        className="sticky top-0 z-50 border-b border-stone-200
                   bg-paper/95 backdrop-blur-sm
                   px-4 sm:px-6 md:px-8 lg:px-12
                   h-14 flex items-center justify-between"
      >
        <div className="flex items-center gap-2 sm:gap-3">
          <div
            className="w-7 h-7 sm:w-8 sm:h-8 bg-ink rounded
                       flex items-center justify-center flex-shrink-0"
          >
            <span className="text-paper font-mono font-bold text-xs sm:text-sm">r</span>
          </div>
          <span className="font-bold text-sm tracking-tight hidden sm:block">REGFlow</span>
        </div>

        <nav className="hidden md:flex items-center gap-6" aria-label="Navigation principale">
          <a
            href="/"
            className="text-sm font-medium text-stone-700 hover:text-ink transition-colors"
          >
            {t('nav.workspace')}
          </a>
          <a href="/library" className="text-sm text-stone-500 hover:text-ink transition-colors">
            {t('nav.library')}
          </a>
          <a href="/filings" className="text-sm text-stone-500 hover:text-ink transition-colors">
            {t('nav.filings')}
          </a>
        </nav>

        <LanguageSwitcher />
      </header>

      <main
        className="px-4 sm:px-6 md:px-8 lg:px-12
                   py-6 sm:py-8 lg:py-10
                   max-w-screen-xl mx-auto"
      >
        <Routes>
          <Route path="/" element={<WorkspacePlaceholder />} />
          <Route path="/library" element={<PagePlaceholder tKey="nav.library" />} />
          <Route path="/filings" element={<PagePlaceholder tKey="nav.filings" />} />
        </Routes>
      </main>
    </div>
  );
}
