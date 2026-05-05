import { renderHook, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useProgress } from './useProgress';

// jsdom does not ship EventSource — install a tiny controllable mock so
// each test can drive 'progress' frames deterministically.

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
}

const RUN_ID = '00000000-0000-7000-8000-0000000000c0';

vi.mock('../lib/config', () => ({
  API_URL: 'http://api.test',
  CHATBOT_URL: 'http://chatbot.test',
  TENANT_ID: '00000000-0000-7000-8000-0000000000aa',
  USER_ID: '00000000-0000-7000-8000-0000000000bb',
}));

beforeEach(() => {
  instances.length = 0;
  vi.stubGlobal('EventSource', MockEventSource);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useProgress — K4', () => {
  it('returns null until the first valid progress frame arrives', () => {
    const { result } = renderHook(() => useProgress(RUN_ID));
    expect(result.current.progress).toBeNull();
  });

  it('updates state on a well-formed progress payload', () => {
    const { result } = renderHook(() => useProgress(RUN_ID));
    act(() => {
      instances[0]!.emit(
        'progress',
        JSON.stringify({ rulesEvaluated: 1500, rulesTotal: 4611, pctComplete: 32 }),
      );
    });
    expect(result.current.progress).toEqual({
      rulesEvaluated: 1500,
      rulesTotal: 4611,
      pctComplete: 32,
    });
  });

  it('ignores malformed payloads silently (defensive type-guard)', () => {
    const { result } = renderHook(() => useProgress(RUN_ID));
    act(() => {
      // pctComplete is a string, not a number — should be discarded.
      instances[0]!.emit(
        'progress',
        JSON.stringify({ rulesEvaluated: 100, rulesTotal: 200, pctComplete: '50%' }),
      );
    });
    expect(result.current.progress).toBeNull();
  });

  it('resets to null when runId transitions to null', () => {
    const { result, rerender } = renderHook(({ id }: { id: string | null }) => useProgress(id), {
      initialProps: { id: RUN_ID as string | null },
    });
    act(() => {
      instances[0]!.emit(
        'progress',
        JSON.stringify({ rulesEvaluated: 100, rulesTotal: 200, pctComplete: 50 }),
      );
    });
    expect(result.current.progress).not.toBeNull();
    rerender({ id: null });
    expect(result.current.progress).toBeNull();
  });
});
