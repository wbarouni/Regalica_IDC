import { useCallback, useEffect, useRef, useState } from 'react';
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
import { InvestigationArtefact } from '../components/InvestigationArtefact';
import { ProgressBar } from '../components/ProgressBar';
import { RegalicaRunSpeech } from '../components/RegalicaRunSpeech';
import { SuggestionChips } from '../components/SuggestionChips';
import { ConversationHistorySidebar } from '../components/ConversationHistorySidebar';
import { UploadDropZone } from '../components/UploadDropZone';
import { LanguageSwitcher } from '../components/primitives/LanguageSwitcher';
import { PersonaSidebar } from '../components/layout/PersonaSidebar';
import { useAgentSteps } from '../hooks/useAgentSteps';
import { useChat, type ChatMessage } from '../hooks/useChat';
import { useConversations } from '../hooks/useConversations';
import { useCurrentRun } from '../hooks/useCurrentRun';
import { useEventSource } from '../hooks/useEventSource';
import { useNotifications } from '../hooks/useNotifications';
import { useRunSummary } from '../hooks/useRunSummary';
import { useStartRun } from '../hooks/useStartRun';
import { useTopSevereFail } from '../hooks/useTopSevereFail';
import { useTypewriter } from '../hooks/useTypewriter';
import { useUpload, type UploadDto } from '../hooks/useUpload';
import type { FailDetail, Notification, RunAgentStep, ValidationRun } from '../types/api';
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

function ChatTurn({ message, isFresh }: { message: ChatMessage; isFresh: boolean }) {
  const { t } = useTranslation();
  const trace = message.thinking_trace ?? null;
  const { revealedThinking, revealedResponse, phase } = useTypewriter({
    thinkingText: trace ?? '',
    responseText: message.role === 'regalica' ? message.content : '',
    enabled: message.role === 'regalica' && isFresh,
  });
  if (message.role === 'user') {
    return (
      <div className="msg-user">
        <span>{message.content}</span>
        <div className="msg-user__meta">{new Date(message.timestamp).toLocaleTimeString()}</div>
      </div>
    );
  }
  // Auto-collapse the thinking artefact once the response phase starts:
  // open during phase==='thinking', collapsed afterwards. The user can
  // re-open via click — Artefact tracks the override internally.
  const thinkingControlled: 'expanded' | 'collapsed' =
    phase === 'thinking' ? 'expanded' : 'collapsed';
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
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{revealedResponse}</ReactMarkdown>
        </div>
        {trace !== null && trace.length > 0 && (
          /* Point 2C — thinking artefact is now controlled: it opens
             automatically while the typewriter reveals the trace
             ("thinking" phase) and collapses automatically once the
             response phase starts. For historical messages mounted
             before the current session (`isFresh=false`), the
             typewriter is disabled and the artefact lands directly
             collapsed. The user can always re-open via click; the
             override sticks for the message's lifetime. */
          <Artefact
            type="system"
            state="collapsed"
            controlledState={thinkingControlled}
            badgeKey="artefact.badge.trace"
          >
            <div className="font-mono text-[10px] uppercase tracking-wider text-marigold-700 mb-2">
              {t('thinking.label', { defaultValue: 'Mode thinking · raisonnement Regalica' })}
            </div>
            {/* Fix-4 — the thinking artefact carries ONLY the prose
                reflection. The list of internal agent names
                (`investigator/analyze_fail`, `citation/find_regulatory_source`,
                …) was leaking below the prose and breaking the
                "vous ne nommez aucun agent" contract of the
                thinking_reflection prompt (migration 087). The agents
                list stays accessible as `message.agents_called` for
                debug telemetry but is not rendered to the reader. */}
            <p className="text-sm text-stone-800 whitespace-pre-line">{revealedThinking}</p>
          </Artefact>
        )}
      </div>
    </div>
  );
}

