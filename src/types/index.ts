// ============================================================================
// UTILISATEURS
// ============================================================================

export type UserRole = 'admin' | 'validator' | 'analyst' | 'viewer'

export interface User {
  id: string
  email: string
  firstName?: string
  lastName?: string
  organization?: string
  role: UserRole
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

export interface CreateUserInput {
  email: string
  password: string
  firstName?: string
  lastName?: string
  organization?: string
  role?: UserRole
}

// ============================================================================
// UPLOADS
// ============================================================================

export type UploadStatus = 'pending' | 'processing' | 'completed' | 'failed'

export interface Upload {
  id: string
  userId: string
  fileName: string
  filePath?: string
  fileSize?: number
  fileType: string
  status: UploadStatus
  errorMessage?: string
  uploadedAt: Date
  processedAt?: Date
}

// ============================================================================
// VALIDATIONS
// ============================================================================

export type ValidationStatus = 'pending' | 'in_progress' | 'completed' | 'failed'

export interface Validation {
  id: string
  uploadId: string
  userId: string
  status: ValidationStatus
  totalRules: number
  passedRules: number
  failedRules: number
  warningRules: number
  pendingRules: number
  successRate: number
  startedAt?: Date
  completedAt?: Date
  createdAt: Date
}

// ============================================================================
// RÉSULTATS DES RÈGLES
// ============================================================================

export type RuleStatus = 'passed' | 'failed' | 'warning' | 'pending'

export interface RuleResult {
  id: string
  validationId: string
  ruleId: string
  ruleName?: string
  ruleCategory?: string
  status: RuleStatus
  expectedValue?: string
  calculatedValue?: string
  tolerance?: number
  message?: string
  details?: Record<string, unknown>
  createdAt: Date
}

// ============================================================================
// DONNÉES BANCAIRES
// ============================================================================

export interface BankingData {
  id: string
  uploadId: string
  dataType: string
  bankCode?: string
  reportingPeriod?: string
  annexNumber?: string
  rawData?: Record<string, unknown>
  parsedData?: Record<string, unknown>
  createdAt: Date
}

// ============================================================================
// RÈGLES RDG
// ============================================================================

export interface RDGRule {
  id: string
  name?: string
  description?: string
  category?: string
  annexNumber?: string
  formula?: string
  tolerance?: number
  isActive: boolean
  priority: number
  createdAt: Date
  updatedAt: Date
}

// ============================================================================
// RÉPONSES API
// ============================================================================

export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

export interface PaginatedResponse<T> {
  success: boolean
  data: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

// ============================================================================
// AUDIT
// ============================================================================

export interface AuditLog {
  id: string
  userId: string
  action: string
  entityType?: string
  entityId?: string
  changes?: Record<string, unknown>
  ipAddress?: string
  userAgent?: string
  createdAt: Date
}
