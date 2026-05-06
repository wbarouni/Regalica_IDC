import { useCallback, useEffect, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Fix-2 — full-window drag-and-drop overlay for XML uploads.
 *
 * The previous DnD surface was confined to the chat dock at the bottom
 * of the workspace. Compliance officers regularly tried to drop files
 * onto the empty canvas above and got nothing — the browser's default
 * navigation handler swallowed the file. The world-class pattern used
 * by editors like Notion / Linear / Slack is:
 *   1. Track drag-enter / drag-leave at the WINDOW level so the
 *      overlay surfaces however the file enters the viewport.
 *   2. Render a translucent capture layer over the entire workspace
 *      with a centred drop affordance, message, and accepted format
 *      hint.
 *   3. Validate the dropped file (XML extension or MIME) before
 *      forwarding — invalid drops surface a clear error toast above
 *      the dock for 4 seconds.
 *   4. Counter-pattern leak: dragenter/dragleave fire on every child
 *      element. We guard with a ref counter so the overlay stays
 *      visible while the cursor moves through child elements.
 *
 * The component is render-prop free: it owns the overlay layer + the
 * window-level event listeners, and forwards a single `onFileAccepted`
 * callback to the parent. Children render normally below the overlay.
 */

const ACCEPTED_EXT = '.xml';
const ACCEPTED_MIMES = new Set<string>(['application/xml', 'text/xml']);
const ERROR_TOAST_MS = 4_000;

function isXmlFile(file: File): boolean {
  if (ACCEPTED_MIMES.has(file.type)) return true;
  return file.name.toLowerCase().endsWith(ACCEPTED_EXT);
}

function dragHasFiles(e: DragEvent | globalThis.DragEvent): boolean {
  const types = e.dataTransfer?.types;
  if (types === undefined || types === null) return false;
  for (let i = 0; i < types.length; i += 1) {
    if (types[i] === 'Files') return true;
  }
  return false;
}

export interface UploadDropZoneProps {
  /** Called with the validated XML File. */
  onFileAccepted: (file: File) => void;
  /** Disable the drop affordance entirely (e.g. while a run is starting). */
  disabled?: boolean;
  /** Page content rendered below the drop overlay. */
  children: ReactNode;
}

export function UploadDropZone({
  onFileAccepted,
  disabled = false,
  children,
}: UploadDropZoneProps): JSX.Element {
  const { t } = useTranslation();
  const [dragActive, setDragActive] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  // Counter pattern — `dragenter` / `dragleave` fire for every child
  // node. We increment on enter / decrement on leave; the overlay is
  // only hidden when the counter returns to zero (cursor truly left
  // the window).
  const dragCounter = useRef<number>(0);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showError = useCallback((code: string): void => {
    setError(code);
    if (errorTimerRef.current !== null) clearTimeout(errorTimerRef.current);
    errorTimerRef.current = setTimeout(() => {
      setError(null);
      errorTimerRef.current = null;
    }, ERROR_TOAST_MS);
  }, []);

  useEffect(() => {
    return () => {
      if (errorTimerRef.current !== null) clearTimeout(errorTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (disabled) {
      setDragActive(false);
      dragCounter.current = 0;
      return;
    }
    const onWindowDragEnter = (e: globalThis.DragEvent): void => {
      if (!dragHasFiles(e)) return;
      dragCounter.current += 1;
      setDragActive(true);
    };
    const onWindowDragLeave = (e: globalThis.DragEvent): void => {
      if (!dragHasFiles(e)) return;
      dragCounter.current = Math.max(0, dragCounter.current - 1);
      if (dragCounter.current === 0) setDragActive(false);
    };
    const onWindowDragOver = (e: globalThis.DragEvent): void => {
      if (!dragHasFiles(e)) return;
      e.preventDefault();
      if (e.dataTransfer !== null) e.dataTransfer.dropEffect = 'copy';
    };
    const onWindowDrop = (e: globalThis.DragEvent): void => {
      if (!dragHasFiles(e)) return;
      e.preventDefault();
      dragCounter.current = 0;
      setDragActive(false);
      const file = e.dataTransfer?.files?.[0];
      if (file === undefined) {
        showError('error.invalid_xml_format');
        return;
      }
      if (!isXmlFile(file)) {
        showError('error.invalid_xml_format');
        return;
      }
      onFileAccepted(file);
    };
    window.addEventListener('dragenter', onWindowDragEnter);
    window.addEventListener('dragleave', onWindowDragLeave);
    window.addEventListener('dragover', onWindowDragOver);
    window.addEventListener('drop', onWindowDrop);
    return () => {
      window.removeEventListener('dragenter', onWindowDragEnter);
      window.removeEventListener('dragleave', onWindowDragLeave);
      window.removeEventListener('dragover', onWindowDragOver);
      window.removeEventListener('drop', onWindowDrop);
    };
  }, [disabled, onFileAccepted, showError]);

  return (
    <>
      {children}
      {dragActive && !disabled && (
        <div
          data-testid="upload-dropzone-overlay"
          aria-live="polite"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: 'rgba(252, 244, 224, 0.92)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
            backdropFilter: 'blur(2px)',
            transition: 'opacity 120ms ease',
          }}
        >
          <div
            style={{
              border: '2px dashed var(--marigold-500, #c08a3e)',
              borderRadius: '12px',
              padding: '48px 64px',
              background: 'var(--paper-pure, #fffdf8)',
              textAlign: 'center',
              maxWidth: '480px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.08)',
            }}
          >
            <div
              style={{
                fontSize: '48px',
                lineHeight: 1,
                marginBottom: '16px',
                color: 'var(--marigold-600, #a36e2c)',
                fontWeight: 200,
              }}
              aria-hidden="true"
            >
              ↓
            </div>
            <h2
              style={{
                fontSize: '18px',
                fontWeight: 500,
                color: 'var(--ink, #1a1a1a)',
                margin: '0 0 8px',
              }}
            >
              {t('upload.dropZone.title', { defaultValue: 'Déposez votre annexe XML' })}
            </h2>
            <p
              style={{
                fontSize: '13px',
                color: 'var(--stone-600, #6b6b6b)',
                margin: 0,
                lineHeight: 1.5,
              }}
            >
              {t('upload.dropZone.subtitle', {
                defaultValue:
                  'Format XML BCT. Le fichier sera ingéré puis vérifié avant validation.',
              })}
            </p>
          </div>
        </div>
      )}
      {error !== null && (
        <div
          data-testid="upload-dropzone-error"
          role="alert"
          style={{
            position: 'fixed',
            bottom: '120px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 10000,
            padding: '10px 18px',
            background: 'var(--vermilion-50, #fdecea)',
            color: 'var(--vermilion-800, #8a1c0e)',
            border: '1px solid var(--vermilion-200, #f4a89e)',
            borderRadius: '6px',
            fontSize: '13px',
            fontFamily: 'inherit',
            boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
          }}
        >
          {t(error, {
            defaultValue: 'Format invalide — seuls les fichiers XML sont acceptés.',
          })}
        </div>
      )}
    </>
  );
}
