/**
 * Configuration globale de l'application Regalica
 */

export const APP_CONFIG = {
  // Informations de l'application
  APP_NAME: process.env.NEXT_PUBLIC_APP_NAME || 'Regalica IDC',
  APP_VERSION: process.env.NEXT_PUBLIC_APP_VERSION || '1.0.0',
  APP_DESCRIPTION: 'Plateforme de validation de reportings bancaires BCT (Tunisie)',
  APP_AUTHOR: 'Regalica Team',

  // URLs
  API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000',
  API_PORT: parseInt(process.env.API_PORT || '3000', 10),

  // Environnement
  NODE_ENV: process.env.NODE_ENV || 'development',
  IS_PRODUCTION: process.env.NODE_ENV === 'production',
  IS_DEVELOPMENT: process.env.NODE_ENV === 'development',

  // Authentification
  JWT_SECRET: process.env.JWT_SECRET || 'your-secret-key-change-in-production',
  JWT_EXPIRATION: process.env.JWT_EXPIRATION || '7d',
  BCRYPT_ROUNDS: parseInt(process.env.BCRYPT_ROUNDS || '10', 10),

  // Base de données
  DATABASE_URL: process.env.DATABASE_URL || 'mysql://root:password@localhost:3306/regalica_db',
  DB_HOST: process.env.DB_HOST || 'localhost',
  DB_PORT: parseInt(process.env.DB_PORT || '3306', 10),
  DB_USER: process.env.DB_USER || 'root',
  DB_PASSWORD: process.env.DB_PASSWORD || 'password',
  DB_NAME: process.env.DB_NAME || 'regalica_db',

  // Gemini API
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
  GEMINI_MODEL: process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite',

  // Fichiers et uploads
  UPLOAD_DIR: process.env.UPLOAD_DIR || './uploads',
  MAX_FILE_SIZE: parseInt(process.env.MAX_FILE_SIZE || '52428800', 10), // 50 MB
  ALLOWED_FILE_TYPES: (process.env.ALLOWED_FILE_TYPES || 'xml,xlsx,csv').split(','),

  // Logging
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  ENABLE_AUDIT_LOGS: process.env.ENABLE_AUDIT_LOGS === 'true',
  AUDIT_RETENTION_DAYS: parseInt(process.env.AUDIT_RETENTION_DAYS || '90', 10),

  // Validation RDG
  RDG_RULES_FILE: process.env.RDG_RULES_FILE || './public/rdg_rules.json',
  RDG_TOLERANCE: parseFloat(process.env.RDG_TOLERANCE || '0.01'),
  RDG_ENABLE_SMART_VALIDATION: process.env.RDG_ENABLE_SMART_VALIDATION === 'true',

  // CORS et sécurité
  CORS_ORIGIN: (process.env.CORS_ORIGIN || 'http://localhost:3000,http://localhost:3001').split(','),
  ENABLE_RATE_LIMITING: process.env.ENABLE_RATE_LIMITING === 'true',
  RATE_LIMIT_WINDOW: process.env.RATE_LIMIT_WINDOW || '15m',
  RATE_LIMIT_MAX_REQUESTS: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),

  // Emails
  SMTP_HOST: process.env.SMTP_HOST || 'smtp.gmail.com',
  SMTP_PORT: parseInt(process.env.SMTP_PORT || '587', 10),
  SMTP_USER: process.env.SMTP_USER || '',
  SMTP_PASSWORD: process.env.SMTP_PASSWORD || '',
  SMTP_FROM: process.env.SMTP_FROM || 'noreply@regalica.tn',

  // Pagination
  DEFAULT_PAGE_SIZE: 10,
  MAX_PAGE_SIZE: 100,

  // Timeouts
  API_TIMEOUT: 30000, // 30 secondes
  DB_TIMEOUT: 10000, // 10 secondes
  FILE_UPLOAD_TIMEOUT: 60000, // 60 secondes

  // Validation
  MIN_PASSWORD_LENGTH: 8,
  MAX_PASSWORD_LENGTH: 128,
  MIN_USERNAME_LENGTH: 3,
  MAX_USERNAME_LENGTH: 50,

  // Rôles et permissions
  ROLES: {
    ADMIN: 'admin',
    VALIDATOR: 'validator',
    ANALYST: 'analyst',
    VIEWER: 'viewer',
  },

  // Statuts
  UPLOAD_STATUS: {
    PENDING: 'pending',
    PROCESSING: 'processing',
    COMPLETED: 'completed',
    FAILED: 'failed',
  },

  VALIDATION_STATUS: {
    PENDING: 'pending',
    IN_PROGRESS: 'in_progress',
    COMPLETED: 'completed',
    FAILED: 'failed',
  },

  // Messages
  MESSAGES: {
    SUCCESS: 'Opération réussie',
    ERROR: 'Une erreur est survenue',
    VALIDATION_ERROR: 'Erreur de validation',
    UNAUTHORIZED: 'Non autorisé',
    FORBIDDEN: 'Accès refusé',
    NOT_FOUND: 'Ressource non trouvée',
    CONFLICT: 'Conflit',
    SERVER_ERROR: 'Erreur serveur',
  },

  // Codes d'erreur
  ERROR_CODES: {
    INVALID_INPUT: 'INVALID_INPUT',
    UNAUTHORIZED: 'UNAUTHORIZED',
    FORBIDDEN: 'FORBIDDEN',
    NOT_FOUND: 'NOT_FOUND',
    CONFLICT: 'CONFLICT',
    SERVER_ERROR: 'SERVER_ERROR',
    VALIDATION_ERROR: 'VALIDATION_ERROR',
    FILE_TOO_LARGE: 'FILE_TOO_LARGE',
    INVALID_FILE_TYPE: 'INVALID_FILE_TYPE',
    DATABASE_ERROR: 'DATABASE_ERROR',
  },
}

/**
 * Valider la configuration au démarrage
 */
export function validateConfig(): string[] {
  const errors: string[] = []

  // Vérifier les variables requises en production
  if (APP_CONFIG.IS_PRODUCTION) {
    if (!APP_CONFIG.JWT_SECRET || APP_CONFIG.JWT_SECRET.includes('change-in-production')) {
      errors.push('JWT_SECRET doit être configuré en production')
    }

    if (!APP_CONFIG.GEMINI_API_KEY) {
      errors.push('GEMINI_API_KEY doit être configuré en production')
    }

    if (!APP_CONFIG.DATABASE_URL) {
      errors.push('DATABASE_URL doit être configuré en production')
    }
  }

  // Vérifier les valeurs numériques
  if (APP_CONFIG.MAX_FILE_SIZE <= 0) {
    errors.push('MAX_FILE_SIZE doit être positif')
  }

  if (APP_CONFIG.API_PORT <= 0 || APP_CONFIG.API_PORT > 65535) {
    errors.push('API_PORT doit être entre 1 et 65535')
  }

  return errors
}

/**
 * Obtenir la configuration pour une clé spécifique
 */
export function getAppConfig(key: string): unknown {
  const keys = key.split('.')
  let value: any = APP_CONFIG

  for (const k of keys) {
    if (value && typeof value === 'object' && k in value) {
      value = value[k]
    } else {
      return undefined
    }
  }

  return value
}
