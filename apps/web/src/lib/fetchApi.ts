import { API_URL, USER_ID } from './config';

export interface ApiMeta {
  ts: string;
  version: string;
  [extra: string]: unknown;
}

export interface ApiResponse<T> {
  data: T;
  meta: ApiMeta;
}

interface ApiErrorBody {
  error: { code: string; message: string };
}

/**
 * Domain error thrown by `fetchApi` when the API responds with a
 * non-2xx status. The `code` mirrors the backend `error.code`
 * envelope so callers can branch without inspecting the message.
 */
export class ApiFetchError extends Error {
  public readonly code: string;
  public readonly status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = 'ApiFetchError';
    this.code = code;
    this.status = status;
  }
}

/**
 * Configuration error: API_URL is required, USER_ID is required.
 */
export class ApiConfigError extends Error {
  public readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'ApiConfigError';
    this.code = code;
  }
}

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = (value as { error?: unknown }).error;
  return (
    typeof candidate === 'object' &&
    candidate !== null &&
    typeof (candidate as { code?: unknown }).code === 'string'
  );
}

export async function fetchApi<T>(path: string, options?: RequestInit): Promise<ApiResponse<T>> {
  if (!API_URL) {
    throw new ApiConfigError('MISSING_API_URL', 'VITE_API_URL is not set');
  }
  if (!USER_ID) {
    throw new ApiConfigError('MISSING_USER_ID', 'VITE_USER_ID is not set');
  }
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-User-Id': USER_ID,
  };
  const init: RequestInit = {
    ...options,
    headers: { ...headers, ...(options?.headers as Record<string, string> | undefined) },
  };
  const res = await fetch(`${API_URL}${path}`, init);

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  if (!res.ok) {
    if (isApiErrorBody(body)) {
      throw new ApiFetchError(body.error.code, body.error.message, res.status);
    }
    throw new ApiFetchError('HTTP_ERROR', `Request failed (${res.status})`, res.status);
  }

  return body as ApiResponse<T>;
}
