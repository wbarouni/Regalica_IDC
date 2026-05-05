import {
  useCallback,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Dock — standalone composer that mirrors the .dock* CSS contract
 * from primitives.css.
 *
 * Owned state:
 *   - the textarea value (single source of truth, parent receives the
 *     trimmed payload via onSend)
 *   - the local file-validation error (rendered above the composer
 *     until the user types or dismisses; parent does not need to know)
 *
 * Doctrine:
 *   - all visible text resolves through i18n (placeholder, hints,
 *     mic title, attach error)
 *   - the marigold tone of the Send button comes from .dock__send in
 *     CSS — no inline color anywhere
 *   - the XML accept list is intentionally narrow: extension OR MIME
 *     match. Anything else surfaces error.invalid_xml_format and the
 *     onFileSelect callback is NOT invoked
 *   - drag-and-drop and the attach button share the same validation
 *     path so behaviour is identical regardless of entry point
 */

const ACCEPTED_EXT = '.xml';
const ACCEPTED_MIMES = new Set<string>(['application/xml', 'text/xml']);

function isXmlFile(file: File): boolean {
  if (ACCEPTED_MIMES.has(file.type)) {
    return true;
  }
  return file.name.toLowerCase().endsWith(ACCEPTED_EXT);
}

export interface DockProps {
  onSend: (text: string) => void;
  onFileSelect?: (file: File) => void;
  loading?: boolean;
  suggestions?: ReactNode;
  // K2 — PDF download trigger. Visible iff parent passes a non-undefined
  // callback (gated upstream on `run.status === 'completed'`). Click
  // forwards a localised trigger message to onSend, which in turn pipes
  // through useChat → /chat/message → router LLM → download_report
  // intent → reporter_pdf specialist + static_response aggregator.
  // Disabled while loading so a user does not stack multiple PDF requests.
  onDownloadReport?: () => void;
}

export function Dock({
  onSend,
  onFileSelect,
  loading = false,
  suggestions,
  onDownloadReport,
}: DockProps): JSX.Element {
  const { t } = useTranslation();
  const [text, setText] = useState<string>('');
  const [fileError, setFileError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleSend = useCallback((): void => {
    const trimmed = text.trim();
    if (trimmed.length === 0 || loading) {
      return;
    }
    onSend(trimmed);
    setText('');
  }, [text, loading, onSend]);

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>): void => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const acceptFile = useCallback(
    (file: File): void => {
      if (!isXmlFile(file)) {
        setFileError(t('error.invalid_xml_format'));
        return;
      }
      setFileError(null);
      onFileSelect?.(file);
    },
    [onFileSelect, t],
  );

  const onAttachClick = useCallback((): void => {
    fileInputRef.current?.click();
  }, []);

  const onFileInputChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>): void => {
      const file = e.target.files?.[0];
      if (file === undefined) {
        return;
      }
      acceptFile(file);
      // Reset the input so re-picking the same file fires onChange again.
      e.target.value = '';
    },
    [acceptFile],
  );

  const onDragOver = useCallback((e: DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const onDrop = useCallback(
    (e: DragEvent<HTMLDivElement>): void => {
      e.preventDefault();
      const file = e.dataTransfer.files?.[0];
      if (file !== undefined) {
        acceptFile(file);
      }
    },
    [acceptFile],
  );

  const sendDisabled = loading || text.trim().length === 0;

  return (
    <div className="dock" onDragOver={onDragOver} onDrop={onDrop}>
      {fileError !== null && (
        <div role="alert" className="dock__error">
          {fileError}
        </div>
      )}
      {suggestions !== undefined && suggestions}
      <div className="dock__composer">
        <textarea
          className="dock__field"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={t('dock.placeholder')}
          rows={1}
          disabled={loading}
        />
        <div className="dock__tools">
          <button
            type="button"
            className="dock__tool"
            onClick={onAttachClick}
            disabled={loading}
            aria-label={t('dock.placeholder')}
            data-testid="dock-attach"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <button
            type="button"
            className="dock__tool"
            aria-disabled="true"
            disabled
            title={t('dock.placeholder')}
            data-testid="dock-mic"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <rect
                x="9"
                y="2"
                width="6"
                height="12"
                rx="3"
                stroke="currentColor"
                strokeWidth="1.6"
              />
              <path
                d="M5 11a7 7 0 0 0 14 0M12 19v3"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept={`${ACCEPTED_EXT},application/xml,text/xml`}
            style={{ display: 'none' }}
            onChange={onFileInputChange}
            data-testid="dock-file-input"
          />
          {onDownloadReport !== undefined && (
            <button
              type="button"
              className="dock__tool"
              onClick={onDownloadReport}
              disabled={loading}
              title={t('dock.download_pdf.title')}
              aria-label={t('dock.download_pdf.label')}
              data-testid="dock-download-pdf"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinejoin="round"
                />
                <path
                  d="M14 3v5h5M12 12v6m-3-3 3 3 3-3"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          )}
          <button
            type="button"
            className="dock__send"
            onClick={handleSend}
            disabled={sendDisabled}
            data-testid="dock-send"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </div>
      <div className="dock__hint-row">
        <span className="mono">{t('dock.hint_send')}</span>
        <span className="mono">{t('dock.hint_newline')}</span>
      </div>
    </div>
  );
}
