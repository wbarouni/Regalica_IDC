'use client'

import React, { useState } from 'react'

interface Table {
  name: string
  description: string
  columns: Array<{
    name: string
    type: string
    constraints: string[]
    description: string
  }>
  relations: string[]
}

const DATABASE_SCHEMA: Record<string, Table> = {
  users: {
    name: 'users',
    description: 'Table des utilisateurs et authentification',
    columns: [
      {
        name: 'id',
        type: 'VARCHAR(36)',
        constraints: ['PRIMARY KEY'],
        description: 'Identifiant unique (UUID)',
      },
      {
        name: 'email',
        type: 'VARCHAR(255)',
        constraints: ['NOT NULL', 'UNIQUE'],
        description: 'Adresse email de l\'utilisateur',
      },
      {
        name: 'password',
        type: 'VARCHAR(255)',
        constraints: ['NOT NULL'],
        description: 'Mot de passe hashé avec bcrypt',
      },
      {
        name: 'firstName',
        type: 'VARCHAR(100)',
        constraints: [],
        description: 'Prénom de l\'utilisateur',
      },
      {
        name: 'lastName',
        type: 'VARCHAR(100)',
        constraints: [],
        description: 'Nom de famille de l\'utilisateur',
      },
      {
        name: 'organization',
        type: 'VARCHAR(255)',
        constraints: [],
        description: 'Organisation/Banque de l\'utilisateur',
      },
      {
        name: 'role',
        type: 'ENUM(admin, validator, analyst, viewer)',
        constraints: ['DEFAULT: viewer'],
        description: 'Rôle de l\'utilisateur',
      },
      {
        name: 'isActive',
        type: 'BOOLEAN',
        constraints: ['DEFAULT: true'],
        description: 'Statut actif/inactif',
      },
      {
        name: 'createdAt',
        type: 'DATETIME',
        constraints: [],
        description: 'Date de création du compte',
      },
      {
        name: 'updatedAt',
        type: 'DATETIME',
        constraints: [],
        description: 'Date de dernière modification',
      },
    ],
    relations: ['validations', 'auditLogs', 'uploads'],
  },
  uploads: {
    name: 'uploads',
    description: 'Table des fichiers uploadés',
    columns: [
      {
        name: 'id',
        type: 'VARCHAR(36)',
        constraints: ['PRIMARY KEY'],
        description: 'Identifiant unique (UUID)',
      },
      {
        name: 'userId',
        type: 'VARCHAR(36)',
        constraints: ['NOT NULL', 'FOREIGN KEY'],
        description: 'Référence à l\'utilisateur',
      },
      {
        name: 'fileName',
        type: 'VARCHAR(255)',
        constraints: ['NOT NULL'],
        description: 'Nom du fichier uploadé',
      },
      {
        name: 'filePath',
        type: 'TEXT',
        constraints: [],
        description: 'Chemin du fichier stocké',
      },
      {
        name: 'fileSize',
        type: 'INT',
        constraints: [],
        description: 'Taille du fichier en bytes',
      },
      {
        name: 'fileType',
        type: 'VARCHAR(50)',
        constraints: ['DEFAULT: xml'],
        description: 'Type de fichier (xml, xlsx, csv)',
      },
      {
        name: 'status',
        type: 'ENUM(pending, processing, completed, failed)',
        constraints: ['DEFAULT: pending'],
        description: 'Statut du traitement',
      },
      {
        name: 'errorMessage',
        type: 'TEXT',
        constraints: [],
        description: 'Message d\'erreur si traitement échoué',
      },
      {
        name: 'uploadedAt',
        type: 'DATETIME',
        constraints: [],
        description: 'Date d\'upload',
      },
      {
        name: 'processedAt',
        type: 'DATETIME',
        constraints: [],
        description: 'Date de traitement',
      },
    ],
    relations: ['validations', 'bankingData'],
  },
  validations: {
    name: 'validations',
    description: 'Table des validations effectuées',
    columns: [
      {
        name: 'id',
        type: 'VARCHAR(36)',
        constraints: ['PRIMARY KEY'],
        description: 'Identifiant unique (UUID)',
      },
      {
        name: 'uploadId',
        type: 'VARCHAR(36)',
        constraints: ['NOT NULL', 'FOREIGN KEY'],
        description: 'Référence à l\'upload',
      },
      {
        name: 'userId',
        type: 'VARCHAR(36)',
        constraints: ['NOT NULL', 'FOREIGN KEY'],
        description: 'Référence à l\'utilisateur',
      },
      {
        name: 'status',
        type: 'ENUM(pending, in_progress, completed, failed)',
        constraints: ['DEFAULT: pending'],
        description: 'Statut de la validation',
      },
      {
        name: 'totalRules',
        type: 'INT',
        constraints: ['DEFAULT: 0'],
        description: 'Nombre total de règles évaluées',
      },
      {
        name: 'passedRules',
        type: 'INT',
        constraints: ['DEFAULT: 0'],
        description: 'Nombre de règles réussies',
      },
      {
        name: 'failedRules',
        type: 'INT',
        constraints: ['DEFAULT: 0'],
        description: 'Nombre de règles échouées',
      },
      {
        name: 'warningRules',
        type: 'INT',
        constraints: ['DEFAULT: 0'],
        description: 'Nombre d\'avertissements',
      },
      {
        name: 'pendingRules',
        type: 'INT',
        constraints: ['DEFAULT: 0'],
        description: 'Nombre de règles en attente',
      },
      {
        name: 'successRate',
        type: 'DECIMAL(5,2)',
        constraints: ['DEFAULT: 0.00'],
        description: 'Taux de réussite en pourcentage',
      },
      {
        name: 'startedAt',
        type: 'DATETIME',
        constraints: [],
        description: 'Date de début de validation',
      },
      {
        name: 'completedAt',
        type: 'DATETIME',
        constraints: [],
        description: 'Date de fin de validation',
      },
      {
        name: 'createdAt',
        type: 'DATETIME',
        constraints: [],
        description: 'Date de création',
      },
    ],
    relations: ['ruleResults'],
  },
  ruleResults: {
    name: 'rule_results',
    description: 'Résultats détaillés des règles RDG',
    columns: [
      {
        name: 'id',
        type: 'VARCHAR(36)',
        constraints: ['PRIMARY KEY'],
        description: 'Identifiant unique (UUID)',
      },
      {
        name: 'validationId',
        type: 'VARCHAR(36)',
        constraints: ['NOT NULL', 'FOREIGN KEY'],
        description: 'Référence à la validation',
      },
      {
        name: 'ruleId',
        type: 'VARCHAR(100)',
        constraints: ['NOT NULL'],
        description: 'Identifiant de la règle RDG',
      },
      {
        name: 'ruleName',
        type: 'TEXT',
        constraints: [],
        description: 'Nom descriptif de la règle',
      },
      {
        name: 'ruleCategory',
        type: 'VARCHAR(100)',
        constraints: [],
        description: 'Catégorie de la règle',
      },
      {
        name: 'status',
        type: 'ENUM(passed, failed, warning, pending)',
        constraints: ['DEFAULT: pending'],
        description: 'Statut du résultat',
      },
      {
        name: 'expectedValue',
        type: 'TEXT',
        constraints: [],
        description: 'Valeur attendue',
      },
      {
        name: 'calculatedValue',
        type: 'TEXT',
        constraints: [],
        description: 'Valeur calculée/obtenue',
      },
      {
        name: 'tolerance',
        type: 'DECIMAL(10,4)',
        constraints: ['DEFAULT: 0.01'],
        description: 'Tolérance de comparaison',
      },
      {
        name: 'message',
        type: 'TEXT',
        constraints: [],
        description: 'Message de résultat',
      },
      {
        name: 'details',
        type: 'JSON',
        constraints: [],
        description: 'Détails supplémentaires en JSON',
      },
      {
        name: 'createdAt',
        type: 'DATETIME',
        constraints: [],
        description: 'Date de création',
      },
    ],
    relations: [],
  },
  bankingData: {
    name: 'banking_data',
    description: 'Données bancaires parsées',
    columns: [
      {
        name: 'id',
        type: 'VARCHAR(36)',
        constraints: ['PRIMARY KEY'],
        description: 'Identifiant unique (UUID)',
      },
      {
        name: 'uploadId',
        type: 'VARCHAR(36)',
        constraints: ['NOT NULL', 'FOREIGN KEY'],
        description: 'Référence à l\'upload',
      },
      {
        name: 'dataType',
        type: 'VARCHAR(100)',
        constraints: ['NOT NULL'],
        description: 'Type de données (annexe, reporting, etc)',
      },
      {
        name: 'bankCode',
        type: 'VARCHAR(20)',
        constraints: [],
        description: 'Code de la banque',
      },
      {
        name: 'reportingPeriod',
        type: 'VARCHAR(50)',
        constraints: [],
        description: 'Période de reporting',
      },
      {
        name: 'annexNumber',
        type: 'VARCHAR(50)',
        constraints: [],
        description: 'Numéro d\'annexe',
      },
      {
        name: 'rawData',
        type: 'JSON',
        constraints: [],
        description: 'Données brutes parsées',
      },
      {
        name: 'parsedData',
        type: 'JSON',
        constraints: [],
        description: 'Données normalisées',
      },
      {
        name: 'createdAt',
        type: 'DATETIME',
        constraints: [],
        description: 'Date de création',
      },
    ],
    relations: [],
  },
  rdgRules: {
    name: 'rdg_rules',
    description: 'Configuration des règles RDG',
    columns: [
      {
        name: 'id',
        type: 'VARCHAR(100)',
        constraints: ['PRIMARY KEY'],
        description: 'Identifiant unique de la règle',
      },
      {
        name: 'name',
        type: 'TEXT',
        constraints: [],
        description: 'Nom de la règle',
      },
      {
        name: 'description',
        type: 'TEXT',
        constraints: [],
        description: 'Description détaillée',
      },
      {
        name: 'category',
        type: 'VARCHAR(100)',
        constraints: [],
        description: 'Catégorie de la règle',
      },
      {
        name: 'annexNumber',
        type: 'VARCHAR(50)',
        constraints: [],
        description: 'Numéro d\'annexe',
      },
      {
        name: 'formula',
        type: 'TEXT',
        constraints: [],
        description: 'Formule de validation',
      },
      {
        name: 'tolerance',
        type: 'DECIMAL(10,4)',
        constraints: ['DEFAULT: 0.01'],
        description: 'Tolérance par défaut',
      },
      {
        name: 'isActive',
        type: 'BOOLEAN',
        constraints: ['DEFAULT: true'],
        description: 'Règle active/inactive',
      },
      {
        name: 'priority',
        type: 'INT',
        constraints: ['DEFAULT: 0'],
        description: 'Priorité de la règle',
      },
      {
        name: 'createdAt',
        type: 'DATETIME',
        constraints: [],
        description: 'Date de création',
      },
      {
        name: 'updatedAt',
        type: 'DATETIME',
        constraints: [],
        description: 'Date de mise à jour',
      },
    ],
    relations: [],
  },
  auditLogs: {
    name: 'audit_logs',
    description: 'Logs d\'audit et traçabilité',
    columns: [
      {
        name: 'id',
        type: 'VARCHAR(36)',
        constraints: ['PRIMARY KEY'],
        description: 'Identifiant unique (UUID)',
      },
      {
        name: 'userId',
        type: 'VARCHAR(36)',
        constraints: ['NOT NULL', 'FOREIGN KEY'],
        description: 'Référence à l\'utilisateur',
      },
      {
        name: 'action',
        type: 'VARCHAR(100)',
        constraints: ['NOT NULL'],
        description: 'Action effectuée',
      },
      {
        name: 'entityType',
        type: 'VARCHAR(100)',
        constraints: [],
        description: 'Type d\'entité affectée',
      },
      {
        name: 'entityId',
        type: 'VARCHAR(36)',
        constraints: [],
        description: 'ID de l\'entité affectée',
      },
      {
        name: 'changes',
        type: 'JSON',
        constraints: [],
        description: 'Détails des changements',
      },
      {
        name: 'ipAddress',
        type: 'VARCHAR(45)',
        constraints: [],
        description: 'Adresse IP de l\'utilisateur',
      },
      {
        name: 'userAgent',
        type: 'TEXT',
        constraints: [],
        description: 'User-Agent du navigateur',
      },
      {
        name: 'createdAt',
        type: 'DATETIME',
        constraints: [],
        description: 'Date de l\'action',
      },
    ],
    relations: [],
  },
  sessions: {
    name: 'sessions',
    description: 'Gestion des sessions utilisateur',
    columns: [
      {
        name: 'id',
        type: 'VARCHAR(36)',
        constraints: ['PRIMARY KEY'],
        description: 'Identifiant unique (UUID)',
      },
      {
        name: 'userId',
        type: 'VARCHAR(36)',
        constraints: ['NOT NULL', 'FOREIGN KEY'],
        description: 'Référence à l\'utilisateur',
      },
      {
        name: 'token',
        type: 'TEXT',
        constraints: [],
        description: 'Token JWT de session',
      },
      {
        name: 'expiresAt',
        type: 'DATETIME',
        constraints: [],
        description: 'Date d\'expiration',
      },
      {
        name: 'createdAt',
        type: 'DATETIME',
        constraints: [],
        description: 'Date de création',
      },
    ],
    relations: [],
  },
}

