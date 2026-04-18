import { DataTypes, Model, type InferAttributes, type InferCreationAttributes } from 'sequelize';

import { sequelize } from '../sequelize';

export type TermKind = 'cell_ref' | 'literal' | 'literal_text';
export type TermOp = '+' | '-' | '*' | '/';

export class RuleTerm extends Model<InferAttributes<RuleTerm>, InferCreationAttributes<RuleTerm>> {
  declare id: string;
  declare rule_id: string;
  declare rang: 1 | 2 | 3;
  declare num_seq: number;
  declare term_op: TermOp;
  declare kind: TermKind;
  declare ax_origine: string | null;
  declare rubrique_code: string | null;
  declare colonne: string | null;
  declare literal_value: string | null; // NUMERIC stored as string
  declare literal_text: string | null;
}

RuleTerm.init(
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    rule_id: { type: DataTypes.UUID, allowNull: false },
    rang: { type: DataTypes.SMALLINT, allowNull: false },
    num_seq: { type: DataTypes.SMALLINT, allowNull: false },
    term_op: { type: DataTypes.TEXT, allowNull: false },
    kind: { type: DataTypes.TEXT, allowNull: false },
    ax_origine: { type: DataTypes.TEXT, allowNull: true },
    rubrique_code: { type: DataTypes.TEXT, allowNull: true },
    colonne: { type: DataTypes.TEXT, allowNull: true },
    literal_value: { type: DataTypes.DECIMAL(28, 8), allowNull: true },
    literal_text: { type: DataTypes.TEXT, allowNull: true },
  },
  {
    sequelize,
    tableName: 'rule_terms',
    timestamps: false,
  },
);
