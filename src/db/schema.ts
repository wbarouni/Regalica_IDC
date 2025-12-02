import { mysqlTable, mysqlEnum, varchar, text, int, decimal, datetime, boolean, json, primaryKey } from 'drizzle-orm/mysql-core'
import { relations } from 'drizzle-orm'

// ============================================================================
// UTILISATEURS ET AUTHENTIFICATION
// ============================================================================

export const users = mysqlTable('users', {
  id: varchar('id', { length: 36 }).primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  password: varchar('password', { length: 255 }).notNull(),
  firstName: varchar('first_name', { length: 100 }),
  lastName: varchar('last_name', { length: 100 }),
  organization: varchar('organization', { length: 255 }),
  role: mysqlEnum('role', ['admin', 'validator', 'analyst', 'viewer']).default('viewer'),
  isActive: boolean('is_active').default(true),
  createdAt: datetime('created_at').defaultNow(),
  updatedAt: datetime('updated_at').defaultNow().onUpdateNow(),
})

export const usersRelations = relations(users, ({ many }) => ({
  validations: many(validations),
  auditLogs: many(auditLogs),
}))

// ============================================================================
// FICHIERS ET UPLOADS
// ============================================================================

export const uploads = mysqlTable('uploads', {
  id: varchar('id', { length: 36 }).primaryKey(),
  userId: varchar('user_id', { length: 36 }).notNull(),
  fileName: varchar('file_name', { length: 255 }).notNull(),
  filePath: text('file_path'),
  fileSize: int('file_size'),
  fileType: varchar('file_type', { length: 50 }).default('xml'),
  status: mysqlEnum('status', ['pending', 'processing', 'completed', 'failed']).default('pending'),
  errorMessage: text('error_message'),
  uploadedAt: datetime('uploaded_at').defaultNow(),
  processedAt: datetime('processed_at'),
})

export const uploadsRelations = relations(uploads, ({ one, many }) => ({
  user: one(users, { fields: [uploads.userId], references: [users.id] }),
  validations: many(validations),
}))

// ============================================================================
// VALIDATIONS ET RÉSULTATS
// ============================================================================

export const validations = mysqlTable('validations', {
  id: varchar('id', { length: 36 }).primaryKey(),
  uploadId: varchar('upload_id', { length: 36 }).notNull(),
  userId: varchar('user_id', { length: 36 }).notNull(),
  status: mysqlEnum('status', ['pending', 'in_progress', 'completed', 'failed']).default('pending'),
  totalRules: int('total_rules').default(0),
  passedRules: int('passed_rules').default(0),
  failedRules: int('failed_rules').default(0),
  warningRules: int('warning_rules').default(0),
  pendingRules: int('pending_rules').default(0),
  successRate: decimal('success_rate', { precision: 5, scale: 2 }).default('0.00'),
  startedAt: datetime('started_at'),
  completedAt: datetime('completed_at'),
  createdAt: datetime('created_at').defaultNow(),
})

export const validationsRelations = relations(validations, ({ one, many }) => ({
  upload: one(uploads, { fields: [validations.uploadId], references: [uploads.id] }),
  user: one(users, { fields: [validations.userId], references: [users.id] }),
  ruleResults: many(ruleResults),
}))

// ============================================================================
// RÉSULTATS DES RÈGLES RDG
// ============================================================================

export const ruleResults = mysqlTable('rule_results', {
  id: varchar('id', { length: 36 }).primaryKey(),
  validationId: varchar('validation_id', { length: 36 }).notNull(),
  ruleId: varchar('rule_id', { length: 100 }).notNull(),
  ruleName: text('rule_name'),
  ruleCategory: varchar('rule_category', { length: 100 }),
  status: mysqlEnum('status', ['passed', 'failed', 'warning', 'pending']).default('pending'),
  expectedValue: text('expected_value'),
  calculatedValue: text('calculated_value'),
  tolerance: decimal('tolerance', { precision: 10, scale: 4 }).default('0.01'),
  message: text('message'),
  details: json('details'),
  createdAt: datetime('created_at').defaultNow(),
})

export const ruleResultsRelations = relations(ruleResults, ({ one }) => ({
  validation: one(validations, { fields: [ruleResults.validationId], references: [validations.id] }),
}))

// ============================================================================
// DONNÉES BANCAIRES PARSÉES
// ============================================================================

export const bankingData = mysqlTable('banking_data', {
  id: varchar('id', { length: 36 }).primaryKey(),
  uploadId: varchar('upload_id', { length: 36 }).notNull(),
  dataType: varchar('data_type', { length: 100 }).notNull(),
  bankCode: varchar('bank_code', { length: 20 }),
  reportingPeriod: varchar('reporting_period', { length: 50 }),
  annexNumber: varchar('annex_number', { length: 50 }),
  rawData: json('raw_data'),
  parsedData: json('parsed_data'),
  createdAt: datetime('created_at').defaultNow(),
})

export const bankingDataRelations = relations(bankingData, ({ one }) => ({
  upload: one(uploads, { fields: [bankingData.uploadId], references: [uploads.id] }),
}))

// ============================================================================
// CONFIGURATION DES RÈGLES RDG
// ============================================================================

export const rdgRules = mysqlTable('rdg_rules', {
  id: varchar('id', { length: 100 }).primaryKey(),
  name: text('name'),
  description: text('description'),
  category: varchar('category', { length: 100 }),
  annexNumber: varchar('annex_number', { length: 50 }),
  formula: text('formula'),
  tolerance: decimal('tolerance', { precision: 10, scale: 4 }).default('0.01'),
  isActive: boolean('is_active').default(true),
  priority: int('priority').default(0),
  createdAt: datetime('created_at').defaultNow(),
  updatedAt: datetime('updated_at').defaultNow().onUpdateNow(),
})

// ============================================================================
// AUDIT ET LOGS
// ============================================================================

export const auditLogs = mysqlTable('audit_logs', {
  id: varchar('id', { length: 36 }).primaryKey(),
  userId: varchar('user_id', { length: 36 }).notNull(),
  action: varchar('action', { length: 100 }).notNull(),
  entityType: varchar('entity_type', { length: 100 }),
  entityId: varchar('entity_id', { length: 36 }),
  changes: json('changes'),
  ipAddress: varchar('ip_address', { length: 45 }),
  userAgent: text('user_agent'),
  createdAt: datetime('created_at').defaultNow(),
})

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  user: one(users, { fields: [auditLogs.userId], references: [users.id] }),
}))

// ============================================================================
// SESSIONS
// ============================================================================

export const sessions = mysqlTable('sessions', {
  id: varchar('id', { length: 36 }).primaryKey(),
  userId: varchar('user_id', { length: 36 }).notNull(),
  token: text('token'),
  expiresAt: datetime('expires_at'),
  createdAt: datetime('created_at').defaultNow(),
})

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}))
