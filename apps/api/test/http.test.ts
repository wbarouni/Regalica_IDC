import {
  HTTP_BAD_REQUEST,
  HTTP_CREATED,
  HTTP_FORBIDDEN,
  HTTP_INTERNAL_SERVER_ERROR,
  HTTP_NOT_FOUND,
  HTTP_NOT_IMPLEMENTED,
  HTTP_OK,
  HTTP_PAYLOAD_TOO_LARGE,
  HTTP_SERVICE_UNAVAILABLE,
  HTTP_UNAUTHORIZED,
  HTTP_UNPROCESSABLE_CONTENT,
} from '../src/lib/http';

/**
 * Pin the named HTTP status constants to their RFC 9110 / 6585 numeric
 * values. The route handlers rely on these names being exact — a typo
 * (e.g. HTTP_OK = 201 by accident) would silently change every route's
 * success response code without any test failing in a route-specific
 * suite. This snapshot test catches that class of regression at the
 * library boundary.
 */

describe('lib/http — RFC-pinned status code constants', () => {
  const expectations: [string, number, number][] = [
    ['HTTP_OK', HTTP_OK, 200],
    ['HTTP_CREATED', HTTP_CREATED, 201],
    ['HTTP_BAD_REQUEST', HTTP_BAD_REQUEST, 400],
    ['HTTP_UNAUTHORIZED', HTTP_UNAUTHORIZED, 401],
    ['HTTP_FORBIDDEN', HTTP_FORBIDDEN, 403],
    ['HTTP_NOT_FOUND', HTTP_NOT_FOUND, 404],
    ['HTTP_PAYLOAD_TOO_LARGE', HTTP_PAYLOAD_TOO_LARGE, 413],
    ['HTTP_UNPROCESSABLE_CONTENT', HTTP_UNPROCESSABLE_CONTENT, 422],
    ['HTTP_INTERNAL_SERVER_ERROR', HTTP_INTERNAL_SERVER_ERROR, 500],
    ['HTTP_NOT_IMPLEMENTED', HTTP_NOT_IMPLEMENTED, 501],
    ['HTTP_SERVICE_UNAVAILABLE', HTTP_SERVICE_UNAVAILABLE, 503],
  ];

  it.each(expectations)('%s equals %s', (_name, actual, expected) => {
    expect(actual).toBe(expected);
  });

  it('every constant is a valid HTTP status code (100..599)', () => {
    for (const [, value] of expectations) {
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(100);
      expect(value).toBeLessThanOrEqual(599);
    }
  });
});
