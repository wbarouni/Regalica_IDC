import { useEffect, useRef, useState } from 'react';

import { SSE_RECONNECT_BASE_MS } from '../constants/ui';
import { API_URL } from '../lib/config';

/**
 * useEventSource — typed SSE subscription with auto-reconnect.
 *
 * Opens an EventSource against the API stream endpoint for `runId`
 * (closed when `runId` is null). Each call to the returned
 * `subscribe(eventType, handler)` registers a listener for one named
 * SSE event and returns an unsubscribe.
 *
 * Reconnect: when the underlying EventSource transitions to CLOSED
 * (network drop, server restart) the hook reopens with a 1s -> 2s ->
 * 4s -> ... bounded backoff. The cap is read from platform_config in
 * a follow-up; for now the ceiling lives in CSS-time-units land — see
 * the constants file referenced below.
 *
 * Cleanup: closes the connection and clears the pending reconnect
 * timer in the effect cleanup. Never leaks a socket across renders.
 *
 * Why not a third-party library: native EventSource is part of the
 * lib.dom typings; adding a wrapper buys us nothing besides another
 * lockfile entry, and Guard A would block any reasonable candidate
 * we tried to introduce here.
 */

export type SseHandler = (data: unknown) => void;
export type SseUnsubscribe = () => void;
export type SseSubscribe = (eventType: string, handler: SseHandler) => SseUnsubscribe;

export interface UseEventSourceResult {
  subscribe: SseSubscribe;
  ready: boolean;
}

export function useEventSource(
  runId: string | null,
  pathBuilder: (runId: string) => string = defaultPath,
): UseEventSourceResult {
  const sourceRef = useRef<EventSource | null>(null);
  const handlersRef = useRef<Map<string, Set<SseHandler>>>(new Map());
  const wrappersRef = useRef<Map<string, EventListener>>(new Map());
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attemptRef = useRef<number>(0);
  const [ready, setReady] = useState<boolean>(false);

  useEffect(() => {
    if (runId === null) {
      return;
    }
    if (API_URL === undefined || API_URL === '') {
      return;
    }

    const url = `${API_URL}${pathBuilder(runId)}`;

    function attachHandlers(es: EventSource): void {
      for (const eventType of handlersRef.current.keys()) {
        ensureWrapper(es, eventType);
      }
    }

    function ensureWrapper(es: EventSource, eventType: string): void {
      if (wrappersRef.current.has(eventType)) {
        return;
      }
      const wrapper: EventListener = (raw) => {
        const handlers = handlersRef.current.get(eventType);
        if (handlers === undefined || handlers.size === 0) {
          return;
        }
        let payload: unknown = null;
        const data = (raw as MessageEvent).data;
        if (typeof data === 'string' && data.length > 0) {
          try {
            payload = JSON.parse(data);
          } catch {
            payload = data;
          }
        }
        for (const h of handlers) {
          try {
            h(payload);
          } catch {
            // Handlers must not abort the stream loop. Errors are
            // swallowed here on purpose; consumers own their own
            // error reporting.
          }
        }
      };
      es.addEventListener(eventType, wrapper);
      wrappersRef.current.set(eventType, wrapper);
    }

    function detachWrappers(es: EventSource | null): void {
      if (es === null) {
        return;
      }
      for (const [eventType, wrapper] of wrappersRef.current.entries()) {
        es.removeEventListener(eventType, wrapper);
      }
      wrappersRef.current.clear();
    }

    function nextDelayMs(attempt: number): number {
      // Exponential backoff capped at 4 attempts of doubling.
      // 0 -> base, 1 -> base*2, 2 -> base*4, 3+ -> base*4. The base
      // (default 1000 ms) is sourced from VITE_SSE_RECONNECT_BASE_MS
      // — Guard D-006 ban on numeric literals > 100 in source code.
      const expo = 1 << Math.min(attempt, 2);
      return SSE_RECONNECT_BASE_MS * expo;
    }

    function open(): void {
      const es = new EventSource(url, { withCredentials: true });
      sourceRef.current = es;
      attachHandlers(es);

      es.onopen = (): void => {
        attemptRef.current = 0;
        setReady(true);
      };
      es.onerror = (): void => {
        setReady(false);
        if (es.readyState === EventSource.CLOSED) {
          detachWrappers(es);
          es.close();
          sourceRef.current = null;
          const delay = nextDelayMs(attemptRef.current);
          attemptRef.current += 1;
          reconnectTimerRef.current = setTimeout(open, delay);
        }
      };
    }

    open();

    return (): void => {
      if (reconnectTimerRef.current !== null) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      const es = sourceRef.current;
      detachWrappers(es);
      if (es !== null) {
        es.close();
      }
      sourceRef.current = null;
      attemptRef.current = 0;
      setReady(false);
    };
    // pathBuilder is treated as stable per call site; switching it
    // mid-mount would re-open the stream which is the desired effect.
  }, [runId, pathBuilder]);

  function subscribe(eventType: string, handler: SseHandler): SseUnsubscribe {
    let bucket = handlersRef.current.get(eventType);
    if (bucket === undefined) {
      bucket = new Set();
      handlersRef.current.set(eventType, bucket);
    }
    bucket.add(handler);
    const es = sourceRef.current;
    if (es !== null) {
      // Lazy-attach the underlying listener for this event type the
      // first time a handler subscribes. Subsequent handlers reuse
      // the same wrapper.
      if (!wrappersRef.current.has(eventType)) {
        const wrapper: EventListener = (raw) => {
          const handlers = handlersRef.current.get(eventType);
          if (handlers === undefined || handlers.size === 0) {
            return;
          }
          let payload: unknown = null;
          const data = (raw as MessageEvent).data;
          if (typeof data === 'string' && data.length > 0) {
            try {
              payload = JSON.parse(data);
            } catch {
              payload = data;
            }
          }
          for (const h of handlers) {
            try {
              h(payload);
            } catch {
              // see attachHandlers comment
            }
          }
        };
        es.addEventListener(eventType, wrapper);
        wrappersRef.current.set(eventType, wrapper);
      }
    }
    return (): void => {
      const set = handlersRef.current.get(eventType);
      if (set === undefined) {
        return;
      }
      set.delete(handler);
      if (set.size === 0) {
        handlersRef.current.delete(eventType);
        const wrapper = wrappersRef.current.get(eventType);
        if (wrapper !== undefined && sourceRef.current !== null) {
          sourceRef.current.removeEventListener(eventType, wrapper);
          wrappersRef.current.delete(eventType);
        }
      }
    };
  }

  return { subscribe, ready };
}

function defaultPath(runId: string): string {
  return `/api/tenants/${import.meta.env['VITE_TENANT_ID'] as string}/runs/${runId}/stream`;
}
