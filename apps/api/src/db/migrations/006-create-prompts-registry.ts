import { DataTypes, type QueryInterface } from 'sequelize';

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.createTable(
    'prompts_registry',
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: DataTypes.UUIDV4,
      },
      tenant_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'tenants', key: 'id' },
      },
      key: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      locale: {
        type: DataTypes.TEXT,
        allowNull: false,
        defaultValue: 'fr',
      },
      version: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
      },
      content: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      variables: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: [],
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

  // Unique constraint: one version per (tenant, key, locale)
  await queryInterface.addIndex(
    'prompts_registry',
    ['tenant_id', 'key', 'locale', 'version'],
    {
      unique: true,
      name: 'prompts_registry_tenant_key_locale_version_unique',
    },
  );

  // Fast lookup index for key + locale + active flag
  await queryInterface.sequelize.query(`
    CREATE INDEX IF NOT EXISTS idx_prompts_registry_key
      ON prompts_registry (key, locale, is_active);
  `);
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('prompts_registry');
}
