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
  /**
   * Feature 3 — soft-delete a past thread. The button is rendered
   * inline next to each row (right-aligned, low-emphasis until
   * hovered). Optional so the prop stays backward-compat with any
   * read-only mount; when omitted, no delete affordance is shown.
   */
  onDelete?: (conversationId: string) => void;
}

export function ConversationHistorySidebar({
  conversations,
  loading,
  activeConversationId,
  open,
  onToggle,
  onSelect,
  onNewChat,
  onDelete,
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
                  position: 'relative',
                  display: 'flex',
                  alignItems: 'stretch',
                  background: isActive ? 'var(--marigold-50, #fcf4e0)' : 'transparent',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.background = 'var(--stone-50, #f7f5f0)';
                  }
                  const del =
                    e.currentTarget.querySelector<HTMLButtonElement>('[data-history-delete]');
                  if (del !== null) {
                    del.style.opacity = '1';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.background = 'transparent';
                  }
                  const del =
                    e.currentTarget.querySelector<HTMLButtonElement>('[data-history-delete]');
                  if (del !== null) {
                    del.style.opacity = '0';
                  }
                }}
              >
                <button
                  type="button"
                  onClick={() => onSelect(c.id)}
                  data-testid={`history-conversation-${c.id}`}
                  aria-pressed={isActive}
                  style={{
                    flex: 1,
                    padding: '10px 14px',
                    textAlign: 'left',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                    color: 'var(--ink, #1a1a1a)',
                    fontFamily: 'inherit',
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
                {onDelete !== undefined && (
                  <button
                    type="button"
                    data-history-delete
                    data-testid={`history-delete-${c.id}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      const confirmLabel = t('history.deleteConfirm', {
                        defaultValue: 'Supprimer cette conversation ?',
                      });
                      if (window.confirm(confirmLabel)) {
                        onDelete(c.id);
                      }
                    }}
                    aria-label={t('history.deleteLabel', {
                      defaultValue: 'Supprimer la conversation',
                    })}
                    title={t('history.deleteLabel', {
                      defaultValue: 'Supprimer la conversation',
                    })}
                    style={{
                      // Low-emphasis until hovered (opacity controlled by
                      // parent <li> handlers above). The button stays
                      // focusable for keyboard users — opacity 0 with
                      // visible focus ring on :focus-visible.
                      opacity: 0,
                      transition: 'opacity 100ms ease, color 100ms ease',
                      width: '32px',
                      flexShrink: 0,
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      color: 'var(--stone-500, #888)',
                      fontSize: '14px',
                      lineHeight: 1,
                      padding: 0,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = 'var(--vermilion-700, #b03030)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = 'var(--stone-500, #888)';
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.opacity = '1';
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.opacity = '0';
                    }}
                  >
                    {/* Trash icon — vector inline so we don't pull a new
                        icon dependency. Stroke matches Lucide's "trash-2"
                        glyph for consistency with the rest of the UI. */}
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.75"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M3 6h18" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      <line x1="10" y1="11" x2="10" y2="17" />
                      <line x1="14" y1="11" x2="14" y2="17" />
                    </svg>
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </aside>
  );
}
