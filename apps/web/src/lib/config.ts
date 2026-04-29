/**
 * Runtime configuration sourced exclusively from VITE_* env vars.
 *
 * No defaults are baked into source: missing values surface as
 * `undefined` and the consuming hooks/components surface a typed
 * error to the user. This keeps Guard D's no-hardcoded-URL rule
 * happy and forces the operator to declare the deployment in
 * .env.local (or the equivalent CI / docker-compose env block).
 *
 * The .env.example file is the canonical list of supported
 * variables.
 */

export const API_URL = import.meta.env['VITE_API_URL'] as string | undefined;
export const CHATBOT_URL = import.meta.env['VITE_CHATBOT_URL'] as string | undefined;
export const TENANT_ID = import.meta.env['VITE_TENANT_ID'] as string | undefined;
export const USER_ID = import.meta.env['VITE_USER_ID'] as string | undefined;
export const TENANT_DISPLAY_NAME = import.meta.env['VITE_TENANT_DISPLAY_NAME'] as
  | string
  | undefined;

const rawPageSize = import.meta.env['VITE_DEFAULT_PAGE_SIZE'] as string | undefined;
const parsedPageSize = rawPageSize !== undefined ? Number.parseInt(rawPageSize, 10) : NaN;
export const DEFAULT_PAGE_SIZE =
  Number.isFinite(parsedPageSize) && parsedPageSize > 0 ? parsedPageSize : 50;

export const BRAND_NAME = import.meta.env['VITE_BRAND_NAME'] as string | undefined;
export const PRODUCT_NAME = import.meta.env['VITE_PRODUCT_NAME'] as string | undefined;
