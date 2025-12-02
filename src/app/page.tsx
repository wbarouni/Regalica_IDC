import Link from 'next/link'

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="container mx-auto px-4 py-20">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="text-center mb-16">
            <h1 className="text-5xl font-bold text-white mb-4">
              Regalica IDC
            </h1>
            <p className="text-xl text-slate-300 mb-8">
              Plateforme de validation de reportings bancaires BCT (Tunisie)
            </p>
            <p className="text-lg text-slate-400 mb-12">
              Validez vos rapports bancaires avec précision et conformité aux règles RDG
            </p>
          </div>

          {/* Features */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
            <div className="bg-slate-800 bg-opacity-50 backdrop-blur-sm rounded-lg p-8 border border-slate-700">
              <div className="text-3xl mb-4">📤</div>
              <h3 className="text-xl font-semibold text-white mb-3">Upload Facile</h3>
              <p className="text-slate-400">
                Uploadez vos fichiers XML de reporting en quelques clics
              </p>
            </div>

            <div className="bg-slate-800 bg-opacity-50 backdrop-blur-sm rounded-lg p-8 border border-slate-700">
              <div className="text-3xl mb-4">✓</div>
              <h3 className="text-xl font-semibold text-white mb-3">Validation Complète</h3>
              <p className="text-slate-400">
                962 règles RDG appliquées automatiquement et intelligemment
              </p>
            </div>

            <div className="bg-slate-800 bg-opacity-50 backdrop-blur-sm rounded-lg p-8 border border-slate-700">
              <div className="text-3xl mb-4">📊</div>
              <h3 className="text-xl font-semibold text-white mb-3">Rapports Détaillés</h3>
              <p className="text-slate-400">
                Obtenez des rapports détaillés avec recommandations d'amélioration
              </p>
            </div>
          </div>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/auth/login"
              className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors"
            >
              Se connecter
            </Link>
            <Link
              href="/auth/register"
              className="px-8 py-3 bg-slate-700 hover:bg-slate-600 text-white font-semibold rounded-lg transition-colors"
            >
              S'inscrire
            </Link>
          </div>

          {/* Info Section */}
          <div className="mt-20 bg-slate-800 bg-opacity-50 backdrop-blur-sm rounded-lg p-8 border border-slate-700">
            <h2 className="text-2xl font-bold text-white mb-4">À propos de Regalica</h2>
            <p className="text-slate-300 mb-4">
              Regalica est une plateforme SaaS spécialisée dans la validation des reportings bancaires selon les normes de la Banque Centrale de Tunisie (BCT).
            </p>
            <p className="text-slate-300">
              Notre système applique automatiquement 962 règles de validation (RDG) pour assurer la conformité complète de vos rapports bancaires.
            </p>
          </div>
        </div>
      </div>
    </main>
  )
}
