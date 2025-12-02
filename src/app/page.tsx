'use client'

import Link from 'next/link'

export default function Home() {
  return (
    <div className="min-h-screen bg-white text-black">
      {/* Navigation */}
      <nav className="fixed top-0 w-full bg-white border-b border-gray-200 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="text-2xl font-bold">Regalica IDC</div>
          <div className="flex gap-6">
            <Link href="/login" className="hover:text-gray-600 transition">
              Connexion
            </Link>
            <Link href="/register" className="bg-black text-white px-6 py-2 rounded-lg hover:bg-gray-800 transition">
              S'inscrire
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-6xl font-bold mb-6 leading-tight">
            Validation complète des reportings bancaires BCT
          </h1>
          <p className="text-xl text-gray-600 mb-8">
            Plateforme SaaS pour assurer la conformité totale de vos rapports bancaires avec les normes de la Banque Centrale de Tunisie.
          </p>
          <div className="flex gap-4 justify-center">
            <Link
              href="/register"
              className="bg-black text-white px-8 py-3 rounded-lg hover:bg-gray-800 transition text-lg font-semibold"
            >
              Commencer gratuitement
            </Link>
            <Link
              href="/database-schema"
              className="border border-black px-8 py-3 rounded-lg hover:bg-gray-100 transition text-lg font-semibold"
            >
              Voir la structure BD
            </Link>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 px-6 bg-gray-50">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-4xl font-bold text-center mb-16">Fonctionnalités principales</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                title: '18 452 Règles RDG',
                description: 'Validation complète contre toutes les règles de reporting définies par la BCT',
                icon: '✓',
              },
              {
                title: 'Validation IA',
                description: 'Détection intelligente d\'anomalies et recommandations avec Gemini API',
                icon: '🤖',
              },
              {
                title: 'Upload facile',
                description: 'Importez vos fichiers XML, XLSX ou CSV en quelques clics',
                icon: '📤',
              },
              {
                title: 'Rapports détaillés',
                description: 'Visualisez les résultats avec des rapports complets et exportables',
                icon: '📊',
              },
              {
                title: 'Audit complet',
                description: 'Traçabilité complète de toutes les actions et modifications',
                icon: '🔐',
              },
              {
                title: 'Multi-utilisateurs',
                description: 'Gestion des rôles et permissions pour les équipes',
                icon: '👥',
              },
            ].map((feature, idx) => (
              <div key={idx} className="border border-gray-200 rounded-lg p-6 hover:shadow-lg transition">
                <div className="text-4xl mb-4">{feature.icon}</div>
                <h3 className="text-xl font-bold mb-2">{feature.title}</h3>
                <p className="text-gray-600">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 text-center">
            {[
              { number: '18,452', label: 'Règles RDG' },
              { number: '8', label: 'Tables BD' },
              { number: '15+', label: 'Endpoints API' },
              { number: '100%', label: 'Conformité' },
            ].map((stat, idx) => (
              <div key={idx}>
                <div className="text-5xl font-bold mb-2">{stat.number}</div>
                <div className="text-gray-600">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-6 bg-black text-white">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl font-bold mb-6">Prêt à commencer ?</h2>
          <p className="text-xl text-gray-300 mb-8">
            Rejoignez les institutions financières qui font confiance à Regalica IDC
          </p>
          <Link
            href="/register"
            className="bg-white text-black px-8 py-3 rounded-lg hover:bg-gray-200 transition text-lg font-semibold inline-block"
          >
            Créer un compte
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-200 py-12 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
            <div>
              <h4 className="font-bold mb-4">Regalica IDC</h4>
              <p className="text-gray-600 text-sm">Validation de reportings bancaires BCT</p>
            </div>
            <div>
              <h4 className="font-bold mb-4">Produit</h4>
              <ul className="space-y-2 text-sm text-gray-600">
                <li>
                  <a href="#" className="hover:text-black">
                    Fonctionnalités
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-black">
                    Tarification
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-black">
                    Documentation
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold mb-4">Entreprise</h4>
              <ul className="space-y-2 text-sm text-gray-600">
                <li>
                  <a href="#" className="hover:text-black">
                    À propos
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-black">
                    Blog
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-black">
                    Contact
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold mb-4">Légal</h4>
              <ul className="space-y-2 text-sm text-gray-600">
                <li>
                  <a href="#" className="hover:text-black">
                    Confidentialité
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-black">
                    Conditions
                  </a>
                </li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-200 pt-8 text-center text-gray-600 text-sm">
            <p>&copy; 2024 Regalica IDC. Tous droits réservés.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
