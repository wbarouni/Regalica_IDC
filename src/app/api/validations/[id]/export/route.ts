import { NextRequest, NextResponse } from 'next/server'
import { db } from '../../../../../db'
import { validations, ruleResults } from '../../../../../db/schema'
import { eq } from 'drizzle-orm'
import { verifyToken } from '../../../../../lib/auth'

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  try {
    // Vérifier l'authentification
    const token = req.headers.get('authorization')?.replace('Bearer ', '')
    if (!token) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    const user = await verifyToken(token)
    if (!user) {
      return NextResponse.json({ error: 'Token invalide' }, { status: 401 })
    }

    const validationId = params.id
    const format = req.nextUrl.searchParams.get('format') || 'json'

    // Récupérer la validation
    const validation = await db
      .select()
      .from(validations)
      .where(eq(validations.id, validationId))
      .limit(1)

    if (!validation || validation.length === 0) {
      return NextResponse.json({ error: 'Validation non trouvée' }, { status: 404 })
    }

    // Vérifier les permissions
    if (validation[0].userId !== user.id && user.role !== 'admin') {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }

    // Récupérer les résultats
    const results = await db
      .select()
      .from(ruleResults)
      .where(eq(ruleResults.validationId, validationId))

    if (format === 'json') {
      return NextResponse.json(
        {
          success: true,
          data: {
            validation: validation[0],
            results,
          },
        },
        {
          status: 200,
          headers: {
            'Content-Disposition': `attachment; filename="validation-${validationId}.json"`,
            'Content-Type': 'application/json',
          },
        }
      )
    } else if (format === 'csv') {
      // Générer CSV
      const csvContent = generateCSV(validation[0], results)

      return new NextResponse(csvContent, {
        status: 200,
        headers: {
          'Content-Disposition': `attachment; filename="validation-${validationId}.csv"`,
          'Content-Type': 'text/csv; charset=utf-8',
        },
      })
    } else if (format === 'html') {
      // Générer HTML pour impression
      const htmlContent = generateHTML(validation[0], results)

      return new NextResponse(htmlContent, {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
        },
      })
    }

    return NextResponse.json(
      { error: 'Format non supporté' },
      { status: 400 }
    )
  } catch (error: any) {
    console.error('Erreur export:', error)
    return NextResponse.json(
      { error: error.message || 'Erreur serveur' },
      { status: 500 }
    )
  }
}

function generateCSV(validation: any, results: any[]): string {
  const headers = ['Règle', 'Statut', 'Valeur attendue', 'Valeur calculée', 'Message']
  const rows = results.map((r) => [
    `RDG-${r.ruleNumber}`,
    r.status,
    JSON.stringify(r.expectedValue),
    JSON.stringify(r.calculatedValue),
    r.message,
  ])

  const csv = [
    `Validation ID,${validation.id}`,
    `Date,${new Date(validation.createdAt).toLocaleDateString('fr-FR')}`,
    `Taux de conformité,${validation.successRate}%`,
    `Règles réussies,${validation.passedRules}`,
    `Règles échouées,${validation.failedRules}`,
    '',
    headers.join(','),
    ...rows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
  ].join('\n')

  return csv
}

function generateHTML(validation: any, results: any[]): string {
  const html = `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Rapport de Validation</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      margin: 20px;
      color: #333;
    }
    .header {
      text-align: center;
      margin-bottom: 30px;
      border-bottom: 2px solid #000;
      padding-bottom: 20px;
    }
    .stats {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 20px;
      margin-bottom: 30px;
    }
    .stat-box {
      border: 1px solid #ddd;
      padding: 15px;
      text-align: center;
      border-radius: 5px;
    }
    .stat-value {
      font-size: 24px;
      font-weight: bold;
      color: #000;
    }
    .stat-label {
      color: #666;
      font-size: 12px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 20px;
    }
    th {
      background-color: #f5f5f5;
      padding: 10px;
      text-align: left;
      border-bottom: 2px solid #000;
      font-weight: bold;
    }
    td {
      padding: 10px;
      border-bottom: 1px solid #ddd;
    }
    tr:nth-child(even) {
      background-color: #f9f9f9;
    }
    .status-passed {
      color: green;
      font-weight: bold;
    }
    .status-failed {
      color: red;
      font-weight: bold;
    }
    .status-pending {
      color: orange;
      font-weight: bold;
    }
    @media print {
      body {
        margin: 0;
      }
      .no-print {
        display: none;
      }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>Rapport de Validation</h1>
    <p>Regalica IDC - Plateforme de Validation de Reportings Bancaires</p>
    <p>Date: ${new Date(validation.createdAt).toLocaleDateString('fr-FR')}</p>
  </div>

  <div class="stats">
    <div class="stat-box">
      <div class="stat-value" style="color: green;">${validation.passedRules}</div>
      <div class="stat-label">Règles réussies</div>
    </div>
    <div class="stat-box">
      <div class="stat-value" style="color: red;">${validation.failedRules}</div>
      <div class="stat-label">Règles échouées</div>
    </div>
    <div class="stat-box">
      <div class="stat-value" style="color: orange;">${validation.pendingRules || 0}</div>
      <div class="stat-label">Règles en attente</div>
    </div>
    <div class="stat-box">
      <div class="stat-value" style="color: blue;">${validation.successRate.toFixed(1)}%</div>
      <div class="stat-label">Taux de conformité</div>
    </div>
  </div>

  <h2>Résultats détaillés</h2>
  <table>
    <thead>
      <tr>
        <th>Règle</th>
        <th>Statut</th>
        <th>Valeur attendue</th>
        <th>Valeur calculée</th>
        <th>Message</th>
      </tr>
    </thead>
    <tbody>
      ${results
        .map(
          (r) => `
      <tr>
        <td>RDG-${r.ruleNumber}</td>
        <td class="status-${r.status}">${r.status}</td>
        <td><code>${JSON.stringify(r.expectedValue)}</code></td>
        <td><code>${JSON.stringify(r.calculatedValue)}</code></td>
        <td>${r.message}</td>
      </tr>
      `
        )
        .join('')}
    </tbody>
  </table>

  <div class="no-print" style="margin-top: 30px;">
    <button onclick="window.print()">Imprimer</button>
  </div>
</body>
</html>
  `

  return html
}
