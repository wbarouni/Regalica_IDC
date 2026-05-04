import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import { useNavigate } from 'react-router-dom';
import remarkGfm from 'remark-gfm';

import { Artefact } from '../components/Artefact';
import { DaySeparator } from '../components/DaySeparator';
import { Dock } from '../components/Dock';
import { EngineErrorArtefact } from '../components/EngineErrorArtefact';
import { FailsTable } from '../components/FailsTable';
import { LaunchErrorArtefact } from '../components/LaunchErrorArtefact';
import { SuggestionChips } from '../components/SuggestionChips';
import { LanguageSwitcher } from '../components/primitives/LanguageSwitcher';
import { PersonaSidebar } from '../components/layout/PersonaSidebar';
import { useAgentSteps } from '../hooks/useAgentSteps';
import { useChat, type ChatMessage } from '../hooks/useChat';
import { useCurrentRun } from '../hooks/useCurrentRun';
import { useEventSource } from '../hooks/useEventSource';
import { useNotifications } from '../hooks/useNotifications';
import { useRunSummary } from '../hooks/useRunSummary';
import { useStartRun } from '../hooks/useStartRun';
import { useUpload, type UploadDto } from '../hooks/useUpload';
import type { Notification, RunAgentStep, ValidationRun } from '../types/api';
import { groupByDay } from '../utils/groupByDay';

function ConfigMissingState({ missing }: { missing: string }) {
  const { t } = useTranslation();
  return (
    <div className="rounded-lg border border-vermilion-200 bg-vermilion-50 p-6 text-sm">
      <div className="font-mono text-xs uppercase tracking-wider text-vermilion-700 mb-2">
        {t('error.configMissing')}
      </div>
      <p className="text-stone-900">{missing}</p>
    </div>
  );
}

function LoadingState() {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-3 text-stone-500 font-mono text-sm">
      <span className="inline-block w-2 h-2 rounded-full bg-marigold animate-pulse" />
      {t('loading')}
    </div>
  );
}

function NoActiveRun() {
  const { t } = useTranslation();
  return (
    <div className="rounded-lg border border-dashed border-stone-300 bg-paper px-6 py-10 text-center">
      <div
        className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-marigold/10 text-marigold"
        aria-hidden="true"
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M14 3v4a1 1 0 0 0 1 1h4" />
          <path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z" />
          <path d="M9 13h6M9 17h4" />
        </svg>
      </div>
      <p className="text-sm font-medium text-ink">{t('error.noActiveRun')}</p>
      <p className="mt-1 font-mono text-[11px] uppercase tracking-wider text-stone-500">
        {t('error.noActiveRunHint')}
      </p>
    </div>
  );
}

function NotificationRow({
  notification,
  onMark,
}: {
  notification: Notification;
  onMark: (id: string) => void;
}) {
  const { t } = useTranslation();
  const dotClass =
    notification.urgency_level === 'action_required'
      ? 'bg-vermilion-500'
      : notification.urgency_level === 'attention'
        ? 'bg-amber-500'
        : 'bg-azure-500';
  return (
    <li className="border border-stone-200 rounded-lg p-3 text-sm flex items-start gap-3">
      <span
        className={`mt-1 inline-block w-2 h-2 rounded-full flex-shrink-0 ${dotClass}`}
        aria-hidden="true"
      />
      <div className="flex-1 min-w-0">
        <div className="font-medium">{notification.title}</div>
        <div className="text-stone-700 mt-1">{notification.body}</div>
      </div>
      <button
        type="button"
        onClick={() => onMark(notification.id)}
        className="text-xs font-mono text-stone-500 hover:text-ink"
      >
        {t('action.markRead')}
      </button>
    </li>
  );
}

