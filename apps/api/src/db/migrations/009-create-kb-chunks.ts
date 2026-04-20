import { type QueryInterface } from 'sequelize';

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.sequelize.query(`CREATE EXTENSION IF NOT EXISTS vector;`);

  await queryInterface.sequelize.query(`
    CREATE TABLE IF NOT EXISTS kb_chunks (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id     UUID REFERENCES tenants(id),
      source_ref    TEXT NOT NULL,
      chunk_text    TEXT NOT NULL,
      embedding     vector(768),
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await queryInterface.sequelize.query(`
    CREATE INDEX IF NOT EXISTS idx_kb_chunks_tenant
      ON kb_chunks (tenant_id, source_ref);
  `);

  await queryInterface.sequelize.query(`
    CREATE INDEX IF NOT EXISTS idx_kb_chunks_embedding
      ON kb_chunks USING ivfflat (embedding vector_cosine_ops)
      WITH (lists = 100);
  `);
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.sequelize.query(`DROP TABLE IF EXISTS kb_chunks;`);
}
