import { DataTypes, type QueryInterface } from 'sequelize';

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.createTable(
    'verdicts',
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: DataTypes.UUIDV4,
      },
      run_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'validation_runs', key: 'id' },
        onDelete: 'CASCADE',
      },
      rule_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'rules', key: 'id' },
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
      status: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      lhs: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      rhs: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      gap: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      skip_reason: {
        type: DataTypes.TEXT,
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

  await queryInterface.addIndex('verdicts', ['run_id', 'status'], {
    name: 'idx_verdicts_run',
  });

  // Partial index — only index FAILs for fast failure queries
  await queryInterface.sequelize.query(`
    CREATE INDEX IF NOT EXISTS idx_verdicts_fail
      ON verdicts (run_id)
      WHERE status = 'FAIL';
  `);
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('verdicts');
}
