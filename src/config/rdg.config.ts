/**
 * Configuration des règles RDG (Reporting Données Générales)
 * Règles de validation pour les reportings bancaires BCT (Tunisie)
 */

export const RDG_CONFIG = {
  // Tolérance par défaut pour les comparaisons numériques
  DEFAULT_TOLERANCE: 0.01,

  // Domaines de validation
  DOMAINS: {
    REPORTING_COMPTABLE: '1- REPORTING COMPTABLE',
    REPORTING_PRUDENTIEL: '2- REPORTING PRUDENTIEL',
    REPORTING_STATISTIQUE: '3- REPORTING STATISTIQUE',
  },

  // Types de contrôle
  CONTROL_TYPES: {
    COHERENCE: 'Cohérence',
    COMPLETUDE: 'Complétude',
    CONFORMITE: 'Conformité',
    CALCUL: 'Calcul',
    LOGIQUE: 'Logique',
  },

  // Opérateurs de comparaison
  OPERATORS: {
    EQUAL: '=',
    NOT_EQUAL: '!=',
    GREATER_THAN: '>',
    LESS_THAN: '<',
    GREATER_EQUAL: '>=',
    LESS_EQUAL: '<=',
    IN: 'IN',
    NOT_IN: 'NOT IN',
    LIKE: 'LIKE',
    NOT_LIKE: 'NOT LIKE',
  },

  // Opérateurs arithmétiques
  ARITHMETIC_OPERATORS: {
    ADD: '+',
    SUBTRACT: '-',
    MULTIPLY: '*',
    DIVIDE: '/',
    MODULO: '%',
  },

  // Statuts de validation
  VALIDATION_STATUS: {
    PASSED: 'passed',
    FAILED: 'failed',
    WARNING: 'warning',
    PENDING: 'pending',
    ERROR: 'error',
  },

  // Priorités des règles
  PRIORITY_LEVELS: {
    CRITICAL: 1,
    HIGH: 2,
    MEDIUM: 3,
    LOW: 4,
  },

  // Annexes supportées
  ANNEXES: {
    ANNEXE_1: '1',
    ANNEXE_2: '2',
    ANNEXE_3: '3',
    ANNEXE_4: '4',
    ANNEXE_5: '5',
    ANNEXE_6: '6',
    ANNEXE_7: '7',
    ANNEXE_8: '8',
    ANNEXE_9: '9',
    ANNEXE_10: '10',
    ANNEXE_11: '11',
    ANNEXE_12: '12',
    ANNEXE_13: '13',
    ANNEXE_14: '14',
    ANNEXE_15: '15',
    ANNEXE_16: '16',
    ANNEXE_17: '17',
    ANNEXE_18: '18',
    ANNEXE_19: '19',
    ANNEXE_20: '20',
    ANNEXE_620: '620',
  },

  // Configuration de validation
  VALIDATION: {
    // Nombre maximum de règles à évaluer en parallèle
    MAX_PARALLEL_RULES: 10,

    // Timeout pour l'évaluation d'une règle (en ms)
    RULE_EVALUATION_TIMEOUT: 5000,

    // Nombre maximum de résultats à retourner
    MAX_RESULTS: 10000,

    // Activer la validation intelligente avec IA
    ENABLE_AI_VALIDATION: true,

    // Modèle IA à utiliser
    AI_MODEL: 'gemini-2.5-flash-lite',
  },

  // Configuration des fichiers
  FILES: {
    // Formats de fichier supportés
    SUPPORTED_FORMATS: ['xml', 'xlsx', 'csv'],

    // Taille maximale des fichiers (en bytes)
    MAX_FILE_SIZE: 52428800, // 50 MB

    // Répertoire des uploads
    UPLOAD_DIRECTORY: './uploads',

    // Répertoire des fichiers de règles
    RULES_DIRECTORY: './public',
  },

  // Configuration des logs
  LOGGING: {
    // Niveau de log par défaut
    LOG_LEVEL: 'info',

    // Activer les logs d'audit
    ENABLE_AUDIT_LOGS: true,

    // Nombre de jours de rétention des logs
    RETENTION_DAYS: 90,

    // Formats de log supportés
    FORMATS: ['json', 'text'],
  },

  // Configuration de la base de données
  DATABASE: {
    // Nombre maximum de connexions
    MAX_CONNECTIONS: 10,

    // Timeout de connexion (en ms)
    CONNECTION_TIMEOUT: 5000,

    // Activer le pool de connexions
    ENABLE_CONNECTION_POOL: true,
  },

  // Configuration de l'API
  API: {
    // Activer le rate limiting
    ENABLE_RATE_LIMITING: true,

    // Fenêtre de rate limiting
    RATE_LIMIT_WINDOW: '15m',

    // Nombre maximum de requêtes par fenêtre
    MAX_REQUESTS_PER_WINDOW: 100,

    // Activer CORS
    ENABLE_CORS: true,

    // Origines CORS autorisées
    CORS_ORIGINS: ['http://localhost:3000', 'http://localhost:3001'],
  },
}

/**
 * Obtenir la configuration pour une clé spécifique
 */
export function getConfig(key: string): unknown {
  const keys = key.split('.')
  let value: any = RDG_CONFIG

  for (const k of keys) {
    if (value && typeof value === 'object' && k in value) {
      value = value[k]
    } else {
      return undefined
    }
  }

  return value
}

/**
 * Vérifier si une valeur est un opérateur valide
 */
export function isValidOperator(operator: string): boolean {
  return Object.values(RDG_CONFIG.OPERATORS).includes(operator)
}

/**
 * Vérifier si un domaine est valide
 */
export function isValidDomain(domain: string): boolean {
  return Object.values(RDG_CONFIG.DOMAINS).includes(domain)
}

/**
 * Vérifier si un statut de validation est valide
 */
export function isValidValidationStatus(status: string): boolean {
  return Object.values(RDG_CONFIG.VALIDATION_STATUS).includes(status)
}

/**
 * Obtenir le label d'une priorité
 */
export function getPriorityLabel(priority: number): string {
  const labels: Record<number, string> = {
    1: 'Critique',
    2: 'Élevée',
    3: 'Moyenne',
    4: 'Basse',
  }
  return labels[priority] || 'Inconnue'
}
