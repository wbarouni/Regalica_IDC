import { useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { TENANT_DISPLAY_NAME } from '../lib/config';
import { useChat, type ChatMessage } from '../hooks/useChat';
import { useCurrentRun } from '../hooks/useCurrentRun';
import { useNotifications } from '../hooks/useNotifications';
import { useRunSummary } from '../hooks/useRunSummary';
import type { Notification, ValidationRun } from '../types/api';

// Static pipeline grammar (Doc 10 §15). The dynamic per-run agent
// status table (`run_agent_steps`) is not yet implemented in
// migrations; the API returns 501 for /agents. Until that table
// lands, the ribbon shows the canonical pipeline names with a
// neutral status.
const PIPELINE_STEPS: readonly { id: string; tKey: string }[] = [
  { id: 'ingestor', tKey: 'agent.ingestor' },
  { id: 'dependency', tKey: 'agent.dependency' },
  { id: 'temporal', tKey: 'agent.temporal' },
  { id: 'xsd', tKey: 'agent.xsd' },
  { id: 'embedded', tKey: 'agent.embedded' },
  { id: 'rdg', tKey: 'agent.rdg' },
  { id: 'investigator', tKey: 'agent.investigator' },
  { id: 'citation', tKey: 'agent.citation' },
  { id: 'reporter', tKey: 'agent.reporter' },
  { id: 'historical', tKey: 'agent.historical' },
];

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
    <div className="rounded-lg border border-stone-200 bg-stone-100 p-6 text-sm text-stone-700">
      {t('error.noActiveRun')}
    </div>
  );
}

function PersonaStats({ run }: { run: ValidationRun | null }) {
  const { t } = useTranslation();
  const tenantName = TENANT_DISPLAY_NAME ?? '—';
  const arrete = run?.arrete_date ?? '—';
  const runShort = run !== null ? `#${run.run_id.slice(0, 8)}` : '—';
  const fails = run?.total_fail_severe ?? 0;
  return (
    <aside className="border border-stone-200 rounded-lg p-4 space-y-3 text-sm">
      <div className="font-mono text-xs uppercase tracking-wider text-stone-500">
        {t('persona.context')}
      </div>
      <div className="space-y-2">
        <div className="flex justify-between">
          <span className="text-stone-700">{t('persona.tenant')}</span>
          <span className="font-mono">{tenantName}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-stone-700">{t('persona.arrete')}</span>
          <span className="font-mono">{arrete}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-stone-700">{t('persona.run')}</span>
          <span className="font-mono">{runShort}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-stone-700">{t('persona.failsSevere')}</span>
          <span className="font-mono text-vermilion-600">{fails}</span>
        </div>
      </div>
    </aside>
  );
}

function NotificationsList({
  notifications,
  loading,
  onMark,
}: {
  notifications: Notification[];
  loading: boolean;
  onMark: (id: string) => void;
}) {
  const { t } = useTranslation();
  if (loading) return <LoadingState />;
  if (notifications.length === 0) {
    return <p className="text-stone-500 text-sm font-mono">{t('notifications.empty')}</p>;
  }
  return (
    <ul className="space-y-2">
      {notifications.map((n) => (
        <li
          key={n.id}
          className="border border-stone-200 rounded-lg p-3 text-sm flex items-start gap-3"
        >
          <span
            className={[
              'mt-1 inline-block w-2 h-2 rounded-full flex-shrink-0',
              n.urgency_level === 'action_required'
                ? 'bg-vermilion-500'
                : n.urgency_level === 'attention'
                  ? 'bg-amber-500'
                  : 'bg-azure-500',
            ].join(' ')}
            aria-hidden="true"
          />
          <div className="flex-1 min-w-0">
            <div className="font-medium">{n.title}</div>
            <div className="text-stone-700 mt-1">{n.body}</div>
          </div>
          <button
            type="button"
            onClick={() => onMark(n.id)}
            className="text-xs font-mono text-stone-500 hover:text-ink"
          >
            {t('action.markRead')}
          </button>
        </li>
      ))}
    </ul>
  );
}

function KpiGrid({ run }: { run: ValidationRun }) {
  const { t } = useTranslation();
  const conformity =
    run.conformity_rate !== null ? `${(run.conformity_rate * 100).toFixed(2)}%` : '—';
  const cells: { label: string; value: string; tone: string }[] = [
    {
      label: t('kpi.conformity'),
      value: conformity,
      tone: 'text-evergreen-700',
    },
    {
      label: t('kpi.evaluated'),
      value: String(run.total_rules_evaluated ?? '—'),
      tone: 'text-ink',
    },
    {
      label: t('kpi.pass'),
      value: String(run.total_pass ?? '—'),
      tone: 'text-evergreen-700',
    },
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
          <div className={['text-2xl font-medium font-mono', c.tone].join(' ')}>{c.value}</div>
        </div>
      ))}
    </div>
  );
}