function ChatThread({ messages }: { messages: readonly ChatMessage[] }) {
  // Snapshot the IDs present at first render: those are "history" and
  // must NOT animate. Anything appended later is "fresh" and should be
  // typewritten. The ref is initialised once and never mutated.
  const initialIdsRef = useRef<Set<string> | null>(null);
  if (initialIdsRef.current === null) {
    initialIdsRef.current = new Set(messages.map((m) => m.id));
  }
  const initialIds = initialIdsRef.current;
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
            <ChatTurn key={m.id} message={m} isFresh={!initialIds.has(m.id)} />
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
  // K1 — DB-persisted error fallback. The SSE 'error' frame above is
  // single-shot: lost across reloads. validation_runs.error_code is
  // populated by /finalize for every status='failed' row (migration
  // 073) and now travels through /runs/current + /runs/:runId/summary,
  // so a reload after a failed run can rehydrate the artefact from
  // run.error_code with no re-emission. SSE stays the priority source
  // (it carries the live message); the run row is the durable fallback.
  const persistedEngineError =
    engineError === null && run !== null && run.status === 'failed' && run.error_code !== null
      ? { code: run.error_code, message: run.error_code }
      : null;
  const displayedEngineError = engineError ?? persistedEngineError;
  // Point 2 — local intent matcher ref. Invoked synchronously inside
  // useChat.sendMessage BEFORE the LLM round-trip. Returns true to
  // short-circuit (the caller — Workspace — has handled the intent
  // locally, e.g. by calling handleLaunchRun for a chat-driven
  // launch_validation phrase). The ref pattern decouples the matcher's
  // body from the useChat setup order, since handleLaunchRun depends
  // on later state (pendingUpload, conversationId, startRun).
  const localLaunchMatcherRef = useRef<((text: string) => boolean) | null>(null);
  const {
    messages,
    loading: chatLoading,
    error: chatError,
    sendMessage,
    clearError,
    conversationId,
    // Tranche 0 E2 — pass the active run id so chatbot-py routes
    // launch_validation to t1_runner with current_run_id non-null.
    injectRegalicaMessage,
    // Sprint D — Point 5 — manual upload of a fresh annexe opens a
    // fresh chat thread (the prior conversation is dropped from the
    // local view; archive sidebar arrives in a follow-up sprint). When
    // Regalica requests a companion follow-up, the caller does NOT
    // invoke this and the thread continues.
    resetConversation,
  } = useChat({
    runId: currentRunId,
    onLocalIntentMatch: (text) => localLaunchMatcherRef.current?.(text) === true,
  });

  // Fix-5 — historique des conversations. The sidebar opens collapsed
  // by default (rail visible on the right edge); clicking the rail or
  // the conversation rows surfaces the panel. Refetch fires whenever
  // the active conversation_id flips so the "most recent" ordering
  // and the messages_count column re-flow without a page reload.
  const {
    conversations: pastConversations,
    loading: conversationsLoading,
    refetch: refetchConversations,
  } = useConversations();
  const [historyOpen, setHistoryOpen] = useState<boolean>(false);
  useEffect(() => {
    refetchConversations();
  }, [conversationId, refetchConversations]);
  const handleHistorySelect = useCallback(
    (selectedId: string): void => {
      // Selecting a past thread resets the in-memory chat to a clean
      // state. The next sendMessage will carry the selected id (we'd
      // need an extra hook entry-point to load past messages from the
      // backend — deferred to a follow-up: V1 just opens a fresh
      // thread but with the conversation row preserved).
      resetConversation();
      setHistoryOpen(false);
      // Mark intent so the sidebar shows the selected row highlighted
      // until the user types something new (best-effort UX).
      void selectedId;
    },
    [resetConversation],
  );
  const handleHistoryNewChat = useCallback((): void => {
    resetConversation();
    setHistoryOpen(false);
  }, [resetConversation]);

  // C — top severe fail for the auto-mounted InvestigationArtefact.
  // Fetched in parallel with the rest of the workspace, mounted only
  // when summary.run.status === 'completed' AND a severe fail is
  // returned (the route filter=fail returns severe + rounding; we
  // gate on severity inside the JSX below to keep the hook simple).
  const topFail = useTopSevereFail(currentRunId);

  // Sub-Sprint 4 — clicking a row in <FailsTable> selects that fail
  // for the InvestigationArtefact below. Initial value null lets the
  // existing top-severe auto-mount keep working (we fall back to
  // `topFail.fail` when nothing is selected). Setter cleared via the
  // run id reset below if currentRunId flips.
  const [selectedFail, setSelectedFail] = useState<FailDetail | null>(null);
  useEffect(() => {
    setSelectedFail(null);
  }, [currentRunId]);
  const investigationFail = selectedFail ?? topFail.fail;

  // D — auto-zoom: when the run is completed AND a top severe fail
  // is loaded, fire ONCE per runId a synthetic chat turn that lets
  // Regalica explain the fail through the canonical zoom intent.
  // The orchestrator routes the message via `regalica/router` →
  // `zoom` intent → [investigator, citation] specialists → aggregator
  // `aggregate_zoom_fail` → markdown response that flows into the
  // existing ChatThread render path.
  //
  // Idempotency layered:
  //   1. `autoZoomFiredFor` ref guards the in-session re-render path
  //      (a state change on currentRunId stays put unless the run
  //      itself rotates).
  //   2. `messages.length === 0` guard prevents a re-fire on a full
  //      page reload: useChat re-mounts with an empty thread, but if
  //      the user already scrolled or clicked anything they'll have
  //      a turn in the chat — the gate then holds. After reload, with
  //      thread empty, the auto-zoom DOES re-fire — accepted because
  //      the conversation history is per-session in chatbot-py and
  //      reload starts a new session anyway. Phase 4 may persist
  //      chat threads via /conversations and tighten this further.
  //
  // Failure mode: the chat layer already swallows Gemini exceptions
  // into ChatMessage error state without crashing the UI; D inherits
  // that resilience at no extra cost.
  const autoZoomFiredFor = useRef<string | null>(null);
  useEffect(() => {
    if (currentRunId === null) return;
    if (run?.status !== 'completed') return;
    if (topFail.fail === null || topFail.fail.severity !== 'severe') return;
    if (autoZoomFiredFor.current === currentRunId) return;
    if (messages.length > 0) return;
    autoZoomFiredFor.current = currentRunId;
    const ax = topFail.fail.ax_term;
    const num = topFail.fail.num_regle;
    void sendMessage(
      t('autoZoom.triggerMessage', {
        ax,
        num,
        defaultValue: 'Regarde ce FAIL : règle {{ax}}/{{num}} et explique la cause racine.',
      }),
    );
  }, [currentRunId, run?.status, topFail.fail, sendMessage, t, messages.length]);

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

  // K2 — wire the dock PDF button to the chat path. The trigger message
  // matches the regalica/router prompt's intent classification heuristics
  // (download_report) so the orchestrator dispatches reporter_pdf and
  // surfaces the static_response markdown verbatim.
  const handleDownloadReport = useCallback((): void => {
    void sendMessage(t('dock.download_pdf.trigger_message'));
  }, [sendMessage, t]);

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
    // Sprint D — Point 5 — a manual Lancer click is the user opening
    // a NEW validation context. Reset the chat thread BEFORE kickoff
    // so the briefing / synthesis messages persisted by chatbot-py
    // land in a fresh conversation (not appended to the previous
    // run's narrative). The companion-follow-up case (Regalica asked
    // the user to upload a missing annexe) routes through a separate
    // path that does NOT call this handler.
    resetConversation();
    void startRun
      .start({
        upload_ids: [pendingUpload.upload_id],
        primary_upload_id: pendingUpload.upload_id,
        arrete_date: pendingUpload.arrete_date,
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
  }, [pendingUpload, resetConversation, startRun, upload]);

  const handleCancelPending = useCallback((): void => {
    setPendingUpload(null);
    upload.reset();
    startRun.reset();
  }, [upload, startRun]);

  // Point 2 — populate the local matcher ref now that handleLaunchRun
  // and pendingUpload are in scope. The ref is invoked synchronously
  // inside useChat.sendMessage BEFORE the LLM round-trip; on a regex
  // match (FR/EN/AR launch verbs), if a pendingUpload is staged, the
  // launch button is fired imperatively, a Regalica acknowledgement
  // is injected into the thread via injectRegalicaMessage, and the
  // network call is skipped.
  //
  // Without a pendingUpload (no XML staged), the matcher returns
  // false and the message routes through the normal chatbot-py
  // path — the launch_validation intent there still works for an
  // already-running validation_runs row (re-evaluating the same XMLs).
  useEffect(() => {
    localLaunchMatcherRef.current = (text) => {
      if (pendingUpload === null) return false;
      const re =
        /\b(lance|d[eé]marre|valide|run|start|launch|trigger|kick[\s-]?off|ابدأ|شغّل|أطلق)\b/i;
      if (!re.test(text)) return false;
      handleLaunchRun();
      injectRegalicaMessage(
        t('autoLaunch.acknowledgement', {
          defaultValue:
            'Très bien. Je lance la validation BCT T1 sur le fichier que vous venez de charger.',
        }),
      );
      return true;
    };
  }, [pendingUpload, handleLaunchRun, injectRegalicaMessage, t]);

  if (
    runError === 'MISSING_TENANT_ID' ||
    runError === 'MISSING_API_URL' ||
    runError === 'MISSING_USER_ID'
  ) {
    return <ConfigMissingState missing={runError} />;
  }

  const runIdShort = currentRunId !== null ? currentRunId.slice(0, 8) : null;

  return (
    <UploadDropZone
      onFileAccepted={handleFileSelect}
      disabled={upload.uploading || startRun.starting}
    >
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
          {run?.status === 'running' && <ProgressBar runId={currentRunId} />}

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

              {displayedEngineError !== null && (
                <EngineErrorArtefact
                  code={displayedEngineError.code}
                  message={displayedEngineError.message}
                />
              )}

              {startRun.error !== null && (
                <LaunchErrorArtefact code={startRun.error.code} message={startRun.error.message} />
              )}

              {runLoading && <LoadingState />}
              {!runLoading && run === null && runError === null && activeRunId === null && (
                <NoActiveRun />
              )}
              {run !== null && summary !== null && summary.run.status !== 'completed' && (
                /* Correction 1 — running run keeps the Synthèse external
                 because there is no Regalica bubble to nest it inside
                 yet (the run hasn't completed; no narrative + no
                 confidence to derive). Once status === 'completed' the
                 Synthèse moves INTO the bubble below. */
                <RunSynthesisCard run={run} annexes={summary.annexes} />
              )}
              {summary !== null && summary.run.status === 'completed' && (
                /* Point 1 + Correction 1 — Regalica's voice OWNS the
                 Synthèse, then the cause-root deliverable (Livrable C),
                 then the FailsTable, then the per-fail decomposition.
                 Everything sits as direct children of .msg-rega__body
                 to match the workspace v5 mockup pattern (:626-697)
                 where every <article class="artefact"> is rendered
                 inside the bubble. */
                <RegalicaRunSpeech run={summary.run}>
                  <RunSynthesisCard run={summary.run} annexes={summary.annexes} />
                  <T1Deliverables run={summary.run} />
                  {currentRunId !== null &&
                    (summary.run.total_fail_severe ?? 0) + (summary.run.total_fail_rounding ?? 0) >
                      0 && (
                      /* Tranche 0.5 W2.2 — validation_fail_details rows
                       persisted by /finalize, banking-format columns
                       surfaced. Sub-Sprint 4: rows are now clickable
                       and feed the InvestigationArtefact below. */
                      <FailsTable
                        runId={currentRunId}
                        filter="all"
                        onFailClick={setSelectedFail}
                        selectedFailId={investigationFail?.id ?? null}
                      />
                    )}
                  {investigationFail !== null && (
                    /* C — Investigation block. Defaults to the top severe
                     fail (auto-mounted by useTopSevereFail) and switches
                     to whatever row the user clicks in FailsTable above
                     (Sub-Sprint 4). The artefact accepts both severities
                     so a click on a rounding row also surfaces the
                     decomposition. */
                    <InvestigationArtefact fail={investigationFail} />
                  )}
                  <T3LockBanner totalFailSevere={summary.run.total_fail_severe ?? 0} />
                </RegalicaRunSpeech>
              )}
              {run !== null && summary === null && (
                /* Defensive: run row exists but /summary is still pending.
                 Show the KPI grid skeleton from the run row alone (no
                 annexes block until summary lands). */
                <RunSynthesisCard run={run} annexes={[]} />
              )}

              <ChatThread messages={messages} />

              {chatError !== null && (
                <div
                  className="text-xs font-mono text-vermilion-700 flex items-center gap-2"
                  role="alert"
                >
                  <span>
                    {chatError === 'MISSING_CONFIG'
                      ? t('chat.errorConfig')
                      : t('chat.errorGeneric')}
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
            onDownloadReport={run?.status === 'completed' ? handleDownloadReport : undefined}
            suggestions={
              <SuggestionChips
                runId={currentRunId}
                onSelect={handleChipSelect}
                disabled={chatLoading}
              />
            }
          />
        </main>
        <ConversationHistorySidebar
          conversations={pastConversations}
          loading={conversationsLoading}
          activeConversationId={conversationId}
          open={historyOpen}
          onToggle={() => setHistoryOpen((v) => !v)}
          onSelect={handleHistorySelect}
          onNewChat={handleHistoryNewChat}
        />
      </div>
    </UploadDropZone>
  );
}

/**
 * Correction 1 — Synthèse extracted as a reusable card so it can be
 * mounted both standalone (running runs, before the Regalica bubble
 * exists) and as a direct child of `.msg-rega__body` (completed runs,
 * inside the Regalica voice frame). KpiGrid + per-annexe block stay
 * unchanged; only the wrapping `<Artefact type="synthese">` is moved.
 */
function RunSynthesisCard({
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
  return (
    <Artefact type="synthese" state="standard">
      <KpiGrid run={run} />
      {annexes.length > 0 && (
        <div className="mt-4">
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
        </div>
      )}
    </Artefact>
  );
}

function T1Deliverables({ run }: { run: ValidationRun }) {
  // Point 5 — remove the redundant Livrable A (synthesis_artifact
  // markdown brut) and Livrable B (annexes barres) artefacts. Both
  // duplicated information already covered by the Synthèse KPI grid
  // (KpiGrid + summary.annexes block, Workspace.tsx:612-636) which
  // sits at the top of the thread for both running and completed
  // runs. The maquette v5 (workspace-v5.html :626-697) shows ONE
  // synthesis card per run, not three layers — Livrable C
  // (analyse de cause racine) is the only deliverable that carries
  // genuinely new information beyond the KPIs and stays on screen.
  //
  // The synthesis_artifact JSONB is preserved in the DB (Tranche 0.7
  // commit cb28e06) for audit and Phase 5 analytics; we just stop
  // re-rendering it next to the KPIs that already represent the
  // same totals.
  const deliverableC = run.deliverable_c_artifact ?? null;
  const deliverableCMarkdown = extractMarkdownFromArtifact(deliverableC);
  const deliverableCRawJson =
    deliverableCMarkdown === null && deliverableC !== null
      ? JSON.stringify(deliverableC, null, 2)
      : null;
  if (deliverableCMarkdown === null && deliverableCRawJson === null) {
    return null;
  }
  return (
    <>
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
