import type { NextFunction, Request, Response } from 'express';

import { CORRELATION_ID_LOCAL, correlationIdMiddleware } from '../src/middleware/correlationId';

/**
 * Pure unit tests for correlationIdMiddleware. No Express server boot —
 * we drive it directly with mock req/res/next, mirroring the established
 * pattern in apps/api/test/runEventBus.test.ts.
 */

interface MockReq {
  header: (name: string) => string | undefined;
  log?: { child?: (b: Record<string, unknown>) => unknown };
}

function buildReq(headerValue: string | undefined): MockReq {
  return {
    header(name: string): string | undefined {
      return name.toLowerCase() === 'x-correlation-id' ? headerValue : undefined;
    },
  };
}

interface MockRes {
  locals: Record<string, unknown>;
  setHeader: jest.Mock;
}

function buildRes(): MockRes {
  return {
    locals: {},
    setHeader: jest.fn(),
  };
}

const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('middleware/correlationId', () => {
  it('generates a fresh UUID v4 when the header is absent', () => {
    const req = buildReq(undefined);
    const res = buildRes();
    const next: NextFunction = jest.fn();

    correlationIdMiddleware(req as unknown as Request, res as unknown as Response, next);

    const corr = res.locals[CORRELATION_ID_LOCAL] as string;
    expect(typeof corr).toBe('string');
    expect(UUID_V4_RE.test(corr)).toBe(true);
    expect(res.setHeader).toHaveBeenCalledWith('X-Correlation-Id', corr);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('preserves a well-formed incoming UUID v4 (lowercased)', () => {
    // Lowercase v4
    const validV4 = '00000000-1111-4222-8333-444444444444';
    const req = buildReq(validV4);
    const res = buildRes();
    correlationIdMiddleware(req as unknown as Request, res as unknown as Response, jest.fn());
    expect(res.locals[CORRELATION_ID_LOCAL]).toBe(validV4);

    // Uppercase v4 — accepted shape, output lowercased canonically.
    const upperV4 = 'AAAAAAAA-1111-4222-8333-444444444444';
    const reqUpper = buildReq(upperV4);
    const resUpper = buildRes();
    correlationIdMiddleware(
      reqUpper as unknown as Request,
      resUpper as unknown as Response,
      jest.fn(),
    );
    expect(resUpper.locals[CORRELATION_ID_LOCAL]).toBe(upperV4.toLowerCase());
  });

  it('regenerates a UUID when the incoming header is a UUID v7 (timestamp leakage rejected)', () => {
    // The middleware accepts only RFC 4122 v1-v5. UUID v7 (variant 7,
    // ordered timestamp prefix) leaks server clock info and is rejected.
    const v7 = 'aaaaaaaa-1111-7111-8111-111111111111';
    const req = buildReq(v7);
    const res = buildRes();
    correlationIdMiddleware(req as unknown as Request, res as unknown as Response, jest.fn());
    const corr = res.locals[CORRELATION_ID_LOCAL] as string;
    expect(corr).not.toBe(v7);
    expect(UUID_V4_RE.test(corr)).toBe(true);
  });

  it('regenerates when the incoming header is malformed', () => {
    const malformed = ['not-a-uuid', '', '12345', 'zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz'];
    for (const candidate of malformed) {
      const req = buildReq(candidate);
      const res = buildRes();
      correlationIdMiddleware(req as unknown as Request, res as unknown as Response, jest.fn());
      const corr = res.locals[CORRELATION_ID_LOCAL] as string;
      expect(corr).not.toBe(candidate);
      expect(UUID_V4_RE.test(corr)).toBe(true);
    }
  });

  it('echoes the resolved value back via the X-Correlation-Id response header', () => {
    const req = buildReq(undefined);
    const res = buildRes();
    correlationIdMiddleware(req as unknown as Request, res as unknown as Response, jest.fn());
    const calls = res.setHeader.mock.calls;
    const corrCalls = calls.filter((c) => c[0] === 'X-Correlation-Id');
    expect(corrCalls).toHaveLength(1);
    expect(corrCalls[0]![1]).toBe(res.locals[CORRELATION_ID_LOCAL]);
  });

  it('binds correlation_id to req.log via child() when pino-http is mounted', () => {
    const childMock = jest.fn().mockReturnValue({ info: jest.fn() });
    const req = buildReq(undefined);
    req.log = { child: childMock };
    const res = buildRes();
    correlationIdMiddleware(req as unknown as Request, res as unknown as Response, jest.fn());
    expect(childMock).toHaveBeenCalledTimes(1);
    expect(childMock).toHaveBeenCalledWith({ correlation_id: res.locals[CORRELATION_ID_LOCAL] });
  });

  it('is idempotent: same header → same resolved value across calls', () => {
    const v = '11111111-2222-4333-8444-555555555555';
    const r1 = buildRes();
    const r2 = buildRes();
    correlationIdMiddleware(
      buildReq(v) as unknown as Request,
      r1 as unknown as Response,
      jest.fn(),
    );
    correlationIdMiddleware(
      buildReq(v) as unknown as Request,
      r2 as unknown as Response,
      jest.fn(),
    );
    expect(r1.locals[CORRELATION_ID_LOCAL]).toBe(r2.locals[CORRELATION_ID_LOCAL]);
  });
});
