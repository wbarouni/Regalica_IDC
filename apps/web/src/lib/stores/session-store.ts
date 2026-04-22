import { create } from 'zustand';

interface SessionState {
  /** Accumulated XML files across multiple uploads (filename → File). */
  accumulatedFiles: Map<string, File>;
  addFiles: (files: File[]) => void;
  removeFile: (name: string) => void;
  clearSession: () => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  accumulatedFiles: new Map(),

  addFiles: (files) =>
    set((state) => {
      const next = new Map(state.accumulatedFiles);
      files.forEach((f) => next.set(f.name, f));
      return { accumulatedFiles: next };
    }),

  removeFile: (name) =>
    set((state) => {
      const next = new Map(state.accumulatedFiles);
      next.delete(name);
      return { accumulatedFiles: next };
    }),

  clearSession: () => set({ accumulatedFiles: new Map() }),
}));
