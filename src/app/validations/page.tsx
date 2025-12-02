'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'

interface Validation {
  id: string
  uploadId: string
  status: string
  totalRules: number
  passedRules: number
  failedRules: number
  successRate: number
  createdAt: string
}

function ValidationsContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const uploadId = searchParams.get('uploadId')

  const [validations, setValidations] = useState<Validation[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedValidation, setSelectedValidation] = useState<Validation | null>(null)

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) {
      router.push('/login')
      return
    }

    fetchValidations()
  }, [router])

  const fetchValidations = async () => {
    try {
      const token = localStorage.getItem('token')
      const url = uploadId ? `/api/validations?uploadId=${uploadId}` : '/api/validations'

      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      })

      if (response.ok) {
        const data = await response.json()
        setValidations(data.data || [])
        if (data.data && data.data.length > 0) {
          setSelectedValidation(data.data[0])
        }
      }
    } catch (err) {
      console.error('Erreur lors de la récupération des validations', err)
    } finally {
      setLoading(false)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-700'
      case 'in_progress':
        return 'bg-blue-100 text-blue-700'
      case 'failed':
        return 'bg-red-100 text-red-700'
      default:
        return 'bg-gray-100 text-gray-700'
    }
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Regalica IDC</h1>
            <p className="text-gray-600 text-sm">Validations</p>
          </div>
          <Link href="/dashboard" className="text-gray-600 hover:text-black">
            ← Retour au dashboard
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-12">
        <h2 className="text-3xl font-bold mb-8">Mes validations</h2>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Validations List */}
          <div className="lg:col-span-1">
            <h3 className="text-xl font-bold mb-6">Liste des validations</h3>
            {loading ? (
              <div className="text-center text-gray-600">Chargement...</div>
            ) : validations.length === 0 ? (
              <div className="text-center text-gray-600 py-12">
                <p>Aucune validation</p>
              </div>
            ) : (
              <div className="space-y-4">
                {validations.map((validation) => (
                  <button
                    key={validation.id}
                    onClick={() => setSelectedValidation(validation)}
                    className={`w-full text-left border rounded-lg p-4 transition ${
                      selectedValidation?.id === validation.id
                        ? 'border-black bg-gray-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-mono text-gray-600">{validation.id.slice(0, 8)}...</span>
                      <span className={`px-2 py-1 rounded text-xs font-semibold ${getStatusColor(validation.status)}`}>
                        {validation.status}
                      </span>
                    </div>
                    <div className="text-sm">
                      <p className="font-semibold mb-1">{validation.successRate.toFixed(1)}% conformité</p>
                      <p className="text-gray-600 text-xs">{new Date(validation.createdAt).toLocaleDateString('fr-FR')}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Validation Details */}
          <div className="lg:col-span-2">
            {selectedValidation ? (
              <div className="border border-gray-200 rounded-lg p-8">
                <h3 className="text-2xl font-bold mb-6">Détails de la validation</h3>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-6 mb-8">
                  <div className="text-center">
                    <div className="text-3xl font-bold text-green-600 mb-2">{selectedValidation.passedRules}</div>
                    <p className="text-gray-600 text-sm">Règles réussies</p>
                  </div>
                  <div className="text-center">
                    <div className="text-3xl font-bold text-red-600 mb-2">{selectedValidation.failedRules}</div>
                    <p className="text-gray-600 text-sm">Règles échouées</p>
                  </div>
                  <div className="text-center">
                    <div className="text-3xl font-bold text-blue-600 mb-2">{selectedValidation.successRate.toFixed(1)}%</div>
                    <p className="text-gray-600 text-sm">Taux de conformité</p>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="mb-8">
                  <div className="flex justify-between mb-2">
                    <span className="font-semibold">Progression</span>
                    <span className="text-gray-600">{selectedValidation.successRate.toFixed(1)}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-3">
                    <div
                      className="bg-green-600 h-3 rounded-full transition-all"
                      style={{ width: `${selectedValidation.successRate}%` }}
                    ></div>
                  </div>
                </div>

                {/* Details */}
                <div className="space-y-4">
                  <div className="border-t pt-4">
                    <p className="text-gray-600 text-sm">
                      <span className="font-semibold">ID:</span> {selectedValidation.id}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-600 text-sm">
                      <span className="font-semibold">Statut:</span>{' '}
                      <span className={`px-2 py-1 rounded text-xs font-semibold ${getStatusColor(selectedValidation.status)}`}>
                        {selectedValidation.status}
                      </span>
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-600 text-sm">
                      <span className="font-semibold">Date:</span>{' '}
                      {new Date(selectedValidation.createdAt).toLocaleDateString('fr-FR', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                </div>

                {/* Actions */}
                <div className="mt-8 flex gap-4">
                  <Link
                    href={`/validations/${selectedValidation.id}/results`}
                    className="flex-1 bg-black text-white py-2 rounded-lg hover:bg-gray-800 transition text-center font-semibold"
                  >
                    Voir les détails
                  </Link>
                  <button className="flex-1 border border-gray-300 py-2 rounded-lg hover:bg-gray-50 transition font-semibold">
                    Exporter
                  </button>
                </div>
              </div>
            ) : (
              <div className="border border-gray-200 rounded-lg p-8 text-center text-gray-600">
                <p>Sélectionnez une validation pour voir les détails</p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}

export default function ValidationsPage() {
  return (
    <Suspense fallback={<div>Chargement...</div>}>
      <ValidationsContent />
    </Suspense>
  )
}
