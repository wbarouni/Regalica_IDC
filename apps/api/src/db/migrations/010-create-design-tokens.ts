import type { QueryInterface } from 'sequelize';
import { DataTypes } from 'sequelize';

export async function up(qi: QueryInterface): Promise<void> {
  await qi.createTable(
    'design_tokens',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      key: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      value: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      category: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
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

  await qi.sequelize.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_design_tokens_key_active
    ON design_tokens(key) WHERE is_active = TRUE;
  `);

  await qi.sequelize.query(`
    ALTER TABLE design_tokens
    ADD CONSTRAINT IF NOT EXISTS chk_design_tokens_category
    CHECK (category IN ('color','spacing','radius','shadow','typography','animation','layout','blur'));
  `);
}

export async function down(qi: QueryInterface): Promise<void> {
  await qi.dropTable('design_tokens');
}