function KpiGrid({ run }: { run: ValidationRun }) {
  const { t } = useTranslation();
  const conformity =
    run.conformity_rate !== null ? `${(run.conformity_rate * 100).toFixed(2)}%` : '—';
  const cells: { label: string; value: string; tone: string }[] = [
    { label: t('kpi.conformity'), value: conformity, tone: 'text-evergreen-700' },
    {
      label: t('kpi.evaluated'),
      value: String(run.total_rules_evaluated ?? '—'),
      tone: 'text-ink',
    },
    { label: t('kpi.pass'), value: String(run.total_pass ?? '—'), tone: 'text-evergreen-700' },
    {
      label: t('kpi.failSevere'),
      value: String(run.total_fail_severe ?? '—'),
      tone: 'text-vermilion-700',
    },
    {
      label: t('kpi.failRounding'),
      value: String(run.total_fail_rounding ?? '—'),
      tone: 'text-amber-600',
    },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      {cells.map((c) => (
        <div key={c.label} className="border border-stone-200 rounded-lg p-3">
          <div className="font-mono text-[10px] uppercase tracking-wider text-stone-500 mb-1">
            {c.label}
          </div>
          <div className={`text-2xl font-medium font-mono ${c.tone}`}>{c.value}</div>
        </div>
      ))}
    </div>
  );
}

function bctStepCount(run: ValidationRun | null): number {
  // BCT 3-step pipeline lives on validation_runs.step{1,2,3}_*_status
  // (not in prompt_bank — those agents are deterministic, doc 05 §8).
  // The ribbon meta reports how many of the three stages have an
  // applicable status row for this run.
  if (run === null) {
    return 0;
  }
  let count = 0;
  if (run.step1_xsd_status !== null) count += 1;
  if (run.step2_embedded_status !== null) count += 1;
  if (run.step3_rdg_status !== null) count += 1;
  return count;
}

function totalDurationMs(steps: readonly RunAgentStep[]): number {
  let total = 0;
  for (const s of steps) {
    if (s.durationMs !== null) {
      total += s.durationMs;
    }
  }
  return total;
}

