// Knowledge base chunks for RAG (Retrieval-Augmented Generation).
// The embedding column uses pgvector (vector extension must be enabled in Postgres).
// Run: CREATE EXTENSION IF NOT EXISTS vector; before applying migrations.
//
// RLS policy: authenticated users may read active chunks for their tenant.
// Write access is restricted to the ingestion service role.
//
// Similarity search example (pgvector):
//   SELECT * FROM kb_chunks
//   ORDER BY embedding <=> $queryEmbedding
//   LIMIT 10;

import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  jsonb,
  timestamp,
} from 'drizzle-orm/pg-core';
import { vector } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { tenants } from './tenants';

export const kbChunks = pgTable('kb_chunks', {
  id: uuid('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'restrict' }),
  // Document origin, e.g. 'BCT_Circulaire_2023_08.pdf' or 'RDG_Annexe_132_v4.docx'.
  sourceDoc: text('source_doc').notNull(),
  // Page number within the source document (1-indexed). Null for non-paginated sources.
  sourcePage: integer('source_page'),
  chunkText: text('chunk_text').notNull(),
  // SHA-256 hex digest of chunk_text for deduplication and integrity checks.
  chunkHash: text('chunk_hash').notNull(),
  // 768-dimensional sentence embedding vector (pgvector).
  // Requires: CREATE EXTENSION IF NOT EXISTS vector;
  embedding: vector('embedding', { dimensions: 768 }),
  // Arbitrary metadata: e.g. { "section": "Art. 12", "language": "fr" }
  metadata: jsonb('metadata'),
  // Snapshot version of the KB this chunk belongs to, for audit trail.
  kbVersion: text('kb_version'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
    .notNull()
    .defaultNow(),
});

export const kbChunksRelations = relations(kbChunks, ({ one }) => ({
  tenant: one(tenants, {
    fields: [kbChunks.tenantId],
    references: [tenants.id],
  }),
}));

export type KbChunk = typeof kbChunks.$inferSelect;
export type NewKbChunk = typeof kbChunks.$inferInsert;
