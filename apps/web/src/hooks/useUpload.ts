import { useCallback, useRef, useState } from 'react';

import { API_URL, TENANT_ID, USER_ID } from '../lib/config';

/**
 * Hook for the multipart XML upload to /api/tenants/:tenantId/uploads.
 *
 * XHR is preferred over fetch() here because the browser exposes
 * native upload-progress events on XMLHttpRequest.upload but NOT on
 * fetch's Request body stream — the only cross-browser way to render
 * a real progress bar without server-side instrumentation. fetch is
 * used everywhere else in the app via fetchApi, but for this single
 * surface the trade-off is justified.
 */

export interface UploadDto {
  upload_id: string;
  filename: string;
  annexe_code: string;
  arrete_date: string;
  size_bytes: number;
  deduplicated: boolean;
  status: string;
}

export interface UseUploadResult {
  uploading: boolean;
  progress: number;
  error: string | null;
  upload: (file: File) => Promise<UploadDto>;
  reset: () => void;
}

interface UploadErrorBody {
  error?: { code?: string; message?: string };
}

function isUploadErrorBody(value: unknown): value is UploadErrorBody {
  return typeof value === 'object' && value !== null && 'error' in value;
}

/**
 * Promise rejection error from upload(). `code` mirrors the API's
 * error.code so callers can branch deterministically (UPLOAD_TOO_LARGE,
 * XML_HEADER_INVALID, MISSING_FILE, MULTIPART_ERROR, …).
 */
export class UploadError extends Error {
  public readonly code: string;
  public readonly status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = 'UploadError';
    this.code = code;
    this.status = status;
  }
}

export function useUpload(): UseUploadResult {
  const [uploading, setUploading] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  // Hold the active XHR so reset() can abort an in-flight upload if the
  // user picks a different file before the first one finishes.
  const activeXhrRef = useRef<XMLHttpRequest | null>(null);

  const reset = useCallback((): void => {
    activeXhrRef.current?.abort();
    activeXhrRef.current = null;
    setUploading(false);
    setProgress(0);
    setError(null);
  }, []);

  const upload = useCallback(async (file: File): Promise<UploadDto> => {
    const apiUrl = API_URL;
    const tenantId = TENANT_ID;
    const userId = USER_ID;
    if (apiUrl === undefined || apiUrl.length === 0) {
      const code = 'MISSING_API_URL';
      setError(code);
      throw new UploadError(code, 'VITE_API_URL is not set', 0);
    }
    if (tenantId === undefined || tenantId.length === 0) {
      const code = 'MISSING_TENANT_ID';
      setError(code);
      throw new UploadError(code, 'VITE_TENANT_ID is not set', 0);
    }
    if (userId === undefined || userId.length === 0) {
      const code = 'MISSING_USER_ID';
      setError(code);
      throw new UploadError(code, 'VITE_USER_ID is not set', 0);
    }

    activeXhrRef.current?.abort();
    setError(null);
    setProgress(0);
    setUploading(true);

    return new Promise<UploadDto>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      activeXhrRef.current = xhr;
      xhr.open('POST', `${apiUrl}/api/tenants/${tenantId}/uploads`);
      xhr.setRequestHeader('X-User-Id', userId);

      xhr.upload.onprogress = (ev: ProgressEvent): void => {
        if (ev.lengthComputable && ev.total > 0) {
          setProgress(Math.round((ev.loaded / ev.total) * 100));
        }
      };

      xhr.onerror = (): void => {
        const err = new UploadError('NETWORK_ERROR', 'Network error during upload', 0);
        setUploading(false);
        setError(err.code);
        activeXhrRef.current = null;
        reject(err);
      };

      xhr.onabort = (): void => {
        // reset() was called - leave state alone; the caller initiated.
        activeXhrRef.current = null;
      };

      xhr.onload = (): void => {
        setUploading(false);
        activeXhrRef.current = null;
        let body: unknown = null;
        try {
          body = JSON.parse(xhr.responseText) as unknown;
        } catch {
          body = null;
        }
        if (xhr.status < 200 || xhr.status >= 300) {
          const code =
            isUploadErrorBody(body) && typeof body.error?.code === 'string'
              ? body.error.code
              : 'HTTP_ERROR';
          const message =
            isUploadErrorBody(body) && typeof body.error?.message === 'string'
              ? body.error.message
              : `Request failed (${xhr.status})`;
          const err = new UploadError(code, message, xhr.status);
          setError(code);
          reject(err);
          return;
        }
        const envelope = body as { data?: UploadDto } | null;
        if (envelope === null || envelope.data === undefined) {
          const err = new UploadError('INVALID_RESPONSE', 'Missing data envelope', xhr.status);
          setError(err.code);
          reject(err);
          return;
        }
        setProgress(100);
        resolve(envelope.data);
      };

      const form = new FormData();
      form.append('file', file, file.name);
      xhr.send(form);
    });
  }, []);

  return { uploading, progress, error, upload, reset };
}