function PipelineRibbon() {
  const { t } = useTranslation();
  return (
    <div className="border border-stone-200 rounded-lg p-3 overflow-x-auto">
      <div className="flex items-center gap-2 text-xs font-mono">
        {PIPELINE_STEPS.map((step, i) => (
          <span key={step.id} className="flex items-center gap-2 flex-shrink-0">
            <span className="inline-block w-2 h-2 rounded-full bg-stone-300" aria-hidden="true" />
            <span className="text-stone-700 whitespace-nowrap">{t(step.tKey)}</span>
            {i < PIPELINE_STEPS.length - 1 && (
              <span className="text-stone-300" aria-hidden="true">
                ›
              </span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

function ChatTurn({ message }: { message: ChatMessage }) {
  const { t } = useTranslation();
  const [traceOpen, setTraceOpen] = useState<boolean>(false);
  if (message.role === 'user') {
    return (
      <div className="msg-user">
        <span>{message.content}</span>
        <div className="msg-user__meta">{new Date(message.timestamp).toLocaleTimeString()}</div>
      </div>
    );
  }
  const trace = message.thinking_trace ?? null;
  return (
    <div className="msg-rega">
      <div className="msg-rega__avatar" />
      <div className="msg-rega__body">
        <div className="msg-rega__head">
          <span className="msg-rega__name">Regalica</span>
          <span className="msg-rega__time">{new Date(message.timestamp).toLocaleTimeString()}</span>
        </div>
        <div className="msg-rega__text">
          <p>{message.content}</p>
        </div>
        {trace !== null && trace.length > 0 && (
          <article className="artefact" data-state={traceOpen ? 'expanded' : 'collapsed'}>
            <header className="artefact__header" onClick={() => setTraceOpen((v) => !v)}>
              <span className="artefact__title">{t('chat.thinking')}</span>
              <span className="artefact__badge artefact__badge--rega">trace</span>
            </header>
            <div className="artefact__body">
              <p style={{ fontSize: '13px', color: 'var(--stone-800)' }}>{trace}</p>
              {message.agents_called !== undefined && message.agents_called.length > 0 && (
                <p
                  style={{
                    marginTop: '8px',
                    fontSize: '11px',
                    color: 'var(--stone-600)',
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  {message.agents_called.join(' / ')}
                </p>
              )}
            </div>
          </article>
        )}
      </div>
    </div>
  );
}

function Composer({ runId: _runId }: { runId: string | null }) {
  const { t } = useTranslation();
  const { messages, loading, error, sendMessage, clearError } = useChat();
  const [text, setText] = useState<string>('');

  async function handleSubmit(): Promise<void> {
    if (text.trim().length === 0 || loading) return;
    const payload = text;
    setText('');
    await sendMessage(payload);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>): void {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSubmit();
    }
  }

  return (
    <div className="border-t border-stone-200 pt-3 space-y-3">
      {messages.length > 0 && (
        <div className="space-y-3">
          {messages.map((m) => (
            <ChatTurn key={m.id} message={m} />
          ))}
        </div>
      )}
      {error !== null && (
        <div className="text-xs font-mono text-vermilion-700 flex items-center gap-2" role="alert">
          <span>{error === 'MISSING_CONFIG' ? t('chat.errorConfig') : t('chat.errorGeneric')}</span>
          <button type="button" onClick={clearError} className="underline hover:text-ink">
            ×
          </button>
        </div>
      )}
      <div className="flex gap-2 items-end">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t('chat.inputPlaceholder')}
          rows={1}
          disabled={loading}
          className="flex-1 border border-stone-300 rounded-lg px-3 py-2 text-sm
                     focus:outline-none focus:border-marigold resize-none
                     disabled:opacity-60"
        />
        <button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={loading || text.trim().length === 0}
          className="px-4 py-2 bg-ink text-paper rounded-lg text-sm font-medium
                     disabled:opacity-50 disabled:cursor-not-allowed hover:bg-stone-800"
        >
          {loading ? t('chat.thinking') : t('chat.sendButton')}
        </button>
      </div>
    </div>
  );
}

export default function Workspace() {
  const { t } = useTranslation();
  const { run, loading: runLoading, error: runError } = useCurrentRun();
  const { summary } = useRunSummary(run?.run_id ?? null);
  const { notifications, loading: notifLoading, markAsRead } = useNotifications();

  if (
    runError === 'MISSING_TENANT_ID' ||
    runError === 'MISSING_API_URL' ||
    runError === 'MISSING_USER_ID'
  ) {
    return <ConfigMissingState missing={runError} />;
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6">
        <PersonaStats run={run} />
        <div className="space-y-4">
          <PipelineRibbon />
          {runLoading && <LoadingState />}
          {!runLoading && run === null && runError === 'NO_ACTIVE_RUN' && <NoActiveRun />}
          {run !== null && (
            <>
              <KpiGrid run={run} />
              {summary !== null && summary.annexes.length > 0 && (
                <div>
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
            </>
          )}
        </div>
      </div>

      <section>
        <div className="font-mono text-[10px] uppercase tracking-wider text-stone-500 mb-2">
          {t('notifications.title')}
        </div>
        <NotificationsList
          notifications={notifications}
          loading={notifLoading}
          onMark={(id) => {
            void markAsRead(id);
          }}
        />
      </section>

      <Composer runId={run?.run_id ?? null} />
    </div>
  );
}
