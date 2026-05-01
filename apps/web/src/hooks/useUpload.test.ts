import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useUpload, UploadError } from './useUpload';

vi.mock('../lib/config', () => ({
  API_URL: 'http://api.test',
  CHATBOT_URL: 'http://chatbot.test',
  TENANT_ID: '00000000-0000-7000-8000-0000000000aa',
  USER_ID: '00000000-0000-7000-8000-0000000000bb',
}));

interface MockXhr {
  open: ReturnType<typeof vi.fn>;
  setRequestHeader: ReturnType<typeof vi.fn>;
  send: ReturnType<typeof vi.fn>;
  abort: ReturnType<typeof vi.fn>;
  upload: { onprogress: ((ev: ProgressEvent) => void) | null };
  onload: (() => void) | null;
  onerror: (() => void) | null;
  onabort: (() => void) | null;
  responseText: string;
  status: number;
}

let lastXhr: MockXhr | null;

function makeMockXhr(): MockXhr {
  const xhr: MockXhr = {
    open: vi.fn(),
    setRequestHeader: vi.fn(),
    send: vi.fn(),
    abort: vi.fn(),
    upload: { onprogress: null },
    onload: null,
    onerror: null,
    onabort: null,
    responseText: '',
    status: 0,
  };
  lastXhr = xhr;
  return xhr;
}

describe('useUpload', () => {
  let originalXhr: typeof XMLHttpRequest;

  beforeEach(() => {
    originalXhr = globalThis.XMLHttpRequest;
    lastXhr = null;
    (globalThis as { XMLHttpRequest: unknown }).XMLHttpRequest = vi
      .fn()
      .mockImplementation(makeMockXhr);
  });

  afterEach(() => {
    (globalThis as { XMLHttpRequest: unknown }).XMLHttpRequest = originalXhr;
    vi.restoreAllMocks();
  });

  it('POSTs multipart to /uploads with X-User-Id and resolves the data envelope', async () => {
    const { result } = renderHook(() => useUpload());
    const file = new File(['<x/>'], 'rsm630.xml', { type: 'application/xml' });
    const promise = act(async () => {
      const p = result.current.upload(file);
      // Drive the mock XHR before awaiting.
      await waitFor(() => expect(lastXhr).not.toBeNull());
      const xhr = lastXhr as MockXhr;
      xhr.responseText = JSON.stringify({
        data: {
          upload_id: '11111111-1111-7111-8111-111111111111',
          filename: 'rsm630.xml',
          annexe_code: 'RSM630',
          arrete_date: '2024-03-31',
          size_bytes: 4,
          deduplicated: false,
          status: 'received',
        },
        meta: { ts: '', version: '1' },
      });
      xhr.status = 201;
      xhr.onload?.();
      const dto = await p;
      expect(dto.upload_id).toBe('11111111-1111-7111-8111-111111111111');
      expect(dto.annexe_code).toBe('RSM630');
    });
    await promise;
    const xhr = lastXhr as MockXhr;
    expect(xhr.open).toHaveBeenCalledWith(
      'POST',
      'http://api.test/api/tenants/00000000-0000-7000-8000-0000000000aa/uploads',
    );
    expect(xhr.setRequestHeader).toHaveBeenCalledWith(
      'X-User-Id',
      '00000000-0000-7000-8000-0000000000bb',
    );
    expect(xhr.send).toHaveBeenCalledTimes(1);
    expect(result.current.progress).toBe(100);
    expect(result.current.error).toBeNull();
  });

  it('reaches 100% on a successful upload', async () => {
    const { result } = renderHook(() => useUpload());
    const file = new File(['x'], 'a.xml', { type: 'application/xml' });
    await act(async () => {
      const p = result.current.upload(file);
      await waitFor(() => expect(lastXhr).not.toBeNull());
      const xhr = lastXhr as MockXhr;
      xhr.responseText = JSON.stringify({
        data: {
          upload_id: 'x',
          filename: 'a.xml',
          annexe_code: 'X',
          arrete_date: '2024-03-31',
          size_bytes: 1,
          deduplicated: false,
          status: 'received',
        },
        meta: { ts: '', version: '1' },
      });
      xhr.status = 201;
      xhr.onload?.();
      await p;
    });
    expect(result.current.progress).toBe(100);
  });

  it('rejects with the API error code on non-2xx', async () => {
    const { result } = renderHook(() => useUpload());
    const file = new File(['x'], 'a.xml', { type: 'application/xml' });
    let caught: unknown = null;
    await act(async () => {
      const p = result.current.upload(file);
      await waitFor(() => expect(lastXhr).not.toBeNull());
      const xhr = lastXhr as MockXhr;
      xhr.responseText = JSON.stringify({
        error: { code: 'UPLOAD_TOO_LARGE', message: 'too big' },
      });
      xhr.status = 413;
      xhr.onload?.();
      caught = await p.catch((e: unknown) => e);
    });
    expect(caught).toBeInstanceOf(UploadError);
    expect((caught as UploadError).code).toBe('UPLOAD_TOO_LARGE');
    expect((caught as UploadError).status).toBe(413);
    expect(result.current.error).toBe('UPLOAD_TOO_LARGE');
    expect(result.current.uploading).toBe(false);
  });

  it('rejects with NETWORK_ERROR when XHR.onerror fires', async () => {
    const { result } = renderHook(() => useUpload());
    const file = new File(['x'], 'a.xml', { type: 'application/xml' });
    let caught: unknown = null;
    await act(async () => {
      const p = result.current.upload(file);
      await waitFor(() => expect(lastXhr).not.toBeNull());
      (lastXhr as MockXhr).onerror?.();
      caught = await p.catch((e: unknown) => e);
    });
    expect((caught as UploadError).code).toBe('NETWORK_ERROR');
    expect(result.current.error).toBe('NETWORK_ERROR');
  });
});
