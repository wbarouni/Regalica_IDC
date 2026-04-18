import { DataTypes, Model, type InferAttributes, type InferCreationAttributes } from 'sequelize';

import { sequelize } from '../sequelize';

export class Rule extends Model<InferAttributes<Rule>, InferCreationAttributes<Rule>> {
  declare id: string;
  declare tenant_id: string;
  declare annexe_code: string;
  declare num_regle: number;
  declare oper_regle: string;
  declare type_ctrl: string;
  declare domaine: string | null;
  declare lib_annexe: string | null;
  declare zone_texte: string | null;
  declare is_formalized: boolean;
  declare version: number;
  declare is_active: boolean;
  declare created_at: Date;
}

Rule.init(
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    tenant_id: { type: DataTypes.UUID, allowNull: false },
    annexe_code: { type: DataTypes.TEXT, allowNull: false },
    num_regle: { type: DataTypes.INTEGER, allowNull: false },
    oper_regle: { type: DataTypes.TEXT, allowNull: false },
    type_ctrl: { type: DataTypes.TEXT, allowNull: false },
    domaine: { type: DataTypes.TEXT, allowNull: true },
    lib_annexe: { type: DataTypes.TEXT, allowNull: true },
    zone_texte: { type: DataTypes.TEXT, allowNull: true },
    is_formalized: { type: DataTypes.BOOLEAN, defaultValue: true },
    version: { type: DataTypes.INTEGER, defaultValue: 1 },
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'rules',
    timestamps: false,
    indexes: [
      {
        unique: true,
        fields: ['tenant_id', 'annexe_code', 'num_regle', 'version'],
      },
    ],
  },
);
