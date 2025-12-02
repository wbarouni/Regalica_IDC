# Guide de Déploiement - Regalica IDC

## 📋 Prérequis

- Compte GitHub (déjà connecté)
- Compte Vercel (gratuit)
- Base de données MySQL (PlanetScale, Railway, ou autre)
- Clé API Google Gemini

## 🚀 Étapes de Déploiement

### 1. Préparer la Base de Données MySQL

#### Option A : PlanetScale (Recommandé - Gratuit)

```bash
# 1. Créer un compte sur https://planetscale.com
# 2. Créer une nouvelle base de données "regalica-prod"
# 3. Copier la chaîne de connexion MySQL
```

#### Option B : Railway

```bash
# 1. Créer un compte sur https://railway.app
# 2. Créer un nouveau service MySQL
# 3. Copier la chaîne de connexion
```

### 2. Déployer sur Vercel

#### Méthode 1 : Via l'interface Vercel (Recommandé)

```bash
# 1. Aller sur https://vercel.com
# 2. Cliquer sur "New Project"
# 3. Sélectionner le repository GitHub "wbarouni/Regalica_IDC"
# 4. Configurer les variables d'environnement (voir ci-dessous)
# 5. Cliquer sur "Deploy"
```

#### Méthode 2 : Via Vercel CLI

```bash
# 1. Installer Vercel CLI
npm i -g vercel

# 2. Se connecter à Vercel
vercel login

# 3. Déployer le projet
vercel

# 4. Suivre les instructions interactives
```

### 3. Configurer les Variables d'Environnement

Sur Vercel, ajouter les variables suivantes dans "Settings > Environment Variables" :

```
DATABASE_URL=mysql://user:password@host:3306/regalica_prod
JWT_SECRET=your-secret-key-min-32-characters-long
GEMINI_API_KEY=your-gemini-api-key
NODE_ENV=production
NEXT_PUBLIC_API_URL=https://your-domain.vercel.app
```

### 4. Exécuter les Migrations

Après le déploiement, exécuter les migrations Drizzle :

```bash
# En local avec la base de données production
DATABASE_URL="mysql://..." pnpm drizzle-kit push:mysql

# Ou via Vercel Functions (créer un endpoint /api/migrate)
```

### 5. Charger les Règles RDG

```bash
# Via un endpoint API
curl -X POST https://your-domain.vercel.app/api/admin/rules/load \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"rules": []}'
```

## 🔧 Configuration Avancée

### Domaine Personnalisé

1. Aller dans "Settings > Domains"
2. Ajouter votre domaine personnalisé
3. Configurer les enregistrements DNS chez votre registraire

### Variables d'Environnement Sensibles

```bash
# Générer une clé JWT sécurisée
openssl rand -base64 32

# Ou utiliser
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Monitoring et Logs

- **Vercel Analytics** : Inclus gratuitement
- **Logs** : Accessibles via `vercel logs`
- **Performance** : Vérifier dans le dashboard Vercel

## 📊 Vérification du Déploiement

### 1. Tester les Endpoints

```bash
# Test de santé
curl https://your-domain.vercel.app/api/health

# Test d'authentification
curl -X POST https://your-domain.vercel.app/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'
```

### 2. Vérifier la Base de Données

```bash
# Vérifier la connexion
mysql -h host -u user -p -e "SELECT COUNT(*) FROM rdg_rules;"
```

### 3. Tester le Frontend

```
https://your-domain.vercel.app
```

## 🐛 Troubleshooting

### Erreur : "DATABASE_URL not found"

```bash
# Vérifier que la variable est définie dans Vercel
vercel env list

# Redéployer après ajout de variables
vercel redeploy
```

### Erreur : "Connection timeout"

```bash
# Vérifier la chaîne de connexion MySQL
# Vérifier que l'IP Vercel est whitelistée (si applicable)
# Vérifier les credentials
```

### Erreur : "Module not found"

```bash
# Réinstaller les dépendances
pnpm install

# Reconstruire
pnpm build

# Redéployer
vercel redeploy
```

## 📝 Checklist de Déploiement

- [ ] Base de données MySQL créée et accessible
- [ ] Variables d'environnement configurées dans Vercel
- [ ] Migrations Drizzle exécutées
- [ ] Règles RDG chargées
- [ ] Frontend accessible via HTTPS
- [ ] Authentification fonctionnelle
- [ ] Upload de fichiers fonctionnel
- [ ] Validation des règles RDG fonctionnelle
- [ ] Domaine personnalisé configuré (optionnel)
- [ ] Monitoring et logs configurés

## 🔐 Sécurité

### Recommandations

1. **JWT Secret** : Utiliser une clé forte et unique
2. **Database Password** : Utiliser un mot de passe fort
3. **API Keys** : Stocker dans les variables d'environnement Vercel
4. **CORS** : Configurer correctement dans les headers
5. **Rate Limiting** : Implémenter pour les endpoints publics
6. **HTTPS** : Toujours activé sur Vercel

### Secrets Sensibles

Ne JAMAIS commiter :
- `.env.local`
- Clés API
- Mots de passe de base de données
- Tokens JWT

## 📞 Support

Pour toute question ou problème :
1. Consulter la documentation Vercel : https://vercel.com/docs
2. Consulter la documentation Next.js : https://nextjs.org/docs
3. Consulter la documentation Drizzle : https://orm.drizzle.team

## 🎉 Après le Déploiement

1. Tester l'application en production
2. Configurer les alertes et monitoring
3. Mettre en place les sauvegardes de base de données
4. Documenter les processus de maintenance
5. Planifier les mises à jour régulières
