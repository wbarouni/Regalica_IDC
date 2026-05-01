/**
 * Single source of truth for HTTP status codes used by the API.
 *
 * Doctrine
 *   The numerical literals `200`, `201`, `400`, `401`, `403`, `404`,
 *   `413`, `422`, `500`, `501`, `503` are protocol constants defined
 *   by RFC 9110 §15 and RFC 6585. They are NOT business values —
 *   their meaning does not change with deployment, tenant, or
 *   operator config. Per the project doctrine ("zéro hardcoding"
 *   includes protocol constants), every occurrence in route handlers
 *   must reference one of the named exports below rather than emit
 *   the digit. This guarantees a single grep target should the API
 *   ever migrate to a typed-status library and gives every reviewer
 *   a one-line RFC anchor.
 *
 * References
 *   RFC 9110 §15.3 (200, 201)
 *   RFC 9110 §15.5 (400, 401, 403, 404, 413, 422)
 *   RFC 9110 §15.6 (500, 501, 503)
 */

export const HTTP_OK = 200;
export const HTTP_CREATED = 201;

export const HTTP_BAD_REQUEST = 400;
export const HTTP_UNAUTHORIZED = 401;
export const HTTP_FORBIDDEN = 403;
export const HTTP_NOT_FOUND = 404;
export const HTTP_PAYLOAD_TOO_LARGE = 413;
export const HTTP_UNPROCESSABLE_CONTENT = 422;

export const HTTP_INTERNAL_SERVER_ERROR = 500;
export const HTTP_NOT_IMPLEMENTED = 501;
export const HTTP_SERVICE_UNAVAILABLE = 503;
