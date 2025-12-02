# Guide de Déploiement Vercel - Regalica IDC

## 📋 Prérequis

- Compte Vercel (https://vercel.com)
- Repository GitHub connecté
- Variables d'environnement configurées

## 🚀 Étapes de Déploiement

### 1. Créer un Compte Vercel

```bash
# Visiter https://vercel.com
# Se connecter avec GitHub
# Autoriser Vercel à accéder aux repositories
```

### 2. Importer le Projet

```bash
# Option 1 : Via l'interface Vercel
# 1. Aller sur https://vercel.com/new
# 2. Sélectionner "Import Git Repository"
# 3. Chercher "Regalica_IDC"
# 4. Cliquer "Import"

# Option 2 : Via Vercel CLI
npm i -g vercel
vercel login
cd /home/ubuntu/Regalica_IDC
vercel
```

### 3. Configurer les Variables d'Environnement

Dans le dashboard Vercel, aller à **Settings > Environment Variables** et ajouter :

```env
# Base de données
DATABASE_URL=mysql://user:password@host:3306/regalica

# Authentification JWT
JWT_SECRET=your-secret-key-min-32-characters
JWT_EXPIRATION=7d
BCRYPT_ROUNDS=10

# Gemini API
GEMINI_API_KEY=your-gemini-api-key
GEMINI_MODEL=gemini-2.5-flash-lite

# Application
NODE_ENV=production
NEXT_PUBLIC_API_URL=https://your-domain.com
NEXT_PUBLIC_APP_NAME=Regalica IDC

# Fichiers
UPLOAD_DIR=/tmp/uploads
MAX_FILE_SIZE=52428800
```

### 4. Configurer le Domaine Personnalisé

1. Aller à **Settings > Domains**
2. Ajouter votre domaine personnalisé
3. Suivre les instructions pour configurer les DNS

### 5. Configurer les Builds et Déploiements

**Build Command :**
```bash
pnpm install && pnpm build
```

**Output Directory :**
```
.next
```

**Install Command :**
```bash
pnpm install --frozen-lockfile
```

### 6. Configurer la Base de Données Production

#### Option A : Utiliser PlanetScale (MySQL compatible)

```bash
# 1. Créer un compte PlanetScale
# 2. Créer une nouvelle database "regalica"
# 3. Générer une clé API
# 4. Copier la connection string
# 5. Ajouter à Vercel Environment Variables
```

#### Option B : Utiliser AWS RDS

```bash
# 1. Créer une instance RDS MySQL
# 2. Configurer les security groups
# 3. Copier la connection string
# 4. Ajouter à Vercel Environment Variables
```

#### Option C : Utiliser DigitalOcean Managed Database

```bash
# 1. Créer une database MySQL
# 2. Configurer les connexions autorisées
# 3. Copier la connection string
# 4. Ajouter à Vercel Environment Variables
```

### 7. Exécuter les Migrations

Une fois déployé, exécuter les migrations :

```bash
# Via l'API
curl -X GET https://your-domain.com/api/migrate \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"

# Ou manuellement via Drizzle
drizzle-kit push:mysql
```

### 8. Charger les Règles RDG

```bash
# Via l'API
curl -X POST https://your-domain.com/api/admin/rules/import \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json"
```

## 🔐 Configuration de Sécurité

### HTTPS
- ✅ Automatique avec Vercel (certificat SSL gratuit)

### CORS
Ajouter dans `next.config.js` :

```javascript
async headers() {
  return [
    {
      source: '/api/:path*',
      headers: [
        { key: 'Access-Control-Allow-Origin', value: 'https://your-domain.com' },
        { key: 'Access-Control-Allow-Methods', value: 'GET,POST,PUT,DELETE' },
      ],
    },
  ]
}
```

### Rate Limiting
Utiliser Vercel Edge Middleware :

```typescript
// middleware.ts
import { NextRequest, NextResponse } from 'next/server'

export function middleware(request: NextRequest) {
  // Implémenter le rate limiting
  return NextResponse.next()
}

export const config = {
  matcher: '/api/:path*',
}
```

## 📊 Monitoring et Logs

### Accéder aux Logs
1. Dashboard Vercel > Project > Deployments
2. Cliquer sur le déploiement
3. Aller à "Logs"

### Configurer les Alertes
1. Settings > Alerts
2. Ajouter des notifications pour les erreurs

### Analytics
1. Analytics > Web Vitals
2. Surveiller les performances

## 🔄 Déploiement Continu (CI/CD)

Vercel déploie automatiquement :
- **Production** : Quand on push sur `main`
- **Preview** : Pour chaque Pull Request

### Configurer les Règles de Déploiement

Dans `vercel.json` :

```json
{
  "buildCommand": "pnpm build",
  "installCommand": "pnpm install --frozen-lockfile",
  "env": {
    "NODE_ENV": "production"
  },
  "regions": ["cdg1", "iad1"],
  "functions": {
    "api/**": {
      "maxDuration": 30
    }
  }
}
```

## 🚨 Troubleshooting

### Erreur : "DATABASE_URL not found"
```bash
# Vérifier les variables d'environnement
# Settings > Environment Variables
# S'assurer que DATABASE_URL est défini
```

### Erreur : "GEMINI_API_KEY not found"
```bash
# Ajouter la clé API Gemini
# Settings > Environment Variables > GEMINI_API_KEY
```

### Build échoue
```bash
# Vérifier les logs
# Vercel Dashboard > Deployments > Logs
# S'assurer que pnpm est installé
```

### Problèmes de connexion BD
```bash
# Vérifier la connection string
# Tester la connexion localement
# Vérifier les security groups/firewall
```

## 📈 Optimisations Production

### Caching
```typescript
// Ajouter les headers de cache
export const revalidate = 3600 // 1 heure
```

### Compression
```javascript
// next.config.js
compress: true
```

### Image Optimization
```typescript
import Image from 'next/image'

// Utiliser next/image pour l'optimisation automatique
```

## 🔗 Ressources

- [Vercel Docs](https://vercel.com/docs)
- [Next.js Deployment](https://nextjs.org/docs/deployment)
- [Environment Variables](https://vercel.com/docs/concepts/projects/environment-variables)
- [Custom Domains](https://vercel.com/docs/concepts/projects/custom-domains)

## ✅ Checklist de Déploiement

- [ ] Repository GitHub connecté
- [ ] Variables d'environnement configurées
- [ ] Base de données créée et accessible
- [ ] Migrations exécutées
- [ ] Règles RDG importées
- [ ] Domaine personnalisé configuré
- [ ] HTTPS activé
- [ ] Logs et monitoring configurés
- [ ] Tests de fonctionnalité complétés
- [ ] Sauvegardes configurées

## 📞 Support

Pour toute question :
- Consulter la documentation Vercel
- Vérifier les logs de déploiement
- Contacter le support Vercel
