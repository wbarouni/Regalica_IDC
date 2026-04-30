import { useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import { useNavigate } from 'react-router-dom';
import remarkGfm from 'remark-gfm';

import { LanguageSwitcher } from '../components/primitives/LanguageSwitcher';
import { PersonaSidebar } from '../components/layout/PersonaSidebar';
import { useChat, type ChatMessage } from '../hooks/useChat';
import { useCurrentRun } from '../hooks/useCurrentRun';
import { useNotifications } from '../hooks/useNotifications';
import { useRunSummary } from '../hooks/useRunSummary';
import type { Notification, ValidationRun } from '../types/api';

type AgentStatus = 'done' | 'current' | 'pending';

interface AgentStep {
  readonly id: string;
  readonly tKey: string;
  readonly fn: string;
  readonly status: AgentStatus;
}

// Static pipeline grammar (Doc 10 §15). The dynamic per-run agent
// status table (`run_agent_steps`) is not yet implemented in
// migrations; the API returns 501 for /agents. Until that table
// lands, every step is rendered as `pending` — when the live state
// is wired, status comes from the API payload.
const PIPELINE_STEPS: readonly AgentStep[] = [
  { id: 'ingestor', tKey: 'agent.ingestor', fn: 'parse_xml', status: 'pending' },
  { id: 'dependency', tKey: 'agent.dependency', fn: 'resolve_deps', status: 'pending' },
  { id: 'temporal', tKey: 'agent.temporal', fn: 'check_dates', status: 'pending' },
  { id: 'xsd', tKey: 'agent.xsd', fn: 'validate_xsd', status: 'pending' },
  { id: 'embedded', tKey: 'agent.embedded', fn: 'check_embedded', status: 'pending' },
  { id: 'rdg', tKey: 'agent.rdg', fn: 'evaluate_rules', status: 'pending' },
  { id: 'investigator', tKey: 'agent.investigator', fn: 'inspect_fails', status: 'pending' },
  { id: 'citation', tKey: 'agent.citation', fn: 'cite_sources', status: 'pending' },
  { id: 'reporter', tKey: 'agent.reporter', fn: 'compose_report', status: 'pending' },
  { id: 'historical', tKey: 'agent.historical', fn: 'compare_runs', status: 'pending' },
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
        {t('error.noActiveRunHint', 'Importez un dépôt XML pour démarrer une validation.')}
      </p>
    </div>
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
          <div className={['text-2xl font-medium font-mono', c.tone].join(' ')}>{c.value}</div>
        </div>
      ))}
    </div>
  );
}

function Ribbon({ steps, runIdShort }: { steps: readonly AgentStep[]; runIdShort: string | null }) {
  const { t } = useTranslation();
  return (
    <section className="ribbon" aria-label={t('orchestration.title')}>
      <div className="ribbon__header">
        <span className="ribbon__title">{t('orchestration.title')}</span>
        {runIdShort !== null && <span className="ribbon__meta">#{runIdShort}</span>}
      </div>
      <div className="ribbon__track" role="list">
        {steps.map((s) => (
          <div key={s.id} className={`agent agent--${s.status}`} role="listitem">
            <span className="agent__dot" aria-hidden="true" />
            <span className="agent__labels">
              <span className="agent__name">{t(s.tKey)}</span>
              <span className="agent__fn">{s.fn}</span>
            </span>
          </div>
        ))}
      </div>
    </section>
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

function Composer() {
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
  const navigate = useNavigate();
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

  const runIdShort = run !== null ? run.run_id.slice(0, 8) : null;

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

        <Ribbon steps={PIPELINE_STEPS} runIdShort={runIdShort} />

        <div className="thread-scroll">
          <div className="thread">
            {runLoading && <LoadingState />}
            {!runLoading && run === null && runError === null && <NoActiveRun />}
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

            <Composer />
          </div>
        </div>
      </main>
    </div>
  );
}
