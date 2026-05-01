import { EventEmitter } from 'node:events';
import type { Pool } from 'pg';

import { logger } from '../logger.js';
import { getPlatformConfigNumber } from './platformConfig.js';

/**
 * In-process event bus for run-scoped progress streaming.
 *
 * The validation engine (apps/chatbot-py) and the API write
 * `run_agent_steps` rows; on every transition they call the matching
 * `emit*` helper below. The SSE endpoint `/runs/:runId/stream`
 * subscribes via `subscribeRunEvents`, forwards each payload to the
 * connected browser as a typed `event:` frame, and unsubscribes when
 * the request closes.
 *
 * Single-process by design — Phase 6 will swap this for LISTEN/NOTIFY
 * over Postgres so events survive process restarts and span horizontal
 * replicas. The emit helpers and event types stay stable across that
 * migration.
 *
 * Listener cap (`bus.setMaxListeners`) is operator-controlled via
 * platform_config.sse_max_listeners — `configureRunEventBus(pool)`
 * loads the value and applies it. Call exactly once at app boot
 * before any SSE client connects.
 */

export type RunEventType = 'agent_step' | 'progress' | 'complete' | 'error';

export interface AgentStepEvent {
  stepId: string;
  agentType: string;
  functionName: string;
  status: 'pending' | 'current' | 'done' | 'error';
  ordinal: number;
  durationMs: number | null;
}

export interface ProgressEvent {
  rulesEvaluated: number;
  rulesTotal: number;
  pctComplete: number;
}

export interface CompleteEvent {
  runId: string;
  pass: number;
  fail: number;
  durationMs: number;
}

export interface ErrorEvent {
  code: string;
  message: string;
}

export type RunEventPayload = AgentStepEvent | ProgressEvent | CompleteEvent | ErrorEvent;

interface RunEvent {
  type: RunEventType;
  payload: RunEventPayload;
}

const bus = new EventEmitter();

function channel(runId: string): string {
  return `run:${runId}`;
}

/**
 * Apply the operator-controlled listener cap from platform_config.
 * Idempotent: callers may invoke it multiple times (a re-config on a
 * platform_config update would rebound the cap). Failures are logged
 * but never thrown — the bus stays usable with Node's default cap (10)
 * until the configuration succeeds.
 */
export async function configureRunEventBus(pool: Pool): Promise<void> {
  try {
    const limit = await getPlatformConfigNumber(pool, 'sse_max_listeners');
    bus.setMaxListeners(limit);
    logger.info({ limit }, 'runEventBus listener cap configured from platform_config');
  } catch (err) {
    logger.error(
      { err: err instanceof Error ? err.message : String(err) },
      'runEventBus configuration failed; falling back to Node default cap',
    );
  }
}

/**
 * Test-only escape hatch — read the current EventEmitter listener cap.
 * Used by `runEventBus.test.ts` to assert that `configureRunEventBus`
 * actually applied the platform_config value.
 */
export function getRunEventBusMaxListeners(): number {
  return bus.getMaxListeners();
}

export function emitAgentStep(runId: string, payload: AgentStepEvent): void {
  bus.emit(channel(runId), { type: 'agent_step', payload });
}

export function emitProgress(runId: string, payload: ProgressEvent): void {
  bus.emit(channel(runId), { type: 'progress', payload });
}

export function emitComplete(runId: string, payload: CompleteEvent): void {
  bus.emit(channel(runId), { type: 'complete', payload });
}

export function emitError(runId: string, payload: ErrorEvent): void {
  bus.emit(channel(runId), { type: 'error', payload });
}

/**
 * Subscribe to a run's event stream. Returns an unsubscribe function
 * the caller MUST invoke on cleanup (request close, process shutdown);
 * leaking subscriptions causes the EventEmitter listener cap warning
 * and slow memory growth.
 */
export function subscribeRunEvents(runId: string, handler: (event: RunEvent) => void): () => void {
  bus.on(channel(runId), handler);
  return () => {
    bus.off(channel(runId), handler);
  };
}
