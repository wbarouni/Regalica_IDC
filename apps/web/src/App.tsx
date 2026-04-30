import { Routes, Route } from 'react-router-dom';

import { useDir } from './hooks/useDir';
import Filings from './pages/Filings';
import Library from './pages/Library';
import Workspace from './pages/Workspace';

export default function App() {
  useDir();

  return (
    <Routes>
      <Route path="/" element={<Workspace />} />
      <Route path="/workspace" element={<Workspace />} />
      <Route path="/library" element={<Library />} />
      <Route path="/filings" element={<Filings />} />
    </Routes>
  );
}
