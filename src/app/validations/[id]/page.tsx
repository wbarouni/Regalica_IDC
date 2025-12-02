'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'

interface RuleResult {
  id: string
  ruleId: string
  ruleNumber: number
  status: string
  expectedValue: any
  calculatedValue: any
  tolerance: number
  message: string
  details: string
}

interface ValidationDetail {
  id: string
  uploadId: string
  status: string
  totalRules: number
  passedRules: number
  failedRules: number
  pendingRules: number
  successRate: number
  createdAt: string
  ruleResults: RuleResult[]
}

export default function ValidationDetailPage() {
  const router = useRouter()
  const params = useParams()
  const validationId = params.id as string

  const [validation, setValidation] = useState<ValidationDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'passed' | 'failed' | 'pending'>('all')

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) {
      router.push('/login')
      return
    }

    fetchValidationDetails()
  }, [router])

  const fetchValidationDetails = async () => {
    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`/api/validations/${validationId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })

      if (response.ok) {
        const data = await response.json()
        setValidation(data.data)
      }
    } catch (err) {
      console.error('Erreur lors de la récupération des détails', err)
    } finally {
      setLoading(false)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'passed':
        return 'bg-green-100 text-green-700'
      case 'failed':
        return 'bg-red-100 text-red-700'
      case 'pending':
        return 'bg-yellow-100 text-yellow-700'
      default:
        return 'bg-gray-100 text-gray-700'
    }
  }

  const filteredResults = validation?.ruleResults.filter((result) => {
    if (filter === 'all') return true
    return result.status === filter
  }) || []

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-black mx-auto mb-4"></div>
          <p className="text-gray-600">Chargement...</p>
        </div>
      </div>
    )
  }

  if (!validation) {
    return (
      <div className="min-h-screen bg-white">
        <header className="border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-6 py-4">
            <Link href="/validations" className="text-gray-600 hover:text-black">
              ← Retour aux validations
            </Link>
          </div>
        </header>
        <div className="text-center py-12">
          <p className="text-gray-600">Validation non trouvée</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Regalica IDC</h1>
            <p className="text-gray-600 text-sm">Détails de la validation</p>
          </div>
          <Link href="/validations" className="text-gray-600 hover:text-black">
            ← Retour
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-12">
        {/* Summary */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-12">
          <div className="border border-gray-200 rounded-lg p-6 text-center">
            <div className="text-4xl font-bold text-green-600 mb-2">{validation.passedRules}</div>
            <p className="text-gray-600">Règles réussies</p>
          </div>
          <div className="border border-gray-200 rounded-lg p-6 text-center">
            <div className="text-4xl font-bold text-red-600 mb-2">{validation.failedRules}</div>
            <p className="text-gray-600">Règles échouées</p>
          </div>
          <div className="border border-gray-200 rounded-lg p-6 text-center">
            <div className="text-4xl font-bold text-yellow-600 mb-2">{validation.pendingRules}</div>
            <p className="text-gray-600">Règles en attente</p>
          </div>
          <div className="border border-gray-200 rounded-lg p-6 text-center">
            <div className="text-4xl font-bold text-blue-600 mb-2">{validation.successRate.toFixed(1)}%</div>
            <p className="text-gray-600">Taux de conformité</p>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mb-12">
          <div className="flex justify-between mb-2">
            <span className="font-semibold">Progression globale</span>
            <span className="text-gray-600">{validation.successRate.toFixed(1)}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-4">
            <div
              className="bg-gradient-to-r from-green-600 to-green-400 h-4 rounded-full transition-all"
              style={{ width: `${validation.successRate}%` }}
            ></div>
          </div>
        </div>

        {/* Filters */}
        <div className="mb-8">
          <h3 className="text-xl font-bold mb-4">Résultats des règles</h3>
          <div className="flex gap-4 mb-6">
            {(['all', 'passed', 'failed', 'pending'] as const).map((status) => (
              <button
                key={status}
                onClick={() => setFilter(status)}
                className={`px-4 py-2 rounded-lg transition ${
                  filter === status
                    ? 'bg-black text-white'
                    : 'border border-gray-300 hover:border-gray-400'
                }`}
              >
                {status === 'all' && 'Tous'}
                {status === 'passed' && `Réussis (${validation.passedRules})`}
                {status === 'failed' && `Échoués (${validation.failedRules})`}
                {status === 'pending' && `En attente (${validation.pendingRules})`}
              </button>
            ))}
          </div>
        </div>

        {/* Results Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-4 font-semibold">Règle</th>
                <th className="text-left py-3 px-4 font-semibold">Statut</th>
                <th className="text-left py-3 px-4 font-semibold">Valeur attendue</th>
                <th className="text-left py-3 px-4 font-semibold">Valeur calculée</th>
                <th className="text-left py-3 px-4 font-semibold">Message</th>
              </tr>
            </thead>
            <tbody>
              {filteredResults.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-gray-600">
                    Aucun résultat
                  </td>
                </tr>
              ) : (
                filteredResults.map((result) => (
                  <tr key={result.id} className="border-b border-gray-200 hover:bg-gray-50">
                    <td className="py-3 px-4">
                      <span className="font-mono text-sm">RDG-{result.ruleNumber}</span>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(result.status)}`}>
                        {result.status === 'passed' && 'Réussi'}
                        {result.status === 'failed' && 'Échoué'}
                        {result.status === 'pending' && 'En attente'}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <code className="text-sm bg-gray-100 px-2 py-1 rounded">
                        {JSON.stringify(result.expectedValue)}
                      </code>
                    </td>
                    <td className="py-3 px-4">
                      <code className="text-sm bg-gray-100 px-2 py-1 rounded">
                        {JSON.stringify(result.calculatedValue)}
                      </code>
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-600">{result.message}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Actions */}
        <div className="mt-12 flex gap-4">
          <button className="flex-1 bg-black text-white py-2 rounded-lg hover:bg-gray-800 transition font-semibold">
            Exporter en PDF
          </button>
          <button className="flex-1 border border-gray-300 py-2 rounded-lg hover:bg-gray-50 transition font-semibold">
            Exporter en CSV
          </button>
          <button className="flex-1 border border-gray-300 py-2 rounded-lg hover:bg-gray-50 transition font-semibold">
            Imprimer
          </button>
        </div>
      </main>
    </div>
  )
}
