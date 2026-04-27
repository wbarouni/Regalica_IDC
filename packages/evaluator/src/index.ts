/**
 * REGFlow — RDG Evaluator
 *
 * Point d'entrée du package. L'implémentation du moteur en 5 phases viendra
 * en Phase 2 du plan brute de refactoring. Ce package exporte pour l'instant :
 *
 * - Les types canoniques (verdict, règle, résultat, totaux).
 * - Le contrat TypeScript de `Evaluator` avec sa signature `evaluate()`.
 * - Le schéma de `expected_verdicts.json` et sa fonction de validation.
 * - Des utilitaires d'agrégation (totaux à partir de verdicts).
 *
 * Le test golden (test/golden.test.ts) utilise ces types pour valider le
 * corpus du tenant pilote. Il s'exécute en mode capture en Phase 0 sur une portion
 * testable (parsing + metadata) et bascule en mode assert complet en Phase 2
 * quand le moteur sera connecté.
 */

export * from './types.js';
export * from './expected-verdicts.js';
export { createPool, withConnection, closePool } from './pool.js';
export { loadRules, type LoadRulesOptions } from './rules-loader.js';
export { parseBatch, type PhaseAResult } from './phase-a.js';
export { groupRulesByAnnexe } from './phase-b.js';
