import { renderHook, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useEventSource } from './useEventSource';

// jsdom does not provide a real EventSource. We register a controllable
// mock on globalThis so each test can drive open / message / error /
// close transitions deterministically.

interface MockEventSourceLike {
  url: string;
  withCredentials: boolean;
  readyState: number;
  listeners: Map<string, Set<EventListener>>;
  onopen: ((this: MockEventSourceLike, ev: Event) => void) | null;
  onerror: ((this: MockEventSourceLike, ev: Event) => void) | null;
  close: () => void;
  addEventListener: (type: string, listener: EventListener) => void;
  removeEventListener: (type: string, listener: EventListener) => void;
  emit: (type: string, data: string) => void;
  triggerOpen: () => void;
  triggerError: (closed: boolean) => void;
}

const instances: MockEventSourceLike[] = [];

class MockEventSource implements MockEventSourceLike {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 2;

  url: string;
  withCredentials: boolean;
  readyState = MockEventSource.CONNECTING;
  listeners = new Map<string, Set<EventListener>>();
  onopen: ((this: MockEventSourceLike, ev: Event) => void) | null = null;
  onerror: ((this: MockEventSourceLike, ev: Event) => void) | null = null;

  constructor(url: string, init?: { withCredentials?: boolean }) {
    this.url = url;
    this.withCredentials = init?.withCredentials ?? false;
    instances.push(this);
  }

  addEventListener(type: string, listener: EventListener): void {
    let set = this.listeners.get(type);
    if (set === undefined) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(listener);
  }

  removeEventListener(type: string, listener: EventListener): void {
    this.listeners.get(type)?.delete(listener);
  }

  close(): void {
    this.readyState = MockEventSource.CLOSED;
  }

  emit(type: string, data: string): void {
    const event = new MessageEvent(type, { data });
    for (const l of this.listeners.get(type) ?? []) {
      l(event);
    }
  }

  triggerOpen(): void {
    this.readyState = MockEventSource.OPEN;
    this.onopen?.call(this, new Event('open'));
  }

  triggerError(closed: boolean): void {
    if (closed) {
      this.readyState = MockEventSource.CLOSED;
    }
    this.onerror?.call(this, new Event('error'));
  }
}

const RUN_ID = '00000000-0000-7000-8000-000000000099';

beforeEach(() => {
  instances.length = 0;
  vi.stubGlobal('EventSource', MockEventSource);
  // VITE_API_URL must be defined for the hook to open the stream;
  // jsdom's import.meta.env carries Vite test defaults but not this
  // var, so we inject it through the Node process the hook resolves
  // against (apps/web/src/lib/config.ts reads import.meta.env at
  // module load — for unit tests we re-stub the lib in tests that
  // need it).
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

vi.mock('../lib/config', () => ({
  API_URL: 'http://api.test',
  CHATBOT_URL: 'http://chatbot.test',
  TENANT_ID: '00000000-0000-7000-8000-0000000000aa',
  USER_ID: '00000000-0000-7000-8000-0000000000bb',
}));

describe('useEventSource', () => {
  it('does not open a connection when runId is null', () => {
    renderHook(() => useEventSource(null));
    expect(instances).toHaveLength(0);
  });

  it('opens the API stream URL when runId is provided', () => {
    renderHook(() => useEventSource(RUN_ID));
    expect(instances).toHaveLength(1);
    expect(instances[0]!.url).toContain(RUN_ID);
    expect(instances[0]!.url).toContain('/runs/');
    expect(instances[0]!.url.startsWith('http://api.test')).toBe(true);
    expect(instances[0]!.withCredentials).toBe(true);
  });

  it('uses a custom path builder when provided', () => {
    const builder = (id: string): string => `/custom/${id}/stream`;
    renderHook(() => useEventSource(RUN_ID, builder));
    expect(instances[0]!.url).toBe(`http://api.test/custom/${RUN_ID}/stream`);
  });

  it('subscribe registers a listener that receives parsed JSON payloads', () => {
    const { result } = renderHook(() => useEventSource(RUN_ID));
    const handler = vi.fn();
    act(() => {
      result.current.subscribe('agent_step', handler);
    });
    act(() => {
      instances[0]!.triggerOpen();
    });
    act(() => {
      instances[0]!.emit('agent_step', JSON.stringify({ stepId: 'abc', status: 'done' }));
    });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ stepId: 'abc', status: 'done' });
  });

  it('subscribe returned unsubscribe stops the handler from firing', () => {
    const { result } = renderHook(() => useEventSource(RUN_ID));
    const handler = vi.fn();
    let off: (() => void) | undefined;
    act(() => {
      off = result.current.subscribe('progress', handler);
    });
    act(() => {
      off?.();
    });
    act(() => {
      instances[0]!.emit('progress', JSON.stringify({ pct: 0.5 }));
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it('reports ready=true after onopen fires and false on error+CLOSED', () => {
    const { result } = renderHook(() => useEventSource(RUN_ID));
    expect(result.current.ready).toBe(false);
    act(() => {
      instances[0]!.triggerOpen();
    });
    expect(result.current.ready).toBe(true);
    act(() => {
      instances[0]!.triggerError(true);
    });
    expect(result.current.ready).toBe(false);
  });

  it('reconnects with a backoff schedule (1s, 2s, 4s) when the stream closes', () => {
    vi.useFakeTimers();
    renderHook(() => useEventSource(RUN_ID));
    expect(instances).toHaveLength(1);
    act(() => {
      instances[0]!.triggerError(true);
    });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(instances).toHaveLength(2);
    act(() => {
      instances[1]!.triggerError(true);
    });
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(instances).toHaveLength(3);
    act(() => {
      instances[2]!.triggerError(true);
    });
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(instances).toHaveLength(4);
  });

  it('does not reconnect when the error keeps the connection alive', () => {
    vi.useFakeTimers();
    renderHook(() => useEventSource(RUN_ID));
    act(() => {
      instances[0]!.triggerError(false);
    });
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(instances).toHaveLength(1);
  });

  it('closes the EventSource and clears the timer on unmount', () => {
    vi.useFakeTimers();
    const { unmount } = renderHook(() => useEventSource(RUN_ID));
    act(() => {
      instances[0]!.triggerError(true);
    });
    unmount();
    act(() => {
      vi.advanceTimersByTime(10000);
    });
    // The pending reconnect must have been cancelled — the post-unmount
    // tick must not spawn a fresh EventSource.
    expect(instances).toHaveLength(1);
    expect(instances[0]!.readyState).toBe(MockEventSource.CLOSED);
  });

  it('closes the existing source when runId changes', () => {
    const { rerender } = renderHook(({ id }) => useEventSource(id), {
      initialProps: { id: RUN_ID as string | null },
    });
    expect(instances).toHaveLength(1);
    const first = instances[0]!;
    rerender({ id: '00000000-0000-7000-8000-000000000077' });
    expect(first.readyState).toBe(MockEventSource.CLOSED);
    expect(instances).toHaveLength(2);
    expect(instances[1]!.url).toContain('000000000077');
  });
});
