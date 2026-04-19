import { DataTypes, type QueryInterface } from 'sequelize';

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.createTable(
    'rules',
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
      annexe_code: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      num_regle: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      oper_regle: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      type_ctrl: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      domaine: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      lib_annexe: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      zone_texte: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      is_formalized: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      version: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    { ifNotExists: true } as any,
  );

  // CHECK constraints via raw SQL (Sequelize createTable does not expose CHECK)
  await queryInterface.sequelize.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'rules_oper_regle_check' AND conrelid = 'rules'::regclass
      ) THEN
        ALTER TABLE rules
          ADD CONSTRAINT rules_oper_regle_check
          CHECK (oper_regle IN ('=', '>=', '<=', '>', '<', 'SUM', 'MAX', 'MIN', 'VA'));
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'rules_type_ctrl_check' AND conrelid = 'rules'::regclass
      ) THEN
        ALTER TABLE rules
          ADD CONSTRAINT rules_type_ctrl_check
          CHECK (type_ctrl IN ('intra_ax', 'inter_ax'));
      END IF;
    END
    $$;
  `);

  // Unique constraint: one active version key per tenant+annexe+rule+version
  await queryInterface.addIndex('rules', ['tenant_id', 'annexe_code', 'num_regle', 'version'], {
    unique: true,
    name: 'rules_tenant_annexe_num_version_unique',
  });

  // Partial index for fast active-rule lookups
  await queryInterface.sequelize.query(`
    CREATE INDEX IF NOT EXISTS idx_rules_annexe_num
      ON rules (tenant_id, annexe_code, num_regle)
      WHERE is_active = TRUE;
  `);
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('rules');
}
