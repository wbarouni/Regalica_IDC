import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { useConversationMessages } from '../hooks/useConversationMessages';
import { useConversations } from '../hooks/useConversations';
import { useCurrentRun } from '../hooks/useCurrentRun';
import { useEventSource } from '../hooks/useEventSource';
import { useFails } from '../hooks/useFails';
import { useNotifications } from '../hooks/useNotifications';
import { useRunEta } from '../hooks/useRunEta';
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
        {/* UX 4 — thinking artefact is rendered ABOVE the response so the
            reader sees the reasoning unfold first, then the verdict. The
            previous order (response first, thinking after) read as an
            afterthought; world-class chat UX (Claude, GPT-5) shows the
            thinking trace at the top of the bubble while it streams,
            then the response below. The Artefact still auto-collapses
            once the response phase starts (controlledState binding
            unchanged) so the bubble stays compact post-stream. */}
        {trace !== null && trace.length > 0 && (
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
      </div>
    </div>
  );
}

function ChatThread({ messages }: { messages: readonly ChatMessage[] }) {
  // Snapshot the IDs present at first render: those are "history" and
  // must NOT animate. Anything appended later is "fresh" and should be
  // typewritten. The snapshot RE-INITIALISES every time `messages` is
  // emptied (Bug 1 — "Nouveau chat" was leaving the ref populated with
  // stale IDs from the prior thread, so the FIRST message of the new
  // chat was misclassified as history and skipped the typewriter
  // illusion). Resetting on `messages.length === 0` keeps the
  // initial-load semantics intact (`useChat.loadConversation` populates
  // the array in one batch → all rows are history) AND treats every
  // message that lands AFTER a reset as fresh.
  const initialIdsRef = useRef<Set<string> | null>(null);
  if (initialIdsRef.current === null || messages.length === 0) {
    initialIdsRef.current = new Set(messages.map((m) => m.id));
  }
  const initialIds = initialIdsRef.current;
  // Bug 1 (auto-scroll) — when a fresh message lands (typically the
  // "Nouveau chat" greeting OR a Regalica response), scroll the last
  // bubble into view. Without this, the new bubble is appended at the
  // bottom of a long workspace stack (run summary + KPIs + FailsTable +
  // InvestigationArtefact) and the user sees no visible impact even
  // though the click registered. The scroll fires on every length
  // change so live chat turns also feel responsive — matches the
  // canonical Claude / GPT chat UX.
  const lastAnchorRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (messages.length === 0) return;
    const node = lastAnchorRef.current;
    if (node === null) return;
    // `auto` instead of `smooth` so the new bubble is on-screen
    // BEFORE the typewriter starts revealing characters; smooth would
    // let the first chunk paint off-screen.
    node.scrollIntoView({ block: 'end', inline: 'nearest', behavior: 'auto' });
  }, [messages.length]);
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
      {/* Anchor sentinel for the auto-scroll effect above. Empty
          div with no visible footprint; React keys it last so
          scrollIntoView lands on the bottom of the most recent
          message regardless of group structure. */}
      <div ref={lastAnchorRef} aria-hidden="true" style={{ height: 1 }} />
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

  // Issue 2 (2026-05-08) — initial-mount welcome bubble. When the
  // user lands on the workspace with no active run AND no prior
  // chat thread (fresh tenant, or after Nouveau chat resets every
  // surface), Regalica greets first, names the next concrete action
  // (drag-drop or attach), and waits. Mirrors the Claude / GPT
  // onboarding pattern. The greeting is a localised string from
  // `chat.welcomeGreeting` (FR/EN/AR via apps/web/src/locales) so
  // the contract stays zero-hardcoding. The ref guard ensures the
  // bubble fires AT MOST once per session — subsequent state
  // transitions (e.g. user uploads then clears) don't re-spam the
  // thread.
  const initialGreetingFiredRef = useRef<boolean>(false);
  // (effect declared further down once messages + injectRegalicaMessage
  // are in scope.)

  // UX 2026-05-08 — Issue 1 — `lastRunInChat` gates the rendering of
  // the run-completed canvas (Synthèse + KPI grid + FailsTable +
  // InvestigationArtefact + T3LockBanner). The user's diagnostic was
  // that "Nouveau chat" cleared the chat thread but the run summary
  // stayed on the canvas — a half-reset, not a true conversation
  // restart. By tying the canvas-side run UI to `lastRunInChat`
  // instead of `currentRunId`, the operator gets a true blank slate
  // when starting a new chat:
  //   - Initial mount: the existing current run (if any) is auto-
  //     bound so a page reload mid-investigation doesn't lose the
  //     workspace state. Effect below seeds `lastRunInChat` from
  //     `currentRunId` once on hydration.
  //   - "Lancer la validation" click: lastRunInChat is set to the
  //     new run id immediately (handleLaunchRun below).
  //   - "Nouveau chat" click: lastRunInChat is cleared so the
  //     canvas is empty until a fresh run starts (handleHistoryNewChat
  //     below).
  //   - Past-conversation hydration: lastRunInChat tracks the
  //     conversation's linked_validation_run_id (handleHistorySelect
  //     below) — clicking a thread about run X surfaces run X again.
  const [lastRunInChat, setLastRunInChat] = useState<string | null>(null);
  // Run ids the user has explicitly dismissed via "Nouveau chat".
  // Kept for B7 history-pick logic (handleHistorySelect uses it to
  // re-attach a previously-dismissed id when the user explicitly
  // picks a past conversation linked to that run).
  const dismissedRunIdsRef = useRef<Set<string>>(new Set());
  // Issue 1 (2026-05-08) — the auto-bind effect that previously
  // restored `lastRunInChat` from the server's current run on first
  // hydration was REMOVED. The user explicitly wants a fresh-app
  // open to show ONLY the Regalica welcome bubble — no past Mode
  // actuel sidebar, no past ribbon, no past KPI grid.
  //
  // Three explicit entry points populate `lastRunInChat`:
  //   1. handleLaunchRun — sets it to the new run id immediately
  //      after POST /api/runs succeeds (Lancer button)
  //   2. handleHistorySelect — restores it from
  //      messages.linked_run_id when the user picks a past
  //      conversation (B7)
  //   3. (none on mount) — fresh open is blank by design
  //
  // A returning user who reloaded mid-investigation can still get
  // back to their run by picking it from the history sidebar.

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
  // B1 (2026-05-08) — `localLaunchMatcherRef` REMOVED with its
  // hardcoded `/\b(lance|démarre|valide|...)\b/i` regex. Two reasons:
  //   1. The regex was hardcoded vocabulary that violated CLAUDE.md
  //      §10 (zero hardcoding).
  //   2. Stale closures around pendingUpload caused recursive
  //      handleLaunchRun() invocations → duplicate validation_runs.
  // The Lancer button is the sole entry point for launching from a
  // staged upload; typed launch verbs route normally through
  // chatbot-py /chat/message → router → launch_validation intent →
  // T1 short-circuit (B2, gated on validation_runs.status +
  // intent_specialists.requires_run_uniqueness).
  //
  // `launchInFlightRef` (B1+B5) replaces the regex matcher's role
  // for guarding against duplicate launches — if a POST /api/runs
  // is already in flight, subsequent Lancer clicks are no-ops until
  // the promise resolves.
  const launchInFlightRef = useRef<boolean>(false);
  // P1 frontend — `selectedFailRef` mirrors the `selectedFail` state
  // so the failContextProvider closure (passed once to useChat) reads
  // the latest selection at every send-time without forcing useChat
  // to re-memoize. The state itself is declared further below and
  // synced into the ref via `useEffect`.
  const selectedFailRef = useRef<FailDetail | null>(null);
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
    // B3 — programmatic injection of a USER bubble. Used by
    // handleLaunchRun to render the user's intent ("Lance la
    // validation BCT T1...") in the thread BEFORE the POST /api/runs
    // fires, so the chat reads as a clean causal sequence:
    //   user msg → Regalica ack → ribbon animates → synthesis arrives.
    injectUserMessage,
    // Sprint D — Point 5 — manual upload of a fresh annexe opens a
    // fresh chat thread (the prior conversation is dropped from the
    // local view; archive sidebar arrives in a follow-up sprint). When
    // Regalica requests a companion follow-up, the caller does NOT
    // invoke this and the thread continues.
    resetConversation,
    // P5 — replace the in-memory thread with persisted messages of
    // a past conversation when the user picks a row in the history
    // sidebar. Pinning conversationId here ensures the next
    // sendMessage continues the same `messages` table sequence.
    loadConversation,
  } = useChat({
    runId: currentRunId,
    // P1 frontend — propagate the user's currently selected FAIL to
    // chatbot-py via `context.fail`. The orchestrator uses it as a
    // direct override of the SQL preload, so the investigator analyses
    // the clicked row instead of the largest-gap default.
    failContextProvider: () => {
      const f = selectedFailRef.current;
      if (f === null) return null;
      return {
        id: f.id,
        ax_term: f.ax_term,
        num_regle: f.num_regle,
        severity: f.severity,
        expected_value: f.expected_value,
        computed_value: f.computed_value,
        gap_absolute: f.gap_absolute,
        gap_relative: f.gap_relative,
        rubrique_codes: f.rubrique_codes,
      };
    },
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
    deleteConversation,
  } = useConversations();
  const [historyOpen, setHistoryOpen] = useState<boolean>(false);
  useEffect(() => {
    refetchConversations();
  }, [conversationId, refetchConversations]);

  // P5 — passive hydration loader. Fires only when the user clicks
  // a past row in the history sidebar; otherwise idle. Reads the
  // surfaced messages (user + regalica_response) for the selected
  // conversation and feeds them straight into useChat.loadConversation.
  const conversationMessages = useConversationMessages();
  const handleHistorySelect = useCallback(
    (selectedId: string): void => {
      // Optimistic close — the panel collapses immediately so the
      // hydration latency does not block the UI. If the load fails
      // the chat stays on its previous content and the sidebar can
      // be reopened to retry.
      setHistoryOpen(false);
      void conversationMessages
        .load(selectedId)
        .then((rows) => {
          // DB → ChatMessage shape:
          //   - role 'user' → ChatMessage.role 'user'
          //   - role 'regalica_response' → ChatMessage.role 'regalica'
          //   - thinking_trace is JSONB; only render when it is a
          //     non-empty string (legacy rows may carry an object/null)
          //   - timestamp uses created_at so the day separator
          //     groupByDay logic stays consistent with live messages
          const hydrated: ChatMessage[] = rows.map((r) => ({
            id: r.id,
            role: r.role === 'user' ? 'user' : 'regalica',
            content: r.content_markdown,
            thinking_trace: typeof r.thinking_trace === 'string' ? r.thinking_trace : null,
            agents_called: r.produced_by_agent !== null ? [r.produced_by_agent] : [],
            timestamp: r.created_at,
          }));
          loadConversation(selectedId, hydrated);
          // B7 (2026-05-08, migration 104) — find the LATEST
          // non-null linked_run_id across the loaded turns and bind
          // the run-completed canvas to it. Rows are ordered by
          // sequence_number ASC, so we scan from the end to grab the
          // most recent run reference. When every row carries NULL
          // (pre-B7 conversations or general-help-only threads), the
          // canvas stays empty — `dismissedRunIdsRef` is also
          // primed with the previously-bound id so the auto-bind
          // effect doesn't resurrect the wrong run.
          let restoredRunId: string | null = null;
          for (let i = rows.length - 1; i >= 0; i -= 1) {
            const candidate = rows[i]?.linked_run_id ?? null;
            if (candidate !== null) {
              restoredRunId = candidate;
              break;
            }
          }
          if (lastRunInChat !== null && lastRunInChat !== restoredRunId) {
            dismissedRunIdsRef.current.add(lastRunInChat);
          }
          setLastRunInChat(restoredRunId);
          if (restoredRunId !== null) {
            // Allow the auto-bind effect to keep this id active —
            // history pick is an explicit re-attach, not a dismiss.
            dismissedRunIdsRef.current.delete(restoredRunId);
          }
        })
        .catch(() => {
          // useConversationMessages stores the error code; the rail
          // will surface it in the next render (no extra wiring needed
          // here — the silent catch keeps the optimistic close UX).
        });
    },
    [conversationMessages, loadConversation, lastRunInChat],
  );
  const handleHistoryNewChat = useCallback((): void => {
    resetConversation();
    setHistoryOpen(false);
    // Issue 1 (2026-05-08) — clear the run-completed canvas binding
    // so the workspace returns to a TRUE blank-slate state, not a
    // half-reset where the chat thread cleared but the run summary
    // (Synthèse + KPIs + FailsTable + InvestigationArtefact) stayed
    // visible. Server-side run data is untouched: a quick "history"
    // pick reattaches the prior run if needed.
    //
    // ALSO record the dismissed id in the ref so the auto-bind effect
    // does not resurrect the canvas on the next render (without this,
    // the effect re-fires whenever lastRunInChat===null && currentRunId
    // !== null && run.status==='completed' — defeating the dismissal).
    if (currentRunId !== null) {
      dismissedRunIdsRef.current.add(currentRunId);
    }
    setLastRunInChat(null);
    setSelectedFail(null);
    // Bug 1 + Issue 2 — surface a Regalica greeting that ALSO
    // restates the upload affordance (drag-drop or attach button).
    // Mirrors the canonical Claude / GPT chat onboarding pattern: the
    // assistant opens, names what it can do, and points the user at
    // the next concrete action. The same key fires on initial mount
    // (when no prior conversation + no run is loaded) — see the
    // useEffect below.
    injectRegalicaMessage(t('chat.welcomeGreeting'));
    // Lift the ref guard so the initial-mount effect does not fire a
    // SECOND greeting on top of this one. The ref is global to the
    // workspace lifecycle, not per-conversation, so flagging it true
    // here is correct: any future "first chat" on this page mount
    // came through this handler.
    initialGreetingFiredRef.current = true;
  }, [resetConversation, injectRegalicaMessage, t, currentRunId]);

  // (initial welcome effect declared further down once `pendingUpload`
  // state is in scope — see "Issue 2 — welcome bubble effect" block.)

  // Feature 3 — soft-delete a past thread from the sidebar. When the
  // deleted id is the one currently in view, also reset the in-memory
  // chat (otherwise the user keeps seeing a thread that no longer
  // exists in the listing). Errors are silent for now — the hook
  // refetches on failure to revert the optimistic removal.
  const handleHistoryDelete = useCallback(
    (deletedId: string): void => {
      void deleteConversation(deletedId).catch(() => {
        /* refetch handled inside the hook */
      });
      if (conversationId === deletedId) {
        resetConversation();
      }
    },
    [deleteConversation, conversationId, resetConversation],
  );

  // C — top severe fail for the auto-mounted InvestigationArtefact.
  // Fetched in parallel with the rest of the workspace, mounted only
  // when summary.run.status === 'completed' AND a severe fail is
  // returned (the route filter=fail returns severe + rounding; we
  // gate on severity inside the JSX below to keep the hook simple).
  const topFail = useTopSevereFail(currentRunId);

  // P3 — full fail list for the chat-driven picker. The Workspace
  // already mounts <FailsTable> for the visual list, but the chip
  // handler (handleChipSelect below) used to derive the picker bullet
  // list from `topFail.fail` alone — so the user always saw exactly
  // ONE row even when the run carried 30+ FAILs. Lifting `useFails`
  // here gives the chip handler access to the same paginated list the
  // FailsTable surfaces, with the first page (DEFAULT_PAGE_SIZE = 50)
  // covering the realistic upper bound of fails per annexe in
  // production. The hook tolerates a null run id (returns []) and
  // refetches when currentRunId changes, so no extra reset wiring is
  // needed.
  const { fails: failsForPicker } = useFails(currentRunId, 'all');

  // Sub-Sprint 4 — clicking a row in <FailsTable> selects that fail
  // for the InvestigationArtefact below. Initial value null lets the
  // existing top-severe auto-mount keep working (we fall back to
  // `topFail.fail` when nothing is selected). Setter cleared via the
  // run id reset below if currentRunId flips.
  const [selectedFail, setSelectedFail] = useState<FailDetail | null>(null);
  useEffect(() => {
    setSelectedFail(null);
  }, [currentRunId]);
  // Keep the ref in lockstep with the state so the failContextProvider
  // closure passed to useChat reads the freshest selection at send-time.
  useEffect(() => {
    selectedFailRef.current = selectedFail;
  }, [selectedFail]);
  const investigationFail = selectedFail ?? topFail.fail;

  // P1 — auto-zoom REMOVED. The previous behaviour fired a synthetic
  // chat turn ("Regarde ce FAIL : règle X/Y…") on every completed run
  // with at least one severe fail. The user's reported friction:
  //   "aucune personne n'a demandé […] pourtant je le trouve
  //    automatiquement, cette question doit être posée par
  //    l'utilisateur ou click sur le bouton dans le dock concernant
  //    sur le zoom de fail".
  // The Zoom chip in the dock (T1 "Zoom sur un FAIL") + the clickable
  // FailsTable rows are now the canonical way to trigger an
  // investigation. Regalica no longer narrates without an explicit
  // user signal.

  const upload = useUpload();
  const startRun = useStartRun();
  // B3 — fetch the platform-wide T1 ETA so the Lancer ack message
  // can render "le contrôle prend environ X secondes" without a
  // hardcoded value. Falls back to null (clause omitted) on failure.
  const runEta = useRunEta();
  // Pending upload: the user picked a file but hasn't yet pressed
  // "Lancer". Tracked locally so the Dock area can render the staged
  // file + a launch button. Cleared on either successful run start or
  // explicit reset.
  const [pendingUpload, setPendingUpload] = useState<UploadDto | null>(null);

  // Issue 2 (2026-05-08) — initial-mount welcome bubble effect.
  // Fires once when the four conditions are met:
  //   - the chat thread is empty (messages.length === 0)
  //   - no run is bound to the chat (lastRunInChat === null)
  //   - no upload is currently staged (pendingUpload === null)
  //   - the run loader has finished (!runLoading) so we don't race
  //     against the auto-bind effect that sets lastRunInChat from a
  //     server-side current run
  // The greeting string is the same key as Nouveau chat (see
  // handleHistoryNewChat above) so the user experiences identical
  // onboarding regardless of the entry point. The ref guard keeps it
  // single-shot for the workspace mount.
  useEffect(() => {
    if (initialGreetingFiredRef.current) return;
    if (runLoading) return;
    if (messages.length > 0) return;
    if (lastRunInChat !== null) return;
    if (pendingUpload !== null) return;
    initialGreetingFiredRef.current = true;
    injectRegalicaMessage(t('chat.welcomeGreeting'));
  }, [messages.length, runLoading, lastRunInChat, pendingUpload, injectRegalicaMessage, t]);

  const handleSend = useCallback(
    (text: string): void => {
      void sendMessage(text);
    },
    [sendMessage],
  );

  // Chips whose specialist needs a specific FAIL pivot. When the user
  // clicks one of these without first selecting a row in the FailsTable,
  // Regalica should surface a clickable list of the candidate FAILs
  // instead of guessing one.
  const FAIL_BOUND_CHIPS = useMemo(
    () => new Set<string>(['zoom', 'cluster', 'historical', 'citation', 'simulation']),
    [],
  );

  const handleChipSelect = useCallback(
    (fnName: string): void => {
      // Q1 + P3 — interactive zoom picker. When the chip points at a
      // per-FAIL specialist AND the user hasn't selected a row yet AND
      // the run carries MORE THAN ONE fail, inject a Regalica turn
      // that names ALL the surfaced FAILs (one per line, monospace
      // `ax_term/num_regle` pivots) and tells the user how to pick:
      // either by clicking the matching row in the FailsTable above,
      // or by typing a free-form sentence the rule extractor can
      // parse (« regarde la règle 102 »). With exactly ONE fail in
      // scope the picker is skipped — the orchestrator's default
      // top-fail selection trivially resolves to that single row.
      const pickerCandidates =
        failsForPicker.length > 0 ? failsForPicker : topFail.fail !== null ? [topFail.fail] : [];
      if (
        FAIL_BOUND_CHIPS.has(fnName) &&
        selectedFail === null &&
        pickerCandidates.length >= 2 &&
        currentRunId !== null &&
        run?.status === 'completed'
      ) {
        const lines = pickerCandidates
          .map(
            (f) =>
              `- \`${f.ax_term}/${f.num_regle}\` · ${f.severity === 'severe' ? 'écart sévère' : "écart d'arrondi"}`,
          )
          .join('\n');
        const pickerMarkdown = `Plusieurs écarts sont disponibles dans ce run. Cliquez sur la ligne du tableau « FAILS » ci-dessus correspondant à celui que vous souhaitez analyser, puis relancez votre choix.\n\n${lines}\n\nVous pouvez également préciser la règle directement dans la barre de saisie, par exemple « regarde la règle 102 ».`;
        injectRegalicaMessage(pickerMarkdown);
        return;
      }
      // Otherwise, with or without a selectedFail the chip name is sent
      // as-is — the router classifies it through the canonical intent
      // grammar. When `selectedFail` is set the orchestrator already
      // sees the run+top_fails context via `validation_run_id` in the
      // useChat body, so the specialist resolves the pivot fail.
      void sendMessage(fnName);
    },
    [
      FAIL_BOUND_CHIPS,
      selectedFail,
      failsForPicker,
      topFail.fail,
      currentRunId,
      run?.status,
      injectRegalicaMessage,
      sendMessage,
    ],
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
    // B1+B5 (2026-05-08) — guard against duplicate launches caused
    // by double-clicks on the Lancer button OR by a chat-driven
    // launch_validation intent firing in parallel. Once the ref is
    // true, the function returns immediately until the POST resolves
    // (success or failure both clear the flag).
    if (launchInFlightRef.current) return;
    launchInFlightRef.current = true;

    const fileName = pendingUpload.filename;
    const arreteDate = pendingUpload.arrete_date;
    const etaSeconds = runEta.seconds;

    // 2026-05-08 final order — the user sees a clean causal
    // sequence APPENDED to the existing thread (welcome bubble
    // stays):
    //   1. user message ("Lance la validation BCT T1 sur ...") —
    //      injected NOW so the intent is visible before the network
    //      call, regardless of POST latency.
    //   2. Regalica ack ("Très bien, je lance...") — injected NOW
    //      with a `thinking_trace` placeholder that the ChatTurn
    //      renders as the « Mode thinking » artefact above the ack
    //      response. The artefact auto-collapses when the
    //      typewriter reveals the full ack text. The ETA comes from
    //      platform_config.t1_run_eta_p50_seconds (DB-driven).
    //   3. POST /api/runs in the background. The .then() sets the
    //      run id state without injecting any further chat message.
    //   4. T0 + T1 pipelines run server-side; their synthesis
    //      surfaces as a Regalica bubble below the ack via
    //      RegalicaRunSpeech (rendered AFTER ChatThread in the JSX
    //      so it appears at the bottom of the conversation).
    //
    // We do NOT call resetConversation() — the user explicitly
    // asked for the welcome to stay. The launch sequence is appended
    // to whatever was in the thread before.
    injectUserMessage(t('launchSequence.userIntent', { fileName }));
    injectRegalicaMessage(
      etaSeconds !== null
        ? t('launchSequence.regalicaAckWithEta', {
            fileName,
            arreteDate,
            etaSeconds,
          })
        : t('launchSequence.regalicaAck', { fileName, arreteDate }),
      // Thinking trace placeholder — content lives in i18n
      // (`launchSequence.regalicaAckThinking`) so the wording is
      // localizable and never hardcoded in source.
      t('launchSequence.regalicaAckThinking'),
    );

    void startRun
      .start({
        upload_ids: [pendingUpload.upload_id],
        primary_upload_id: pendingUpload.upload_id,
        arrete_date: pendingUpload.arrete_date,
      })
      .then((res) => {
        setActiveRunId(res.run_id);
        // Issue 1 (UX) — bind this run to the chat surface so the
        // run-completed canvas (Synthèse + KPIs + FailsTable +
        // InvestigationArtefact) is gated to it. When the user later
        // clicks "Nouveau chat", lastRunInChat is cleared and this
        // canvas disappears, giving a true blank slate.
        setLastRunInChat(res.run_id);
        setPendingUpload(null);
        upload.reset();
        // B3 — NO sendMessage here. The user msg + Regalica ack were
        // already injected BEFORE the POST. The T1 pipeline starts
        // automatically on the server side via /upload kickoff
        // (apps/api/src/routes/runs.ts:kickoffEngineAsync) and the
        // synthesis arrives in the thread when chatbot-py persists
        // its aggregator output.
      })
      .catch(() => {
        // No silent swallow: useStartRun stored {code, message} in
        // state and <LaunchErrorArtefact> renders it inside the chat
        // thread (Tranche 1.1). Local catch only prevents the
        // unhandled-rejection warning.
      })
      .finally(() => {
        launchInFlightRef.current = false;
      });
  }, [
    pendingUpload,
    injectUserMessage,
    injectRegalicaMessage,
    startRun,
    t,
    upload,
    runEta.seconds,
  ]);

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
    <UploadDropZone
      onFileAccepted={handleFileSelect}
      disabled={upload.uploading || startRun.starting}
    >
      <div className="app">
        {/* Issue 1 (2026-05-08) — PersonaSidebar + Ribbon are now
            gated on `lastRunInChat === currentRunId`, exactly like
            the Synthèse / FailsTable / InvestigationArtefact below.
            On a fresh app open, lastRunInChat starts null, so the
            sidebar shows the empty/loading state and the ribbon is
            absent — the chat surface starts truly blank with only
            the Regalica welcome bubble. The user gates the canvas
            in by clicking Lancer (which sets lastRunInChat) or by
            picking a past conversation in the history sidebar
            (which restores lastRunInChat from messages.linked_run_id,
            B7). */}
        <PersonaSidebar
          run={lastRunInChat === currentRunId ? run : null}
          loading={lastRunInChat === currentRunId ? runLoading : false}
          mode="workspace"
        />

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

          {lastRunInChat === currentRunId && (
            <Ribbon steps={steps} run={run} runIdShort={runIdShort} />
          )}
          {lastRunInChat === currentRunId && run?.status === 'running' && (
            <ProgressBar runId={currentRunId} />
          )}

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
              <ChatThread messages={messages} />

              {/* 2026-05-08 final layout — the run-completed canvas
                  (Synthèse + KPIs + FailsTable + Investigation +
                  T3 banner) is rendered AFTER ChatThread so the
                  visual flow is welcome → user msg → ack → synthesis.
                  RegalicaRunSpeech wraps everything in a Regalica
                  bubble (avatar + name + time + confidence badge)
                  so the synthesis reads as a chat turn, not a
                  separate canvas card. The user's frustrated
                  observation — "la synthèse apparait tout seul...
                  puis se déplace dans le chat" — was caused by this
                  block being rendered ABOVE ChatThread; moving it
                  below puts the synthesis in its natural causal
                  place. */}
              {run !== null &&
                summary !== null &&
                summary.run.status !== 'completed' &&
                lastRunInChat === currentRunId && (
                  /* Correction 1 — running run keeps the Synthèse external
                 because there is no Regalica bubble to nest it inside
                 yet (the run hasn't completed; no narrative + no
                 confidence to derive). Once status === 'completed' the
                 Synthèse moves INTO the bubble below. */
                  <RunSynthesisCard run={run} annexes={summary.annexes} />
                )}
              {summary !== null &&
                summary.run.status === 'completed' &&
                lastRunInChat === currentRunId && (
                  /* Point 1 + Correction 1 — Regalica's voice OWNS the
                 Synthèse, then the cause-root deliverable (Livrable C),
                 then the FailsTable, then the per-fail decomposition.
                 Everything sits as direct children of .msg-rega__body
                 to match the workspace v5 mockup pattern (:626-697). */
                  <RegalicaRunSpeech run={summary.run}>
                    <RunSynthesisCard run={summary.run} annexes={summary.annexes} />
                    <T1Deliverables run={summary.run} />
                    {currentRunId !== null &&
                      (summary.run.total_fail_severe ?? 0) +
                        (summary.run.total_fail_rounding ?? 0) >
                        0 && (
                        /* Tranche 0.5 W2.2 — validation_fail_details rows
                       persisted by /finalize, banking-format columns
                       surfaced. */
                        <FailsTable
                          runId={currentRunId}
                          filter="all"
                          onFailClick={setSelectedFail}
                          selectedFailId={investigationFail?.id ?? null}
                        />
                      )}
                    {investigationFail !== null && (
                      <InvestigationArtefact fail={investigationFail} />
                    )}
                    <T3LockBanner totalFailSevere={summary.run.total_fail_severe ?? 0} />
                  </RegalicaRunSpeech>
                )}
              {run !== null && summary === null && lastRunInChat === currentRunId && (
                /* Defensive: run row exists but /summary is still pending. */
                <RunSynthesisCard run={run} annexes={[]} />
              )}

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
          onDelete={handleHistoryDelete}
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
  // P3 — banking-grade banner. The previous text leaked internal
  // codes ("T3 ouvert", "T3 verrouillé", "dépôt T3") into the
  // Compliance Officer's surface. The user reported: "T3 T11 T2
  // l'utilisateur s'enfout, rédige quelque chose banking grade".
  // The new copy speaks the banker's vocabulary ("Dépôt autorisé",
  // "Dépôt en attente", "transmission à la BCT") and uses i18n
  // pluralisation so 1 / N is rendered correctly.
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
        {t('t3.lockedMessage', {
          count: totalFailSevere,
          // i18next plural rule fallback when the locale provides
          // both `_one` and `_other` variants.
          defaultValue:
            totalFailSevere === 1
              ? '{{count}} écart sévère à corriger avant la signature et la transmission à la BCT.'
              : '{{count}} écarts sévères à corriger avant la signature et la transmission à la BCT.',
        })}
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
