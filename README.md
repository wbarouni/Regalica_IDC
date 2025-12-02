# Regalica IDC - Plateforme de Validation de Reportings Bancaires

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Status](https://img.shields.io/badge/status-Active-brightgreen)

## 📋 Description

**Regalica IDC** est une plateforme SaaS complète pour la validation des reportings bancaires selon les normes de la Banque Centrale de Tunisie (BCT). Elle intègre 18 452 règles de validation (RDG) et utilise l'intelligence artificielle pour détecter les anomalies et générer des recommandations.

## ✨ Fonctionnalités Principales

### 🔐 Authentification & Sécurité
- Authentification JWT avec bcrypt
- Gestion des rôles (admin, validator, analyst, viewer)
- Système de sessions sécurisé
- Audit complet de toutes les actions

### 📤 Gestion des Uploads
- Upload de fichiers XML, XLSX, CSV
- Drag & drop intuitif
- Validation de structure automatique
- Traitement asynchrone des fichiers

### ✓ Validation Intelligente
- 18 452 règles RDG intégrées
- Validation avec tolérance configurable
- Détection d'anomalies avec Gemini API
- Recommandations générées par IA

### 📊 Rapports & Visualisation
- Tableaux de bord en temps réel
- Statistiques détaillées par règle
- Taux de conformité calculé automatiquement
- Exports de rapports

### 🗄️ Base de Données
- 8 tables relationnelles
- Support MySQL/MariaDB
- Drizzle ORM pour la gestion
- Migrations automatiques

## 🛠️ Stack Technique

| Composant | Technologie |
|-----------|-------------|
| **Frontend** | Next.js 14, React 18, TypeScript |
| **Backend** | Next.js API Routes |
| **Base de Données** | MySQL, Drizzle ORM |
| **Styling** | Tailwind CSS |
| **Authentification** | JWT, bcrypt |
| **IA** | Google Gemini API |
| **Déploiement** | Vercel |

## 📦 Installation

### Prérequis
- Node.js 18+
- pnpm ou npm
- MySQL 8.0+
- Clé API Google Gemini

### Étapes d'Installation

```bash
# 1. Cloner le repository
git clone https://github.com/wbarouni/Regalica_IDC.git
cd Regalica_IDC

# 2. Installer les dépendances
pnpm install

# 3. Configurer les variables d'environnement
cp .env.example .env.local

# 4. Éditer .env.local avec vos paramètres
# DATABASE_URL=mysql://user:password@localhost:3306/regalica
# JWT_SECRET=your-secret-key
# GEMINI_API_KEY=your-api-key

# 5. Exécuter les migrations
pnpm drizzle-kit push:mysql

# 6. Démarrer le serveur de développement
pnpm dev
```

L'application sera accessible à `http://localhost:3000`

## 🚀 Déploiement

### Déploiement sur Vercel (Recommandé)

```bash
# 1. Installer Vercel CLI
npm i -g vercel

# 2. Se connecter à Vercel
vercel login

# 3. Déployer
vercel
```

Pour plus de détails, voir [DEPLOYMENT.md](./DEPLOYMENT.md)

## 📚 Documentation des API

### Authentification

#### Inscription
```bash
POST /api/auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123",
  "firstName": "John",
  "lastName": "Doe",
  "organization": "Bank ABC"
}
```

#### Connexion
```bash
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123"
}
```

### Uploads

#### Créer un upload
```bash
POST /api/uploads
Authorization: Bearer {token}
Content-Type: multipart/form-data

file: <binary>
```

#### Lister les uploads
```bash
GET /api/uploads
Authorization: Bearer {token}
```

#### Traiter un upload
```bash
POST /api/uploads/{uploadId}/process
Authorization: Bearer {token}
```

### Validations

#### Lister les validations
```bash
GET /api/validations
Authorization: Bearer {token}
```

#### Obtenir les détails d'une validation
```bash
GET /api/validations/{validationId}
Authorization: Bearer {token}
```

#### Obtenir les résultats des règles
```bash
GET /api/validations/{validationId}/results
Authorization: Bearer {token}
```

### Règles RDG

#### Lister les règles
```bash
GET /api/rules?page=1&pageSize=50&annexe=620
Authorization: Bearer {token}
```

#### Charger les règles (Admin)
```bash
POST /api/admin/rules/load
Authorization: Bearer {token}
Content-Type: application/json

{
  "rules": [...]
}
```

#### Obtenir les statistiques
```bash
GET /api/admin/rules/statistics
Authorization: Bearer {token}
```

### Santé de l'Application

#### Vérifier le statut
```bash
GET /api/health
```

## 📁 Structure du Projet

```
Regalica_IDC/
├── src/
│   ├── app/
│   │   ├── api/              # Endpoints API
│   │   ├── dashboard/        # Page du tableau de bord
│   │   ├── login/            # Page de connexion
│   │   ├── register/         # Page d'inscription
│   │   ├── uploads/          # Gestion des uploads
│   │   ├── validations/      # Visualisation des validations
│   │   └── page.tsx          # Page d'accueil
│   ├── db/
│   │   ├── schema.ts         # Schéma Drizzle
│   │   └── index.ts          # Connexion BD
│   ├── services/             # Logique métier
│   ├── lib/                  # Utilitaires
│   ├── middleware/           # Middlewares
│   ├── types/                # Types TypeScript
│   └── config/               # Configuration
├── public/
│   └── rdg_rules.json        # 18 452 règles RDG
├── .env.local                # Variables d'environnement
├── drizzle.config.ts         # Configuration Drizzle
├── next.config.js            # Configuration Next.js
├── tsconfig.json             # Configuration TypeScript
├── tailwind.config.ts        # Configuration Tailwind
└── package.json              # Dépendances
```

## 🔑 Variables d'Environnement

```env
# Base de données
DATABASE_URL=mysql://user:password@host:3306/regalica

# Authentification
JWT_SECRET=your-secret-key-min-32-characters
JWT_EXPIRATION=7d
BCRYPT_ROUNDS=10

# Gemini API
GEMINI_API_KEY=your-gemini-api-key
GEMINI_MODEL=gemini-2.5-flash-lite

# Application
NODE_ENV=development
NEXT_PUBLIC_API_URL=http://localhost:3000
NEXT_PUBLIC_APP_NAME=Regalica IDC

# Fichiers
UPLOAD_DIR=./uploads
MAX_FILE_SIZE=52428800

# RDG
RDG_TOLERANCE=0.01
RDG_ENABLE_SMART_VALIDATION=true
```

## 📊 Schéma de Base de Données

### Tables Principales

| Table | Colonnes | Description |
|-------|----------|-------------|
| **users** | 10 | Utilisateurs et authentification |
| **uploads** | 10 | Fichiers uploadés |
| **validations** | 13 | Validations effectuées |
| **rule_results** | 12 | Résultats des règles RDG |
| **banking_data** | 9 | Données bancaires parsées |
| **rdg_rules** | 11 | Configuration des règles |
| **audit_logs** | 9 | Logs d'audit |
| **sessions** | 5 | Gestion des sessions |

## 🧪 Tests

### Tests Unitaires
```bash
pnpm test
```

### Tests d'Intégration
```bash
pnpm test:integration
```

### Tests E2E
```bash
pnpm test:e2e
```

## 🐛 Troubleshooting

### Erreur de connexion à la base de données
```bash
# Vérifier la chaîne de connexion
echo $DATABASE_URL

# Tester la connexion
mysql -h host -u user -p -e "SELECT 1;"
```

### Erreur d'authentification JWT
```bash
# Vérifier la clé secrète
echo $JWT_SECRET

# Régénérer une clé
openssl rand -base64 32
```

### Erreur Gemini API
```bash
# Vérifier la clé API
echo $GEMINI_API_KEY
```

## 📈 Performance

### Optimisations Implémentées
- ✅ Compression gzip
- ✅ Minification CSS/JS
- ✅ Code splitting automatique
- ✅ Caching des règles RDG
- ✅ Pagination des résultats
- ✅ Indexation des tables BD

## 🔒 Sécurité

### Mesures de Sécurité
- ✅ HTTPS obligatoire en production
- ✅ JWT pour l'authentification
- ✅ Bcrypt pour les mots de passe
- ✅ Validation des entrées
- ✅ Protection CSRF
- ✅ Rate limiting
- ✅ Audit logging complet
- ✅ Chiffrement des données sensibles

## 📞 Support & Contact

- **Email** : support@regalica-idc.com
- **Documentation** : https://docs.regalica-idc.com
- **Issues** : https://github.com/wbarouni/Regalica_IDC/issues

## 📄 Licence

Ce projet est sous licence MIT. Voir le fichier [LICENSE](./LICENSE) pour plus de détails.

## 👥 Contributeurs

- **Développeur Principal** : Manus AI
- **Sponsor** : Regalica Team

## 📝 Changelog

### Version 1.0.0 (2024-12-02)
- ✅ Backend complet avec API REST
- ✅ Frontend React avec authentification
- ✅ 18 452 règles RDG intégrées
- ✅ Validation intelligente avec Gemini API
- ✅ Système d'audit complet
- ✅ Déploiement sur Vercel

---

**Fait avec ❤️ par Manus AI**
