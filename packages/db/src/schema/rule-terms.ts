// RLS policy: inherit from parent rule's tenant — users access terms only for rules in their tenant.

import {
  pgTable,
  uuid,
  text,
  integer,
  check,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { rules } from './rules';

export const ruleTerms = pgTable(
  'rule_terms',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    ruleId: uuid('rule_id')
      .notNull()
      .references(() => rules.id, { onDelete: 'cascade' }),
    // Position within the rule expression.
    // 1 = left-hand side, 2 = right-hand side, 3 = rare/tertiary position.
    rang: integer('rang').notNull(),
    // Sequence number within the rang group.
    numSeq: integer('num_seq').notNull(),
    // Arithmetic operator linking this term to the next within its rang.
    termOp: text('term_op'),
    // kind values: cell_ref | literal | literal_text
    kind: text('kind').notNull(),
    // Source annexe for this term — may differ from the parent rule's annexe_code (cross-annexe refs).
    axOrigine: text('ax_origine').notNull(),
    rubriquCode: text('rubrique_code'),
    colonne: text('colonne'),
    valeurLiterale: text('valeur_literale'),
  },
  (t) => ({
    kindCheck: check(
      'rule_terms_kind_check',
      sql`${t.kind} IN ('cell_ref','literal','literal_text')`
    ),
  })
);

export const ruleTermsRelations = relations(ruleTerms, ({ one }) => ({
  rule: one(rules, {
    fields: [ruleTerms.ruleId],
    references: [rules.id],
  }),
}));

export type RuleTerm = typeof ruleTerms.$inferSelect;
export type NewRuleTerm = typeof ruleTerms.$inferInsert;
