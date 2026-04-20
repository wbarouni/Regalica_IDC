import { DataTypes, type QueryInterface } from 'sequelize';

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.createTable(
    'persona_config',
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
      tone: {
        type: DataTypes.TEXT,
        allowNull: false,
        defaultValue: 'precise-warm',
      },
      max_length_factual: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 150,
      },
      max_length_analytical: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 800,
      },
      confidence_threshold: {
        type: DataTypes.DECIMAL(4, 3),
        allowNull: false,
        defaultValue: 0.950,
      },
      locale_default: {
        type: DataTypes.TEXT,
        allowNull: false,
        defaultValue: 'fr',
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    { ifNotExists: true } as any,
  );
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('persona_config');
}
