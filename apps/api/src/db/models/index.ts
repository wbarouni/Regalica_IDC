import { Rule } from './rule';
import { RuleTerm } from './rule-term';
import { ValidationRun } from './validation-run';
import { Verdict } from './verdict';

// Associations
Rule.hasMany(RuleTerm, { foreignKey: 'rule_id', as: 'terms' });
RuleTerm.belongsTo(Rule, { foreignKey: 'rule_id', as: 'rule' });

ValidationRun.hasMany(Verdict, { foreignKey: 'run_id', as: 'verdicts' });
Verdict.belongsTo(ValidationRun, { foreignKey: 'run_id', as: 'run' });

export { Rule, RuleTerm, ValidationRun, Verdict };
