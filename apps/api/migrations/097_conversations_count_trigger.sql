-- Migration 097_conversations_count_trigger.sql
-- Object: maintain `conversations.messages_count` and
--         `conversations.tokens_total` automatically via an INSERT
--         trigger on the `messages` table. Also bump
--         `conversations.updated_at` so the history sidebar's
--         "most recent" ordering surfaces the live thread first.
--
--         The columns existed since migration 031 (`messages_count
--         INTEGER NOT NULL DEFAULT 0`, `tokens_total INTEGER NOT NULL
--         DEFAULT 0`) but no path ever incremented them — the chat
--         history sidebar consequently displayed "0 msg" on every
--         row regardless of how many turns the conversation
--         actually held. The bug surfaced in the diagnostic dated
--         2026-05-08:
--           "l'historique chat affiche tjs 0 msg"
--
--         A trigger is the right home for this counter:
--           - INSERT on `messages` happens from BOTH chatbot-py
--             (`apps/chatbot-py/app/routes/chat.py:_persist_message`)
--             AND the engine (`apps/api/src/routes/engine.ts`
--             /messages endpoint). Maintaining the counter at every
--             call site would be a fragile multi-codebase contract;
--             the trigger gives a single writer.
--           - The `messages` table is already INSERT-only (immutability
--             trigger from migration 032) so the counter only ever
--             grows. No DELETE / UPDATE concerns.
--           - The counter increments by 1 per row including
--             `regalica_thinking` and internal turns; the chat
--             surface filters these out at SELECT time
--             (apps/api/src/routes/conversations.ts SURFACED_ROLES
--             constant). Keeping the counter inclusive lets a future
--             admin view audit every message's contribution to
--             tokens_total without joining roles.
--
--         tokens_total accumulates `tokens_input + tokens_output +
--         tokens_thinking` from each Regalica response row (NULLs
--         coalesce to 0). User messages and engine notifications
--         carry no tokens, so the counter remains LLM-cost-accurate.
--
--         updated_at is bumped on every INSERT so the
--         `conv_idx_user_recent` partial index ordering reflects the
--         actual last-activity timestamp without a separate UPDATE
--         from each writer path.
--
--         Idempotent: CREATE OR REPLACE on the function, DROP +
--         CREATE on the trigger so re-applying the migration
--         converges on the same definition.
--
--         RLS: the trigger runs in the writer's session, so the
--         UPDATE on `conversations` inherits the writer's
--         `app.current_tenant_id` / `app.current_user_id` GUCs. The
--         conversations_update policy from migration 031 gates this
--         to (tenant_id = caller tenant AND user_id = caller user)
--         — both already true by construction (the writer just
--         INSERTed into a conversation it owns).
--
-- Author: ALGORIA Factory
-- Date: 2026-05-08
-- Depends on: 031_conversations.sql, 032_messages.sql.

CREATE OR REPLACE FUNCTION conversations_bump_on_message_insert()
RETURNS TRIGGER AS $$
BEGIN
  -- Single UPDATE per inserted message. The COALESCE(NEW.tokens_*, 0)
  -- guards user/system rows that carry no token columns. NULL +
  -- INTEGER yields NULL in Postgres, which would propagate into the
  -- counter and break the NOT NULL constraint — COALESCE is the
  -- structural guard.
  UPDATE conversations
     SET messages_count = messages_count + 1,
         tokens_total   = tokens_total
                        + COALESCE(NEW.tokens_input, 0)
                        + COALESCE(NEW.tokens_output, 0)
                        + COALESCE(NEW.tokens_thinking, 0),
         updated_at     = NOW()
   WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS messages_bump_conversation_counters ON messages;
CREATE TRIGGER messages_bump_conversation_counters
  AFTER INSERT ON messages
  FOR EACH ROW EXECUTE FUNCTION conversations_bump_on_message_insert();

-- Backfill: for tenants that already have messages but stale
-- messages_count = 0, recompute the counter once. Idempotent — a
-- second run updates each row to the same value the trigger would
-- have written.
UPDATE conversations c
   SET messages_count = sub.cnt,
       tokens_total   = sub.tok,
       updated_at     = GREATEST(c.updated_at, sub.last_msg)
  FROM (
    SELECT conversation_id,
           COUNT(*)::int                                   AS cnt,
           SUM(COALESCE(tokens_input, 0)
             + COALESCE(tokens_output, 0)
             + COALESCE(tokens_thinking, 0))::int          AS tok,
           MAX(created_at)                                 AS last_msg
      FROM messages
     GROUP BY conversation_id
  ) sub
 WHERE sub.conversation_id = c.id
   AND (c.messages_count <> sub.cnt OR c.tokens_total <> sub.tok);
