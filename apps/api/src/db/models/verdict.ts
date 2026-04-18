import { DataTypes, Model, type CreationOptional, type InferAttributes, type InferCreationAttributes } from 'sequelize';

import { sequelize } from '../sequelize';

export class Verdict extends Model<InferAttributes<Verdict>, InferCreationAttributes<Verdict>> {
  declare id: CreationOptional<string>;
  declare run_id: string;
  declare rule_id: string;
  declare annexe_code: string;
  declare num_regle: number;
  declare oper_regle: string;
  declare status: string;
  declare lhs: string | null;
  declare rhs: string | null;
  declare gap: string | null;
  declare skip_reason: string | null;
  declare created_at: CreationOptional<Date>;
}

Verdict.init(
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    run_id: { type: DataTypes.UUID, allowNull: false },
    rule_id: { type: DataTypes.UUID, allowNull: false },
    annexe_code: { type: DataTypes.TEXT, allowNull: false },
    num_regle: { type: DataTypes.INTEGER, allowNull: false },
    oper_regle: { type: DataTypes.TEXT, allowNull: false },
    status: { type: DataTypes.TEXT, allowNull: false },
    lhs: { type: DataTypes.TEXT, allowNull: true },
    rhs: { type: DataTypes.TEXT, allowNull: true },
    gap: { type: DataTypes.TEXT, allowNull: true },
    skip_reason: { type: DataTypes.TEXT, allowNull: true },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'verdicts',
    timestamps: false,
  },
);