export default function DatabaseSchemaPage() {
  const [selectedTable, setSelectedTable] = useState<string>('users')
  const tables = Object.keys(DATABASE_SCHEMA)

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-12">
          <h1 className="text-4xl font-bold text-white mb-4">📊 Schéma de Base de Données</h1>
          <p className="text-slate-400 text-lg">Regalica IDC - Validation de Reportings Bancaires</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Sidebar - Table List */}
          <div className="lg:col-span-1">
            <div className="bg-slate-800 rounded-lg p-6 border border-slate-700 sticky top-8">
              <h2 className="text-xl font-bold text-white mb-4">Tables</h2>
              <div className="space-y-2">
                {tables.map((tableName) => (
                  <button
                    key={tableName}
                    onClick={() => setSelectedTable(tableName)}
                    className={`w-full text-left px-4 py-3 rounded-lg transition-all ${
                      selectedTable === tableName
                        ? 'bg-blue-600 text-white font-semibold'
                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                  >
                    <span className="text-sm">{tableName}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Main Content - Table Details */}
          <div className="lg:col-span-3">
            {selectedTable && (
              <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden">
                {/* Table Header */}
                <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-8 py-6">
                  <h2 className="text-2xl font-bold text-white mb-2">{selectedTable}</h2>
                  <p className="text-blue-100">{DATABASE_SCHEMA[selectedTable].description}</p>
                </div>

                {/* Columns */}
                <div className="p-8">
                  <h3 className="text-lg font-semibold text-white mb-6">Colonnes</h3>
                  <div className="space-y-4">
                    {DATABASE_SCHEMA[selectedTable].columns.map((column, idx) => (
                      <div
                        key={idx}
                        className="bg-slate-700 rounded-lg p-4 border border-slate-600 hover:border-blue-500 transition-colors"
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <h4 className="text-white font-mono font-bold">{column.name}</h4>
                            <p className="text-slate-400 text-sm font-mono">{column.type}</p>
                          </div>
                          {column.constraints.length > 0 && (
                            <div className="flex flex-wrap gap-2 justify-end">
                              {column.constraints.map((constraint, cidx) => (
                                <span
                                  key={cidx}
                                  className="bg-amber-900 text-amber-100 text-xs px-2 py-1 rounded"
                                >
                                  {constraint}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        <p className="text-slate-300 text-sm">{column.description}</p>
                      </div>
                    ))}
                  </div>

                  {/* Relations */}
                  {DATABASE_SCHEMA[selectedTable].relations.length > 0 && (
                    <div className="mt-8">
                      <h3 className="text-lg font-semibold text-white mb-4">Relations</h3>
                      <div className="grid grid-cols-2 gap-4">
                        {DATABASE_SCHEMA[selectedTable].relations.map((relation, idx) => (
                          <button
                            key={idx}
                            onClick={() => setSelectedTable(relation)}
                            className="bg-green-900 hover:bg-green-800 text-green-100 px-4 py-2 rounded-lg transition-colors text-sm font-semibold"
                          >
                            → {relation}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Statistics */}
        <div className="mt-12 grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
            <div className="text-3xl font-bold text-blue-400">{tables.length}</div>
            <div className="text-slate-400 text-sm mt-2">Tables</div>
          </div>
          <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
            <div className="text-3xl font-bold text-green-400">
              {Object.values(DATABASE_SCHEMA).reduce((sum, table) => sum + table.columns.length, 0)}
            </div>
            <div className="text-slate-400 text-sm mt-2">Colonnes totales</div>
          </div>
          <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
            <div className="text-3xl font-bold text-purple-400">18,452</div>
            <div className="text-slate-400 text-sm mt-2">Règles RDG</div>
          </div>
          <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
            <div className="text-3xl font-bold text-orange-400">∞</div>
            <div className="text-slate-400 text-sm mt-2">Scalabilité</div>
          </div>
        </div>
      </div>
    </div>
  )
}
