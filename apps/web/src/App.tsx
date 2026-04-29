import { useTranslation } from 'react-i18next';
import { Routes, Route } from 'react-router-dom';

import { LanguageSwitcher } from './components/primitives/LanguageSwitcher';
import { useDir } from './hooks/useDir';
import Filings from './pages/Filings';
import Library from './pages/Library';
import Workspace from './pages/Workspace';

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
          <Route path="/" element={<Workspace />} />
          <Route path="/workspace" element={<Workspace />} />
          <Route path="/library" element={<Library />} />
          <Route path="/filings" element={<Filings />} />
        </Routes>
      </main>
    </div>
  );
}
