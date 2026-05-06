import { fireEvent, render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import i18n from '../lib/i18n';

import { UploadDropZone } from './UploadDropZone';

beforeAll(async () => {
  await i18n.loadLanguages(['fr', 'en', 'ar']);
});

beforeEach(async () => {
  await i18n.changeLanguage('fr');
});

function wrap(ui: React.ReactElement): ReturnType<typeof render> {
  return render(<I18nextProvider i18n={i18n}>{ui}</I18nextProvider>);
}

// jsdom doesn't ship a real DataTransfer; we forge a minimal duck-
// typed object that exposes the two surface fields the dropzone reads
// (`types` for the file-presence check, `files` for the file payload).
function fileDataTransfer(file: File): {
  types: readonly string[];
  files: FileList;
  dropEffect: string;
} {
  const list = {
    0: file,
    length: 1,
    item: (i: number) => (i === 0 ? file : null),
  } as unknown as FileList;
  return {
    types: ['Files'] as const,
    files: list,
    dropEffect: 'copy',
  };
}

describe('<UploadDropZone>', () => {
  it('does not render the overlay until a drag enters the window', () => {
    wrap(
      <UploadDropZone onFileAccepted={vi.fn()}>
        <div>child</div>
      </UploadDropZone>,
    );
    expect(screen.queryByTestId('upload-dropzone-overlay')).toBeNull();
    expect(screen.getByText('child')).toBeTruthy();
  });

  it('shows the overlay when a file drag enters the window', () => {
    wrap(
      <UploadDropZone onFileAccepted={vi.fn()}>
        <div>child</div>
      </UploadDropZone>,
    );
    const file = new File(['<x/>'], 'a.xml', { type: 'application/xml' });
    fireEvent.dragEnter(window, { dataTransfer: fileDataTransfer(file) });
    expect(screen.getByTestId('upload-dropzone-overlay')).toBeTruthy();
    expect(screen.getByText('Déposez votre annexe XML')).toBeTruthy();
  });

  it('forwards the file via onFileAccepted on a valid XML drop', () => {
    const onFileAccepted = vi.fn();
    wrap(
      <UploadDropZone onFileAccepted={onFileAccepted}>
        <div>child</div>
      </UploadDropZone>,
    );
    const file = new File(['<x/>'], 'rcm00.xml', { type: 'application/xml' });
    fireEvent.dragEnter(window, { dataTransfer: fileDataTransfer(file) });
    fireEvent.drop(window, { dataTransfer: fileDataTransfer(file) });
    expect(onFileAccepted).toHaveBeenCalledTimes(1);
    expect(onFileAccepted.mock.calls[0]?.[0]).toBe(file);
  });

  it('rejects non-XML drops with an error toast and does not invoke onFileAccepted', () => {
    const onFileAccepted = vi.fn();
    wrap(
      <UploadDropZone onFileAccepted={onFileAccepted}>
        <div>child</div>
      </UploadDropZone>,
    );
    const file = new File(['hello'], 'note.txt', { type: 'text/plain' });
    fireEvent.dragEnter(window, { dataTransfer: fileDataTransfer(file) });
    fireEvent.drop(window, { dataTransfer: fileDataTransfer(file) });
    expect(onFileAccepted).not.toHaveBeenCalled();
    expect(screen.getByTestId('upload-dropzone-error')).toBeTruthy();
  });

  it('hides overlay & ignores drops when disabled', () => {
    const onFileAccepted = vi.fn();
    wrap(
      <UploadDropZone onFileAccepted={onFileAccepted} disabled>
        <div>child</div>
      </UploadDropZone>,
    );
    const file = new File(['<x/>'], 'a.xml', { type: 'application/xml' });
    fireEvent.dragEnter(window, { dataTransfer: fileDataTransfer(file) });
    expect(screen.queryByTestId('upload-dropzone-overlay')).toBeNull();
    fireEvent.drop(window, { dataTransfer: fileDataTransfer(file) });
    expect(onFileAccepted).not.toHaveBeenCalled();
  });

  it('accepts files matching ".xml" extension even with empty MIME type', () => {
    const onFileAccepted = vi.fn();
    wrap(
      <UploadDropZone onFileAccepted={onFileAccepted}>
        <div>child</div>
      </UploadDropZone>,
    );
    const file = new File(['<x/>'], 'rcm00.XML', { type: '' });
    fireEvent.dragEnter(window, { dataTransfer: fileDataTransfer(file) });
    fireEvent.drop(window, { dataTransfer: fileDataTransfer(file) });
    expect(onFileAccepted).toHaveBeenCalledTimes(1);
  });
});
