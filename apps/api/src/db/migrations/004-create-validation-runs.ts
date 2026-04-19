import { DataTypes, type QueryInterface } from 'sequelize';

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.createTable(
    'validation_runs',
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
      bank_code: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      date_annexe: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      status: {
        type: DataTypes.TEXT,
        allowNull: false,
        defaultValue: 'pending',
      },
      pass_count: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      fail_count: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      skip_count: {
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

  await queryInterface.addIndex('validation_runs', ['tenant_id', 'created_at'], {
    name: 'idx_validation_runs_tenant',
  });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('validation_runs');
}
