# Regalica IDC

Plateforme SaaS de validation de reportings bancaires BCT (Tunisie).

## 🎯 Objectif

Regalica IDC est une plateforme complète de validation des reportings bancaires selon les normes de la Banque Centrale de Tunisie (BCT). Le système applique automatiquement 962 règles de validation (RDG) pour assurer la conformité complète des rapports bancaires.

## 🏗️ Architecture

### Stack Technique

- **Framework**: Next.js 14 App Router
- **Langage**: TypeScript (strict)
- **Styling**: Tailwind CSS + Glassmorphism
- **Base de données**: MySQL avec Drizzle ORM
- **Authentification**: JWT
- **API IA**: Gemini API (gemini-2.5-flash-lite, gemini-2.0-flash-exp)
- **Parser XML**: fast-xml-parser

### Structure du Projet

```
src/
├── app/                    # Next.js App Router
│   ├── api/               # Endpoints API
│   │   ├── auth/          # Authentification
│   │   ├── uploads/       # Gestion des uploads
│   │   ├── validations/   # Gestion des validations
│   │   └── rules/         # Gestion des règles RDG
│   ├── page.tsx           # Page d'accueil
│   ├── layout.tsx         # Layout principal
│   └── globals.css        # Styles globaux
├── db/                     # Base de données
│   ├── schema.ts          # Schéma Drizzle
│   ├── index.ts           # Connexion DB
│   └── migrations/        # Migrations
├── services/              # Logique métier
│   ├── userService.ts
│   ├── uploadService.ts
│   ├── validationService.ts
│   └── rdgService.ts
├── lib/                   # Utilitaires
│   ├── auth.ts           # Authentification
│   └── utils.ts          # Fonctions utilitaires
├── middleware/            # Middlewares
│   └── auth.ts           # Middleware d'authentification
└── types/                # Types TypeScript
    └── index.ts          # Définitions de types
```

## 🚀 Installation

### Prérequis

- Node.js 18+
- pnpm
- MySQL 8+

### Étapes

1. **Cloner le repository**
   ```bash
   git clone https://github.com/wbarouni/Regalica_IDC.git
   cd Regalica_IDC
   ```

2. **Installer les dépendances**
   ```bash
   pnpm install
   ```

3. **Configurer les variables d'environnement**
   ```bash
   cp .env.local.example .env.local
   ```
   
   Éditer `.env.local` avec vos paramètres:
   ```env
   DATABASE_URL="mysql://root:password@localhost:3306/regalica_idc"
   GEMINI_API_KEY="your-api-key"
   JWT_SECRET="your-secret-key"
   ```

4. **Créer la base de données**
   ```bash
   mysql -u root -p -e "CREATE DATABASE regalica_idc;"
   ```

5. **Générer et appliquer les migrations**
   ```bash
   pnpm db:generate
   pnpm db:push
   ```

6. **Démarrer le serveur de développement**
   ```bash
   pnpm dev
   ```

   L'application sera disponible sur `http://localhost:3000`

## 📚 API Documentation

### Authentification

#### Inscription
```http
POST /api/auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123",
  "firstName": "John",
  "lastName": "Doe",
  "organization": "Bank XYZ"
}
```

#### Connexion
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123"
}
```

### Utilisateurs

#### Récupérer le profil
```http
GET /api/users/me
Authorization: Bearer <token>
```

### Uploads

#### Uploader un fichier
```http
POST /api/uploads
Authorization: Bearer <token>
Content-Type: multipart/form-data

file: <xml-file>
```

#### Récupérer les uploads
```http
GET /api/uploads?page=1&pageSize=10
Authorization: Bearer <token>
```

### Validations

#### Récupérer les validations
```http
GET /api/validations?page=1&pageSize=10
Authorization: Bearer <token>
```

#### Récupérer une validation détaillée
```http
GET /api/validations/:id
Authorization: Bearer <token>
```

### Règles RDG

#### Récupérer les règles
```http
GET /api/rules?page=1&pageSize=50&active=true
Authorization: Bearer <token>
```

## 🔐 Sécurité

- Authentification JWT
- Hachage des mots de passe avec bcrypt
- Validation des entrées
- CORS configuré
- Logs d'audit complets
- Vérification des rôles et permissions

## 📊 Modèle de Données

### Utilisateurs
- Gestion complète des utilisateurs
- Rôles: admin, validator, analyst, viewer
- Authentification sécurisée

### Uploads
- Gestion des fichiers uploadés
- Suivi du statut (pending, processing, completed, failed)
- Stockage des chemins de fichiers

### Validations
- Suivi des validations
- Statistiques (règles passées/échouées/en attente)
- Taux de succès calculé

### Résultats des Règles
- Résultats détaillés pour chaque règle RDG
- Valeurs attendues vs calculées
- Messages d'erreur et détails

### Données Bancaires
- Stockage des données parsées
- Support de multiples formats d'annexes
- Traçabilité complète

## 🧪 Tests

```bash
# Tests unitaires
pnpm test

# Tests d'intégration
pnpm test:integration

# Coverage
pnpm test:coverage
```

## 📝 Commits

Suivre le format de commits conventionnels:

- `feat:` Nouvelle fonctionnalité
- `fix:` Correction de bug
- `refactor:` Refactorisation
- `docs:` Documentation
- `test:` Tests
- `chore:` Maintenance

Exemple:
```bash
git commit -m "feat: ajouter validation annexe 620"
```

## 🤝 Contribution

Les contributions sont bienvenues! Veuillez:

1. Fork le repository
2. Créer une branche (`git checkout -b feature/amazing-feature`)
3. Commiter vos changements (`git commit -m 'feat: add amazing feature'`)
4. Pousser vers la branche (`git push origin feature/amazing-feature`)
5. Ouvrir une Pull Request

## 📄 Licence

Ce projet est propriétaire et confidentiel.

## 📞 Support

Pour toute question ou support, veuillez contacter l'équipe Regalica.

---

**Regalica IDC** - Plateforme de validation de reportings bancaires BCT
