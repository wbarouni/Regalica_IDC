import { DataTypes, type QueryInterface } from 'sequelize';

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.createTable(
    'tenants',
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: DataTypes.UUIDV4,
      },
      name: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      parent_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'tenants', key: 'id' },
      },
      plan: {
        type: DataTypes.TEXT,
        allowNull: false,
        defaultValue: 'standard',
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

  // Seed the canonical dev tenant (idempotent — ON CONFLICT DO NOTHING)
  await queryInterface.sequelize.query(`
    INSERT INTO tenants (id, name, plan)
    VALUES ('00000000-0000-0000-0000-000000000001', 'Banque Centrale Dev', 'enterprise')
    ON CONFLICT DO NOTHING;
  `);
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('tenants');
}
