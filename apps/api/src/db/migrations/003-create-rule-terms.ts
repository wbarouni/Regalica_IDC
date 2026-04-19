import { DataTypes, type QueryInterface } from 'sequelize';

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.createTable(
    'rule_terms',
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: DataTypes.UUIDV4,
      },
      rule_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'rules', key: 'id' },
        onDelete: 'CASCADE',
      },
      rang: {
        type: DataTypes.SMALLINT,
        allowNull: false,
      },
      num_seq: {
        type: DataTypes.SMALLINT,
        allowNull: false,
      },
      term_op: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      kind: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      ax_origine: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      rubrique_code: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      colonne: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      // DECIMAL(28,8) matches the model definition; stored as string in JS via decimal.js
      literal_value: {
        type: DataTypes.DECIMAL(28, 8),
        allowNull: true,
      },
      literal_text: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
    },
    { ifNotExists: true } as any,
  );

  // CHECK constraints
  await queryInterface.sequelize.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'rule_terms_rang_check' AND conrelid = 'rule_terms'::regclass
      ) THEN
        ALTER TABLE rule_terms
          ADD CONSTRAINT rule_terms_rang_check
          CHECK (rang IN (1, 2, 3));
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'rule_terms_term_op_check' AND conrelid = 'rule_terms'::regclass
      ) THEN
        ALTER TABLE rule_terms
          ADD CONSTRAINT rule_terms_term_op_check
          CHECK (term_op IN ('+', '-', '*', '/'));
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'rule_terms_kind_check' AND conrelid = 'rule_terms'::regclass
      ) THEN
        ALTER TABLE rule_terms
          ADD CONSTRAINT rule_terms_kind_check
          CHECK (kind IN ('cell_ref', 'literal', 'literal_text'));
      END IF;
    END
    $$;
  `);

  await queryInterface.addIndex('rule_terms', ['rule_id', 'rang', 'num_seq'], {
    name: 'idx_rule_terms_rule',
  });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('rule_terms');
}