function Ribbon({
  steps,
  run,
  runIdShort,
}: {
  steps: readonly RunAgentStep[];
  run: ValidationRun | null;
  runIdShort: string | null;
}) {
  const { t } = useTranslation();
  const totalMs = totalDurationMs(steps);
  const meta = t('ribbon.meta', {
    duration: (totalMs / 1000).toFixed(1),
    bct_count: bctStepCount(run),
    agent_count: steps.length,
  });
  return (
    <section className="ribbon" aria-label={t('orchestration.title')}>
      <div className="ribbon__header">
        <span className="ribbon__title">{t('orchestration.title')}</span>
        <span className="ribbon__meta">
          {runIdShort !== null && <span>#{runIdShort} · </span>}
          {meta}
        </span>
      </div>
      <div className="ribbon__track" role="list">
        {steps.map((s) => (
          <div key={s.id} className={`agent agent--${s.status}`} role="listitem">
            <span className="agent__dot" aria-hidden="true" />
            <span className="agent__labels">
              <span className="agent__name">{s.agentType}</span>
              <span className="agent__fn">{s.functionName}</span>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function ChatTurn({ message }: { message: ChatMessage }) {
  if (message.role === 'user') {
    return (
      <div className="msg-user">
        <span>{message.content}</span>
        <div className="msg-user__meta">{new Date(message.timestamp).toLocaleTimeString()}</div>
      </div>
    );
  }
  const trace = message.thinking_trace ?? null;
  const agents =
    message.agents_called !== undefined && message.agents_called.length > 0
      ? message.agents_called
      : null;
  return (
    <div className="msg-rega">
      <div className="msg-rega__avatar">
        <img src="/portrait.jpg" alt="Regalica" />
      </div>
      <div className="msg-rega__body">
        <div className="msg-rega__head">
          <span className="msg-rega__name">Regalica</span>
          <span className="msg-rega__time">{new Date(message.timestamp).toLocaleTimeString()}</span>
        </div>
        <div
          className="msg-rega__text prose prose-sm prose-stone max-w-none
                     prose-p:my-2 prose-headings:mt-3 prose-headings:mb-2
                     prose-pre:bg-stone-100 prose-pre:text-ink
                     prose-code:before:hidden prose-code:after:hidden
                     prose-code:bg-stone-100 prose-code:px-1 prose-code:py-0.5
                     prose-code:rounded prose-code:font-mono prose-code:text-[0.85em]
                     prose-a:text-azure prose-a:underline-offset-2"
        >
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
        </div>
        {trace !== null && trace.length > 0 && (
          <Artefact type="system" state="collapsed" badgeKey="artefact.badge.trace">
            <p className="text-sm text-stone-800">{trace}</p>
            {agents !== null && (
              <p className="mt-2 text-xs text-stone-600 font-mono">{agents.join(' / ')}</p>
            )}
          </Artefact>
        )}
      </div>
    </div>
  );
}

function ChatThread({ messages }: { messages: readonly ChatMessage[] }) {
  if (messages.length === 0) {
    return null;
  }
  const groups = groupByDay(messages);
  return (
    <div className="space-y-3">
      {groups.map((g) => (
        <div key={g.date.toISOString()} className="space-y-3">
          <DaySeparator date={g.date} />
          {g.items.map((m) => (
            <ChatTurn key={m.id} message={m} />
          ))}
        </div>
      ))}
    </div>
  );
}

export default function Workspace() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { run, loading: runLoading, error: runError, refetch: refetchCurrentRun } = useCurrentRun();
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  // Surcouche: an interactively-launched run takes precedence over
  // the server-resolved current run. This lets the operator kick off a
  // new validation_run without waiting for /current to repoll.
  const currentRunId = activeRunId ?? run?.run_id ?? null;
  const { steps } = useAgentSteps(currentRunId);
  const { summary, refetch: refetchSummary } = useRunSummary(currentRunId);
  const { notifications, markAsRead } = useNotifications();

  // SSE 'complete' event => the engine just persisted final
  // synthesis_artifact + deliverable_c_artifact + KPIs to
  // validation_runs. Re-pull /summary AND /current so both the
  // livrables (summary) and the persona-side KPI snapshot (run)
  // refresh from the same emitter, no polling required.
  const sse = useEventSource(currentRunId);
  useEffect(() => {
    if (currentRunId === null) return;
    const unsubscribe = sse.subscribe('complete', () => {
      refetchSummary();
      refetchCurrentRun();
    });
    return unsubscribe;
  }, [currentRunId, sse, refetchSummary, refetchCurrentRun]);

  // SSE 'error' event => /finalize emitted a single terminal error
  // frame with shape {code, message} (engine.ts:1072, runEventBus
  // single-emitter pattern). Tranche 1 fix: before this listener,
  // engine errors were silently dropped — the run reached
  // status='failed' in DB but the frontend showed nothing. The
  // payload's `code` is one of run_error_codes (apps/api/seeds/
  // run_error_codes.json); EngineErrorArtefact resolves localised
  // copy via i18n and falls back to error.engine.unknown for any
  // unrecognised code.
  const [engineError, setEngineError] = useState<{ code: string; message: string } | null>(null);
  useEffect(() => {
    if (currentRunId === null) return;
    const unsubscribe = sse.subscribe('error', (data: unknown) => {
      if (
        data !== null &&
        typeof data === 'object' &&
        'code' in data &&
        typeof (data as { code: unknown }).code === 'string'
      ) {
        const code = (data as { code: string }).code;
        const rawMessage =
          'message' in data && typeof (data as { message: unknown }).message === 'string'
            ? (data as { message: string }).message
            : code;
        setEngineError({ code, message: rawMessage });
      }
    });
    return unsubscribe;
  }, [currentRunId, sse]);
  useEffect(() => {
    // A new run kicks off => clear any stale terminal error from a
    // prior run so the artefact does not haunt the next ribbon cycle.
    setEngineError(null);
  }, [currentRunId]);
  const {
    messages,
    loading: chatLoading,
    error: chatError,
    sendMessage,
    clearError,
    conversationId,
    // Tranche 0 E2 — pass the active run id so chatbot-py routes
    // launch_validation to t1_runner with current_run_id non-null.
  } = useChat({ runId: currentRunId });

  const upload = useUpload();
  const startRun = useStartRun();
  // Pending upload: the user picked a file but hasn't yet pressed
  // "Lancer". Tracked locally so the Dock area can render the staged
  // file + a launch button. Cleared on either successful run start or
  // explicit reset.
  const [pendingUpload, setPendingUpload] = useState<UploadDto | null>(null);

  const handleSend = useCallback(
    (text: string): void => {
      void sendMessage(text);
    },
    [sendMessage],
  );

  const handleChipSelect = useCallback(
    (fnName: string): void => {
      void sendMessage(fnName);
    },
    [sendMessage],
  );

  const handleMarkRead = useCallback(
    (id: string): void => {
      void markAsRead(id);
    },
    [markAsRead],
  );

  const handleFileSelect = useCallback(
    (file: File): void => {
      void upload
        .upload(file)
        .then((dto) => {
          setPendingUpload(dto);
        })
        .catch(() => {
          // useUpload already stored the error code; the staged area
          // surfaces it from upload.error.
        });
    },
    [upload],
  );

  const handleLaunchRun = useCallback((): void => {
    if (pendingUpload === null) return;
    void startRun
      .start({
        upload_ids: [pendingUpload.upload_id],
        primary_upload_id: pendingUpload.upload_id,
        arrete_date: pendingUpload.arrete_date,
        ...(conversationId !== null ? { conversation_id: conversationId } : {}),
      })
      .then((res) => {
        setActiveRunId(res.run_id);
        setPendingUpload(null);
        upload.reset();
      })
      .catch(() => {
        // No silent swallow: useStartRun stored {code, message} in
        // state and <LaunchErrorArtefact> renders it inside the chat
        // thread (Tranche 1.1). Local catch only prevents the
        // unhandled-rejection warning.
      });
  }, [pendingUpload, conversationId, startRun, upload]);

  const handleCancelPending = useCallback((): void => {
    setPendingUpload(null);
    upload.reset();
    startRun.reset();
  }, [upload, startRun]);

  if (
    runError === 'MISSING_TENANT_ID' ||
    runError === 'MISSING_API_URL' ||
    runError === 'MISSING_USER_ID'
  ) {
    return <ConfigMissingState missing={runError} />;
  }

  const runIdShort = currentRunId !== null ? currentRunId.slice(0, 8) : null;

  return (
    <div className="app">
      <PersonaSidebar run={run} loading={runLoading} mode="workspace" />

      <main className="canvas">
        <header className="cmd">
          <nav className="cmd__nav" aria-label={t('nav.workspace')}>
            <a onClick={() => navigate('/filings')}>{t('nav.filings')}</a>
            <a className="active">{t('nav.workspace')}</a>
            <a onClick={() => navigate('/library')}>{t('nav.library')}</a>
          </nav>
          <div className="cmd__context">
            <LanguageSwitcher />
          </div>
        </header>

        <Ribbon steps={steps} run={run} runIdShort={runIdShort} />

        <div className="thread-scroll">
          <div className="thread">
            {notifications.length > 0 && (
              <Artefact type="notification" state="standard">
                <ul className="space-y-2">
                  {notifications.map((n) => (
                    <NotificationRow key={n.id} notification={n} onMark={handleMarkRead} />
                  ))}
                </ul>
              </Artefact>
            )}

            {engineError !== null && (
              <EngineErrorArtefact code={engineError.code} message={engineError.message} />
            )}

            {startRun.error !== null && (
              <LaunchErrorArtefact code={startRun.error.code} message={startRun.error.message} />
            )}

            {runLoading && <LoadingState />}
            {!runLoading && run === null && runError === null && activeRunId === null && (
              <NoActiveRun />
            )}
            {run !== null && (
              <Artefact type="synthese" state="standard">
                <KpiGrid run={run} />
                {summary !== null && summary.annexes.length > 0 && (
                  <div className="mt-4">
                    <div className="font-mono text-[10px] uppercase tracking-wider text-stone-500 mb-2">
                      {t('summary.byAnnexe')}
                    </div>
                    <ul className="space-y-1 text-sm font-mono">
                      {summary.annexes.map((a) => (
                        <li
                          key={a.code}
                          className="flex justify-between items-center border border-stone-200 rounded px-3 py-2"
                        >
                          <span>{a.code}</span>
                          <span className="text-stone-700">
                            {Number(a.fail_severe)} severe · {Number(a.fail_rounding)} rounding
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </Artefact>
            )}
            {summary !== null && summary.run.status === 'completed' && (
              <T1Deliverables run={summary.run} annexes={summary.annexes} />
            )}
            {summary !== null &&
              summary.run.status === 'completed' &&
              currentRunId !== null &&
              (summary.run.total_fail_severe ?? 0) + (summary.run.total_fail_rounding ?? 0) > 0 && (
                /* Tranche 0.5 W2.2 — surface validation_fail_details
                   rows persisted by /finalize so the user actually sees
                   the verdict beyond the KPI grid. */
                <FailsTable runId={currentRunId} filter="all" />
              )}
            {summary !== null && summary.run.status === 'completed' && (
              <T3LockBanner totalFailSevere={summary.run.total_fail_severe ?? 0} />
            )}

            <ChatThread messages={messages} />

            {chatError !== null && (
              <div
                className="text-xs font-mono text-vermilion-700 flex items-center gap-2"
                role="alert"
              >
                <span>
                  {chatError === 'MISSING_CONFIG' ? t('chat.errorConfig') : t('chat.errorGeneric')}
                </span>
                <button type="button" onClick={clearError} className="underline hover:text-ink">
                  ×
                </button>
              </div>
            )}
          </div>
        </div>

        {(upload.uploading || pendingUpload !== null || upload.error !== null) && (
          <UploadStagedRow
            uploading={upload.uploading}
            progress={upload.progress}
            uploadError={upload.error}
            starting={startRun.starting}
            pending={pendingUpload}
            onLaunch={handleLaunchRun}
            onCancel={handleCancelPending}
          />
        )}

        <Dock
          onSend={handleSend}
          onFileSelect={handleFileSelect}
          loading={chatLoading || upload.uploading || startRun.starting}
          suggestions={
            <SuggestionChips
              runId={currentRunId}
              onSelect={handleChipSelect}
              disabled={chatLoading}
            />
          }
        />
      </main>
    </div>
  );
}

function T1Deliverables({
  run,
  annexes,
}: {
  run: ValidationRun;
  annexes: readonly {
    code: string;
    fail_severe: string | number;
    fail_rounding: string | number;
  }[];
}) {
  const { t } = useTranslation();
  const synthesis = run.synthesis_artifact ?? null;
  const deliverableC = run.deliverable_c_artifact ?? null;
  // Tranche 0.5 W2.3 — when /finalize stores the aggregator's
  // markdown response in synthesis_artifact (object form
  // {markdown, totals}) or as a raw string, render via ReactMarkdown
  // so headings, lists, bold etc. are styled. Fall back to JSON
  // pretty-print for any other shape (debug surface).
  const synthesisMarkdown = extractMarkdownFromArtifact(synthesis);
  const deliverableCMarkdown = extractMarkdownFromArtifact(deliverableC);
  const synthesisRawJson =
    synthesisMarkdown === null && synthesis !== null ? JSON.stringify(synthesis, null, 2) : null;
  const deliverableCRawJson =
    deliverableCMarkdown === null && deliverableC !== null
      ? JSON.stringify(deliverableC, null, 2)
      : null;
  return (
    <>
      {synthesisMarkdown !== null && (
        <Artefact type="livrable_a" state="standard">
          <div className="text-sm prose prose-stone prose-sm max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{synthesisMarkdown}</ReactMarkdown>
          </div>
        </Artefact>
      )}
      {synthesisRawJson !== null && (
        <Artefact type="livrable_a" state="standard">
          <pre className="text-sm font-mono whitespace-pre-wrap break-words">
            {synthesisRawJson}
          </pre>
        </Artefact>
      )}
      {annexes.length > 0 && (
        <Artefact type="livrable_b" state="standard">
          <div className="font-mono text-[10px] uppercase tracking-wider text-stone-500 mb-2">
            {t('summary.byAnnexe')}
          </div>
          <ul className="space-y-1 text-sm font-mono">
            {annexes.map((a) => (
              <li
                key={a.code}
                className="flex justify-between items-center border border-stone-200 rounded px-3 py-2"
              >
                <span>{a.code}</span>
                <span className="text-stone-700">
                  {Number(a.fail_severe)} severe · {Number(a.fail_rounding)} rounding
                </span>
              </li>
            ))}
          </ul>
        </Artefact>
      )}
      {deliverableCMarkdown !== null && (
        <Artefact type="livrable_c" state="standard">
          <div className="text-sm prose prose-stone prose-sm max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{deliverableCMarkdown}</ReactMarkdown>
          </div>
        </Artefact>
      )}
      {deliverableCRawJson !== null && (
        <Artefact type="livrable_c" state="standard">
          <pre className="text-sm font-mono whitespace-pre-wrap break-words">
            {deliverableCRawJson}
          </pre>
        </Artefact>
      )}
    </>
  );
}

/**
 * Extract a markdown string from a synthesis_artifact / deliverable_c
 * column value. Supported shapes:
 *   - string                              → returned as-is
 *   - { markdown: "..." }                 → returned (`markdown` key)
 *   - anything else (incl. null)          → null (caller falls back to
 *                                            raw JSON pretty-print)
 *
 * Tranche 0 chatbot-py only writes `null` to these columns today; a
 * future tranche will populate `synthesis_artifact = { markdown: aggregator_response }`
 * via /finalize.
 */
function extractMarkdownFromArtifact(value: unknown): string | null {
  if (typeof value === 'string') {
    return value;
  }
  if (
    value !== null &&
    typeof value === 'object' &&
    'markdown' in value &&
    typeof (value as { markdown: unknown }).markdown === 'string'
  ) {
    return (value as { markdown: string }).markdown;
  }
  return null;
}

function T3LockBanner({ totalFailSevere }: { totalFailSevere: number }) {
  const { t } = useTranslation();
  if (totalFailSevere <= 0) {
    return (
      <div className="rounded border border-evergreen-200 bg-evergreen-50 px-3 py-2 text-sm">
        <span className="font-mono text-[10px] uppercase tracking-wider text-evergreen-700 mr-2">
          {t('t3.unlockedLabel')}
        </span>
        <span className="text-evergreen-800">{t('t3.unlocked')}</span>
      </div>
    );
  }
  return (
    <div
      className="rounded border border-vermilion-200 bg-vermilion-50 px-3 py-2 text-sm"
      role="status"
      aria-live="polite"
    >
      <span className="font-mono text-[10px] uppercase tracking-wider text-vermilion-700 mr-2">
        {t('t3.lockedLabel')}
      </span>
      <span className="text-vermilion-800">
        {t('t3.lockedMessage', { count: totalFailSevere })}
      </span>
    </div>
  );
}

function UploadStagedRow({
  uploading,
  progress,
  uploadError,
  starting,
  pending,
  onLaunch,
  onCancel,
}: {
  uploading: boolean;
  progress: number;
  uploadError: string | null;
  starting: boolean;
  pending: UploadDto | null;
  onLaunch: () => void;
  onCancel: () => void;
}) {
  // Tranche 1.1 — startRun.error is no longer surfaced here; it lives
  // in the chat thread via <LaunchErrorArtefact> so it stays visible
  // even while the user keeps `pending` in the staged row (the bug
  // this row used to silently mask). Upload errors keep their
  // local row-level treatment because the staged file is the only
  // contextual anchor for them.
  const { t } = useTranslation();
  const error = uploadError;
  return (
    <div
      className="border-t border-stone-200 bg-paper px-4 py-3 flex items-center gap-3"
      role="region"
      aria-label={t('upload.staged')}
    >
      {uploading && (
        <>
          <span className="font-mono text-[11px] uppercase tracking-wider text-stone-500">
            {t('upload.inProgress')}
          </span>
          <div className="flex-1 h-2 bg-stone-200 rounded overflow-hidden">
            <div
              className="h-full bg-marigold transition-[width]"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="font-mono text-xs text-stone-700">{progress}%</span>
        </>
      )}
      {!uploading && pending !== null && (
        <>
          <span className="font-mono text-[11px] uppercase tracking-wider text-stone-500">
            {t('upload.staged')}
          </span>
          <span className="text-sm font-medium truncate">{pending.filename}</span>
          <span className="font-mono text-xs text-stone-600">
            {pending.annexe_code} · {pending.arrete_date}
            {pending.deduplicated && ` · ${t('upload.deduplicated')}`}
          </span>
          <div className="flex-1" />
          <button
            type="button"
            onClick={onCancel}
            className="font-mono text-xs text-stone-600 hover:text-ink underline"
            disabled={starting}
          >
            {t('action.cancel')}
          </button>
          <button
            type="button"
            onClick={onLaunch}
            className="rounded bg-marigold px-3 py-1.5 text-xs font-mono uppercase tracking-wider text-ink disabled:opacity-50"
            disabled={starting}
          >
            {starting ? t('upload.starting') : t('action.launchRun')}
          </button>
        </>
      )}
      {!uploading && pending === null && error !== null && (
        <>
          <span className="font-mono text-xs text-vermilion-700" role="alert">
            {t('upload.errorPrefix')}: {error}
          </span>
          <div className="flex-1" />
          <button
            type="button"
            onClick={onCancel}
            className="font-mono text-xs text-stone-600 hover:text-ink underline"
          >
            {t('action.dismiss')}
          </button>
        </>
      )}
    </div>
  );
}
