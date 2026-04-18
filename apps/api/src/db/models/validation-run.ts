import { DataTypes, Model, type CreationOptional, type InferAttributes, type InferCreationAttributes } from 'sequelize';

import { sequelize } from '../sequelize';

export type RunStatus = 'pending' | 'running' | 'done' | 'error';

export class ValidationRun extends Model<
  InferAttributes<ValidationRun>,
  InferCreationAttributes<ValidationRun>
> {
  declare id: CreationOptional<string>;
  declare tenant_id: string;
  declare bank_code: string;
  declare date_annexe: string;
  declare status: CreationOptional<RunStatus>;
  declare pass_count: number | null;
  declare fail_count: number | null;
  declare skip_count: number | null;
  declare created_at: CreationOptional<Date>;
}

ValidationRun.init(
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    tenant_id: { type: DataTypes.UUID, allowNull: false },
    bank_code: { type: DataTypes.TEXT, allowNull: false },
    date_annexe: { type: DataTypes.TEXT, allowNull: false },
    status: { type: DataTypes.TEXT, defaultValue: 'pending' },
    pass_count: { type: DataTypes.INTEGER, allowNull: true },
    fail_count: { type: DataTypes.INTEGER, allowNull: true },
    skip_count: { type: DataTypes.INTEGER, allowNull: true },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'validation_runs',
    timestamps: false,
  },
);
