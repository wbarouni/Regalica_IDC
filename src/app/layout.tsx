import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Regalica IDC - Validation de Reportings Bancaires',
  description: 'Plateforme de validation de reportings bancaires BCT (Tunisie)',
  icons: {
    icon: '/favicon.ico',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="fr">
      <body className="antialiased">{children}</body>
    </html>
  )
}
