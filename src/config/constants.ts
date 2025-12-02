/**
 * Constantes globales de l'application
 */

// ============================================================================
// ROUTES API
// ============================================================================
export const API_ROUTES = {
  // Authentification
  AUTH: {
    REGISTER: '/api/auth/register',
    LOGIN: '/api/auth/login',
    LOGOUT: '/api/auth/logout',
    REFRESH: '/api/auth/refresh',
    VERIFY: '/api/auth/verify',
  },

  // Utilisateurs
  USERS: {
    ME: '/api/users/me',
    LIST: '/api/users',
    GET: '/api/users/:id',
    UPDATE: '/api/users/:id',
    DELETE: '/api/users/:id',
  },

  // Uploads
  UPLOADS: {
    LIST: '/api/uploads',
    CREATE: '/api/uploads',
    GET: '/api/uploads/:id',
    DELETE: '/api/uploads/:id',
    PROCESS: '/api/uploads/:id/process',
  },

  // Validations
  VALIDATIONS: {
    LIST: '/api/validations',
    CREATE: '/api/validations',
    GET: '/api/validations/:id',
    DELETE: '/api/validations/:id',
    RESULTS: '/api/validations/:id/results',
  },

  // Règles RDG
  RULES: {
    LIST: '/api/rules',
    GET: '/api/rules/:id',
    SEARCH: '/api/rules/search',
    BY_ANNEX: '/api/rules/annex/:annexNumber',
    BY_CATEGORY: '/api/rules/category/:category',
  },

  // Admin
  ADMIN: {
    RULES_LOAD: '/api/admin/rules/load',
    RULES_STATISTICS: '/api/admin/rules/statistics',
  },

  // Audit
  AUDIT: {
    LOGS: '/api/audit/logs',
    STATISTICS: '/api/audit/statistics',
  },
}

// ============================================================================
// MESSAGES D'ERREUR
// ============================================================================
export const ERROR_MESSAGES = {
  // Authentification
  INVALID_CREDENTIALS: 'Identifiants invalides',
  UNAUTHORIZED: 'Non autorisé',
  TOKEN_EXPIRED: 'Jeton expiré',
  INVALID_TOKEN: 'Jeton invalide',

  // Validation
  VALIDATION_FAILED: 'Validation échouée',
  INVALID_EMAIL: 'Email invalide',
  INVALID_PASSWORD: 'Mot de passe invalide',
  PASSWORD_TOO_SHORT: 'Le mot de passe doit contenir au moins 8 caractères',
  PASSWORD_TOO_LONG: 'Le mot de passe ne doit pas dépasser 128 caractères',

  // Fichiers
  FILE_TOO_LARGE: 'Le fichier est trop volumineux',
  INVALID_FILE_TYPE: 'Type de fichier non supporté',
  FILE_NOT_FOUND: 'Fichier non trouvé',
  FILE_UPLOAD_FAILED: 'Échec de l\'upload du fichier',

  // Ressources
  NOT_FOUND: 'Ressource non trouvée',
  ALREADY_EXISTS: 'Ressource déjà existante',
  CONFLICT: 'Conflit de ressource',

  // Base de données
  DATABASE_ERROR: 'Erreur de base de données',
  CONNECTION_ERROR: 'Erreur de connexion',

  // Serveur
  SERVER_ERROR: 'Erreur serveur',
  SERVICE_UNAVAILABLE: 'Service indisponible',
  TIMEOUT: 'Délai d\'attente dépassé',
}

// ============================================================================
// MESSAGES DE SUCCÈS
// ============================================================================
export const SUCCESS_MESSAGES = {
  LOGIN_SUCCESS: 'Connexion réussie',
  LOGOUT_SUCCESS: 'Déconnexion réussie',
  REGISTRATION_SUCCESS: 'Inscription réussie',
  FILE_UPLOADED: 'Fichier uploadé avec succès',
  VALIDATION_STARTED: 'Validation démarrée',
  VALIDATION_COMPLETED: 'Validation complétée',
  USER_CREATED: 'Utilisateur créé',
  USER_UPDATED: 'Utilisateur mis à jour',
  USER_DELETED: 'Utilisateur supprimé',
  OPERATION_SUCCESS: 'Opération réussie',
}

// ============================================================================
// REGEX PATTERNS
// ============================================================================
export const REGEX_PATTERNS = {
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  PASSWORD: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/,
  PHONE: /^(\+216|0)[1-9]\d{7}$/,
  ALPHA_NUMERIC: /^[a-zA-Z0-9]+$/,
  UUID: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
}

