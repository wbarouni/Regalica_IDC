import { DataTypes, type QueryInterface } from 'sequelize';

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.createTable(
    'regalica_responses_audit',
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: DataTypes.UUIDV4,
      },
      tenant_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'tenants', key: 'id' },
      },
      session_id: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      prompt_key: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      user_input: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      response_text: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      citations: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: [],
      },
      confidence: {
        type: DataTypes.DECIMAL(4, 3),
        allowNull: false,
      },
      format_type: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      guardrail_passed: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      tokens_used: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      latency_ms: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    { ifNotExists: true } as any,
  );

  // CHECK constraint on format_type to enforce valid enum values
  await queryInterface.sequelize.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'regalica_responses_audit_format_type_check'
          AND conrelid = 'regalica_responses_audit'::regclass
      ) THEN
        ALTER TABLE regalica_responses_audit
          ADD CONSTRAINT regalica_responses_audit_format_type_check
          CHECK (format_type IN (
            'factuelle', 'comparative', 'enumerative', 'analytique',
            'technique', 'regle_bct', 'ambigue'
          ));
      END IF;
    END
    $$;
  `);

  // Tenant + time descending index for audit queries
  await queryInterface.sequelize.query(`
    CREATE INDEX IF NOT EXISTS idx_regalica_audit_tenant
      ON regalica_responses_audit (tenant_id, created_at DESC);
  `);
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('regalica_responses_audit');
}
