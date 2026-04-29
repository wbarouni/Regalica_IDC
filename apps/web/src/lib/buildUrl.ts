/**
 * URL builder with param validation.
 *
 * Avoids inline string concatenation for query strings. Skips entries
 * whose value is `undefined` or an empty string so the resulting URL
 * is the minimal one. Callers should pass values straight from React
 * state — the builder never injects defaults.
 */
export function buildUrl(
  path: string,
  params: Record<string, string | number | undefined>,
): string {
  const usp = new URLSearchParams();
  for (const [key, val] of Object.entries(params)) {
    if (val === undefined || val === '') continue;
    usp.set(key, String(val));
  }
  const qs = usp.toString();
  return qs.length > 0 ? `${path}?${qs}` : path;
}