// ============================================================================
// LIMITES
// ============================================================================
export const LIMITS = {
  MAX_FILE_SIZE: 52428800, // 50 MB
  MAX_UPLOAD_SIZE: 104857600, // 100 MB
  MAX_BATCH_SIZE: 100,
  MAX_PAGE_SIZE: 100,
  MIN_PAGE_SIZE: 1,
  DEFAULT_PAGE_SIZE: 10,
  MAX_SEARCH_RESULTS: 1000,
}

// ============================================================================
// TIMEOUTS
// ============================================================================
export const TIMEOUTS = {
  API_REQUEST: 30000, // 30 secondes
  DATABASE_QUERY: 10000, // 10 secondes
  FILE_UPLOAD: 60000, // 60 secondes
  FILE_PROCESSING: 300000, // 5 minutes
  VALIDATION: 600000, // 10 minutes
}

// ============================================================================
// FORMATS DE DATE
// ============================================================================
export const DATE_FORMATS = {
  ISO: 'YYYY-MM-DD',
  ISO_TIME: 'YYYY-MM-DDTHH:mm:ss',
  ISO_TIME_Z: 'YYYY-MM-DDTHH:mm:ssZ',
  DISPLAY: 'DD/MM/YYYY',
  DISPLAY_TIME: 'DD/MM/YYYY HH:mm',
  DISPLAY_TIME_SECONDS: 'DD/MM/YYYY HH:mm:ss',
}

// ============================================================================
// CODES HTTP
// ============================================================================
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  ACCEPTED: 202,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
}

// ============================================================================
// PAGINATION
// ============================================================================
export const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_PAGE_SIZE: 10,
  MAX_PAGE_SIZE: 100,
}

// ============================================================================
// CACHE
// ============================================================================
export const CACHE_DURATION = {
  SHORT: 300, // 5 minutes
  MEDIUM: 3600, // 1 heure
  LONG: 86400, // 24 heures
  VERY_LONG: 604800, // 7 jours
}

// ============================================================================
// RÔLES ET PERMISSIONS
// ============================================================================
export const ROLES = {
  ADMIN: 'admin',
  VALIDATOR: 'validator',
  ANALYST: 'analyst',
  VIEWER: 'viewer',
}

export const PERMISSIONS = {
  [ROLES.ADMIN]: ['*'], // Toutes les permissions
  [ROLES.VALIDATOR]: [
    'upload:create',
    'upload:read',
    'validation:create',
    'validation:read',
    'rules:read',
  ],
  [ROLES.ANALYST]: [
    'upload:read',
    'validation:read',
    'rules:read',
    'audit:read',
  ],
  [ROLES.VIEWER]: [
    'upload:read',
    'validation:read',
    'rules:read',
  ],
}

// ============================================================================
// STATUTS
// ============================================================================
export const STATUSES = {
  UPLOAD: {
    PENDING: 'pending',
    PROCESSING: 'processing',
    COMPLETED: 'completed',
    FAILED: 'failed',
  },
  VALIDATION: {
    PENDING: 'pending',
    IN_PROGRESS: 'in_progress',
    COMPLETED: 'completed',
    FAILED: 'failed',
  },
  RULE: {
    PASSED: 'passed',
    FAILED: 'failed',
    WARNING: 'warning',
    PENDING: 'pending',
  },
}

// ============================================================================
// TYPES DE FICHIER
// ============================================================================
export const FILE_TYPES = {
  XML: 'xml',
  XLSX: 'xlsx',
  CSV: 'csv',
  JSON: 'json',
  PDF: 'pdf',
}

export const MIME_TYPES = {
  XML: 'application/xml',
  XLSX: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  CSV: 'text/csv',
  JSON: 'application/json',
  PDF: 'application/pdf',
}

// ============================================================================
// ANNEXES RDG
// ============================================================================
export const RDG_ANNEXES = [
  '1', '2', '3', '4', '5', '6', '7', '8', '9', '10',
  '11', '12', '13', '14', '15', '16', '17', '18', '19', '20',
  '620',
]

// ============================================================================
// DOMAINES RDG
// ============================================================================
export const RDG_DOMAINS = [
  '1- REPORTING COMPTABLE',
  '2- REPORTING PRUDENTIEL',
  '3- REPORTING STATISTIQUE',
]
