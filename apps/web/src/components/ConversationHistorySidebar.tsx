import { useTranslation } from 'react-i18next';

import type { Conversation } from '../types/api';

/**
 * Fix-5 — historique des conversations.
 *
 * Floats over the workspace canvas as a collapsible right-side panel
 * listing the user's 20 most recent conversations. The active row is
 * highlighted; clicking another row triggers `onSelect(id)` so the
 * parent can swap the active conversation_id and reload the message
 * thread. Closes via the chevron header — collapsed mode keeps a
 * narrow rail with just the conversations icon for affordance.
 *
 * Doctrine:
 *   * No persistence of "open / closed" state across reloads — the
 *     sidebar opens collapsed by default to avoid stealing horizontal
 *     space until the user explicitly asks for the history.
 *   * No DELETE / archive UI in V1 — listing only.
 *   * The "Nouveau chat" button at the top forwards `onNewChat()` so
 *     the parent can call `useChat.resetConversation()` (Sub-Sprint D).
 */

export interface ConversationHistorySidebarProps {
  conversations: readonly Conversation[];
  loading: boolean;
  activeConversationId: string | null;
  open: boolean;
  onToggle: () => void;
  onSelect: (conversationId: string) => void;
  onNewChat: () => void;
}

export function ConversationHistorySidebar({
  conversations,
  loading,
  activeConversationId,
  open,
  onToggle,
  onSelect,
  onNewChat,
}: ConversationHistorySidebarProps): JSX.Element {
  const { t } = useTranslation();

  if (!open) {
    return (
      <button
        type="button"
        onClick={onToggle}
        aria-label={t('history.openLabel', { defaultValue: "Ouvrir l'historique" })}
        data-testid="history-sidebar-toggle-closed"
        style={{
          position: 'fixed',
          right: 0,
          top: '88px',
          zIndex: 40,
          width: '32px',
          height: '64px',
          padding: 0,
          background: 'var(--paper-pure, #fffdf8)',
          border: '1px solid var(--stone-200)',
          borderRight: 'none',
          borderRadius: '6px 0 0 6px',
          cursor: 'pointer',
          fontSize: '14px',
          color: 'var(--stone-700)',
          boxShadow: '-2px 2px 8px rgba(0,0,0,0.04)',
        }}
      >
        ‹
      </button>
    );
  }

  return (
    <aside
      data-testid="history-sidebar"
      style={{
        position: 'fixed',
        right: 0,
        top: '64px',
        bottom: 0,
        zIndex: 40,
        width: '280px',
        background: 'var(--paper-pure, #fffdf8)',
        borderLeft: '1px solid var(--stone-200)',
        boxShadow: '-4px 0 12px rgba(0,0,0,0.04)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <header
        style={{
          padding: '12px 14px',
          borderBottom: '1px solid var(--stone-200)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            fontSize: '11px',
            fontWeight: 500,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: 'var(--stone-700)',
          }}
        >
          {t('history.title', { defaultValue: 'Historique' })}
        </div>
        <button
          type="button"
          onClick={onToggle}
          aria-label={t('history.closeLabel', { defaultValue: "Fermer l'historique" })}
          style={{
            background: 'transparent',
            border: 'none',
            padding: '4px 8px',
            cursor: 'pointer',
            fontSize: '14px',
            color: 'var(--stone-700)',
            lineHeight: 1,
          }}
        >
          ›
        </button>
      </header>

      <div
        style={{
          padding: '12px 14px',
          borderBottom: '1px solid var(--stone-200)',
          flexShrink: 0,
        }}
      >
        <button
          type="button"
          onClick={onNewChat}
          data-testid="history-new-chat"
          style={{
            width: '100%',
            padding: '8px 10px',
            background: 'var(--ink, #1a1a1a)',
            color: 'var(--paper-pure, #fffdf8)',
            border: 'none',
            borderRadius: '4px',
            fontSize: '12px',
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          {t('history.newChat', { defaultValue: '+ Nouveau chat' })}
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading && conversations.length === 0 && (
          <div
            style={{
              padding: '20px 14px',
              fontSize: '12px',
              color: 'var(--stone-500)',
              fontFamily: 'var(--font-mono, monospace)',
            }}
          >
            {t('loading')}
          </div>
        )}

        {!loading && conversations.length === 0 && (
          <div
            style={{
              padding: '20px 14px',
              fontSize: '12px',
              color: 'var(--stone-500)',
            }}
          >
            {t('history.empty', {
              defaultValue: 'Aucune conversation passée.',
            })}
          </div>
        )}

        <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
          {conversations.map((c) => {
            const isActive = c.id === activeConversationId;
            const titleText =
              c.title !== null && c.title.length > 0
                ? c.title
                : t('history.untitled', { defaultValue: 'Conversation sans titre' });
            const updated = new Date(c.updated_at);
            const updatedLabel = updated.toLocaleDateString('fr-FR', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
            });
            return (
              <li
                key={c.id}
                style={{
                  borderBottom: '1px solid var(--stone-100)',
                }}
              >
                <button
                  type="button"
                  onClick={() => onSelect(c.id)}
                  data-testid={`history-conversation-${c.id}`}
                  aria-pressed={isActive}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    textAlign: 'left',
                    background: isActive ? 'var(--marigold-50, #fcf4e0)' : 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                    color: 'var(--ink, #1a1a1a)',
                    fontFamily: 'inherit',
                    transition: 'background 80ms ease',
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.background = 'var(--stone-50, #f7f5f0)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.background = 'transparent';
                    }
                  }}
                >
                  <span
                    style={{
                      fontSize: '13px',
                      fontWeight: isActive ? 500 : 400,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {titleText}
                  </span>
                  <span
                    style={{
                      fontSize: '10.5px',
                      color: 'var(--stone-600, #6b6b6b)',
                      fontFamily: 'var(--font-mono, monospace)',
                      display: 'flex',
                      gap: '8px',
                    }}
                  >
                    <span>{updatedLabel}</span>
                    <span>·</span>
                    <span>
                      {c.messages_count} {t('history.messagesAbbrev', { defaultValue: 'msg' })}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </aside>
  );
}
