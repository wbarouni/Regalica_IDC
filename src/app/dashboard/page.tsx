'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface User {
  id: string
  email: string
  firstName: string
  lastName: string
  role: string
  organization: string
}

export default function DashboardPage() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({
    uploads: 0,
    validations: 0,
    successRate: 0,
  })

  useEffect(() => {
    // Récupérer l'utilisateur depuis localStorage
    const storedUser = localStorage.getItem('user')
    if (!storedUser) {
      router.push('/login')
      return
    }

    const userData = JSON.parse(storedUser)
    setUser(userData)
    setLoading(false)

    // Récupérer les stats
    fetchStats()
  }, [router])

  const fetchStats = async () => {
    try {
      const token = localStorage.getItem('token')
      const response = await fetch('/api/uploads', {
        headers: { Authorization: `Bearer ${token}` },
      })

      if (response.ok) {
        const data = await response.json()
        setStats({
          uploads: data.data?.length || 0,
          validations: 0,
          successRate: 0,
        })
      }
    } catch (err) {
      console.error('Erreur lors de la récupération des stats', err)
    }
  }

  const handleLogout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    router.push('/')
  }

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

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Regalica IDC</h1>
            <p className="text-gray-600 text-sm">Dashboard</p>
          </div>
          <div className="flex items-center gap-6">
            <div className="text-right">
              <p className="font-semibold">{user?.firstName} {user?.lastName}</p>
              <p className="text-gray-600 text-sm">{user?.organization}</p>
            </div>
            <button
              onClick={handleLogout}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
            >
              Déconnexion
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-12">
        {/* Welcome Section */}
        <div className="mb-12">
          <h2 className="text-3xl font-bold mb-4">Bienvenue, {user?.firstName}!</h2>
          <p className="text-gray-600">Gérez vos validations de reportings bancaires</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          <div className="border border-gray-200 rounded-lg p-6">
            <div className="text-4xl font-bold mb-2">{stats.uploads}</div>
            <p className="text-gray-600">Fichiers uploadés</p>
          </div>
          <div className="border border-gray-200 rounded-lg p-6">
            <div className="text-4xl font-bold mb-2">{stats.validations}</div>
            <p className="text-gray-600">Validations effectuées</p>
          </div>
          <div className="border border-gray-200 rounded-lg p-6">
            <div className="text-4xl font-bold mb-2">{stats.successRate}%</div>
            <p className="text-gray-600">Taux de conformité</p>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="mb-12">
          <h3 className="text-2xl font-bold mb-6">Actions rapides</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Link
              href="/uploads"
              className="border border-gray-200 rounded-lg p-8 hover:shadow-lg transition text-center"
            >
              <div className="text-4xl mb-4">📤</div>
              <h4 className="text-xl font-bold mb-2">Nouvel upload</h4>
              <p className="text-gray-600">Uploadez un fichier de reporting</p>
            </Link>
            <Link
              href="/validations"
              className="border border-gray-200 rounded-lg p-8 hover:shadow-lg transition text-center"
            >
              <div className="text-4xl mb-4">📊</div>
              <h4 className="text-xl font-bold mb-2">Mes validations</h4>
              <p className="text-gray-600">Consultez vos validations</p>
            </Link>
          </div>
        </div>

        {/* Recent Activity */}
        <div>
          <h3 className="text-2xl font-bold mb-6">Activité récente</h3>
          <div className="border border-gray-200 rounded-lg p-8 text-center text-gray-600">
            <p>Aucune activité récente</p>
          </div>
        </div>
      </main>
    </div>
  )
}
