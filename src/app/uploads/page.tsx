'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface Upload {
  id: string
  fileName: string
  fileSize: number
  status: string
  uploadedAt: string
}

export default function UploadsPage() {
  const router = useRouter()
  const [uploads, setUploads] = useState<Upload[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [dragActive, setDragActive] = useState(false)

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) {
      router.push('/login')
      return
    }

    fetchUploads()
  }, [router])

  const fetchUploads = async () => {
    try {
      const token = localStorage.getItem('token')
      const response = await fetch('/api/uploads', {
        headers: { Authorization: `Bearer ${token}` },
      })

      if (response.ok) {
        const data = await response.json()
        setUploads(data.data || [])
      }
    } catch (err) {
      console.error('Erreur lors de la récupération des uploads', err)
    } finally {
      setLoading(false)
    }
  }

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)

    const files = e.dataTransfer.files
    if (files && files.length > 0) {
      handleFileUpload(files[0])
    }
  }

  const handleFileUpload = async (file: File) => {
    setUploading(true)

    try {
      const formData = new FormData()
      formData.append('file', file)

      const token = localStorage.getItem('token')
      const response = await fetch('/api/uploads', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      })

      if (response.ok) {
        const data = await response.json()
        setUploads([data.data, ...uploads])
      }
    } catch (err) {
      console.error('Erreur lors de l\'upload', err)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Regalica IDC</h1>
            <p className="text-gray-600 text-sm">Uploads</p>
          </div>
          <Link href="/dashboard" className="text-gray-600 hover:text-black">
            ← Retour au dashboard
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-12">
        <h2 className="text-3xl font-bold mb-8">Mes uploads</h2>

        {/* Upload Zone */}
        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-lg p-12 text-center mb-12 transition ${
            dragActive ? 'border-black bg-gray-50' : 'border-gray-300'
          }`}
        >
          <div className="text-4xl mb-4">📤</div>
          <h3 className="text-xl font-bold mb-2">Déposer votre fichier ici</h3>
          <p className="text-gray-600 mb-6">ou cliquez pour sélectionner</p>
          <input
            type="file"
            onChange={(e) => e.target.files && handleFileUpload(e.target.files[0])}
            className="hidden"
            id="fileInput"
            accept=".xml,.xlsx,.csv"
          />
          <label
            htmlFor="fileInput"
            className="inline-block px-6 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition cursor-pointer"
          >
            Sélectionner un fichier
          </label>
          <p className="text-gray-500 text-sm mt-4">Formats acceptés: XML, XLSX, CSV</p>
        </div>

        {uploading && (
          <div className="mb-8 p-6 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center gap-4">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
              <p className="text-blue-700">Upload en cours...</p>
            </div>
          </div>
        )}

        {/* Uploads List */}
        <div>
          <h3 className="text-xl font-bold mb-6">Fichiers uploadés</h3>
          {loading ? (
            <div className="text-center text-gray-600">Chargement...</div>
          ) : uploads.length === 0 ? (
            <div className="text-center text-gray-600 py-12">
              <p>Aucun fichier uploadé</p>
            </div>
          ) : (
            <div className="space-y-4">
              {uploads.map((upload) => (
                <div key={upload.id} className="border border-gray-200 rounded-lg p-6 hover:shadow-lg transition">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-bold mb-2">{upload.fileName}</h4>
                      <p className="text-gray-600 text-sm">
                        {(upload.fileSize / 1024 / 1024).toFixed(2)} MB • {new Date(upload.uploadedAt).toLocaleDateString('fr-FR')}
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
                      <span
                        className={`px-3 py-1 rounded-full text-sm font-semibold ${
                          upload.status === 'completed'
                            ? 'bg-green-100 text-green-700'
                            : upload.status === 'processing'
                              ? 'bg-blue-100 text-blue-700'
                              : upload.status === 'failed'
                                ? 'bg-red-100 text-red-700'
                                : 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {upload.status}
                      </span>
                      <Link
                        href={`/validations?uploadId=${upload.id}`}
                        className="text-black hover:underline"
                      >
                        Voir les résultats →
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
