# ADR 0006 — Architecture UI : single-page /app avec popups et sheets

- **Status:** Accepted
- **Date:** 2026-04-20
- **Deciders:** CEO (Wissem Barouni), Senior Principal Engineer

## Context

Le prototype Angular (ADR 0001) expose trois routes distinctes :

- `/workspace` — éditeur XML + chatbot
- `/dashboard` — KPIs et métriques BCT
- `/reports` — liste et détail des rapports

Cette structure multi-page produit plusieurs problèmes constatés lors des
tests utilisateurs avec des compliance officers :

1. **Perte de contexte** : naviguer vers `/reports` depuis `/workspace`
   rompt l'état de la session de travail en cours (XML ouvert, conversation
   chatbot active).
2. **Rechargement complet** : chaque changement de route Angular provoque
   un re-render des panneaux communs (Topbar, CommandBar, chatbot).
3. **Deep-linking impossible** : un inspecteur BCT reçoit un lien `/reports`
   mais n'a pas de chemin URL stable vers un rapport spécifique ou une règle.
4. **Surface d'audit trop large** : l'interface de consultation devrait être
   isolée de toute interface de mutation pour des raisons de sécurité et de
   conformité (principe du moindre privilège UI).

Le **v2.0 master spec** mandate une architecture single-page avec navigation
par hash et ouverture des modules secondaires en popups ou sheets.

## Decision

### 1. Structure de page principale : /app

L'application production est une **Single Page Application au chemin `/app`**
avec la disposition suivante :

```
+----------------------------------------------------------+
| Topbar                                        56px chrome |
+----------------------------------------------------------+
| CommandBar (Cmd+K)                            48px chrome |
+----------------------------------------------------------+
| Panel gauche | Panel central  | Panel droit              |
| (Nav/Tree)   | (Workspace)    | (Chatbot/Inspector)      |
|              |                |                          |
| flex-none    | flex-1         | flex-none                |
+----------------------------------------------------------+
```

Sous le fold, le Dashboard KPI est accessible par scroll vertical dans le
panneau central (pas de route séparée).

### 2. Navigation par URL hash

Tous les modules s'ouvrent par manipulation du hash de l'URL. Aucun
rechargement de page. Exemples de hash stables :

| Hash | Module ouvert |
|---|---|
| `#` ou vide | Workspace par défaut |
| `#dashboard` | Dashboard KPI (scroll dans le panneau central) |
| `#reports` | Sheet droite — liste des rapports |
| `#reports/{id}` | Sheet droite — détail d'un rapport |
| `#rules` | Popup — liste des règles RDG |
| `#rules/{id}` | Popup — détail d'une règle |
| `#settings/maintenance` | Popup full — maintenance des paramètres |
| `#settings/users` | Popup lg — gestion des utilisateurs |
| `#settings/tenants` | Popup lg — gestion des tenants |
| `#kb` | Sheet droite — base de connaissances |
| `#upload` | Popup md — upload XML |

Ces hashes sont partageables et bookmarkables. La gestion d'état est dans
l'URL, pas dans un store opaque.

### 3. Catalogue des popups et sheets

Dix surfaces modales sont définies avec des dimensions fixes :

| Surface | Composant | Taille | Déclencheur |
|---|---|---|---|
| Upload XML | Popup | md (560px) | Topbar "Upload" ou drag-drop |
| Détail rapport | Sheet | right-full-height | Clic rapport dans la liste |
| Visualiseur règle | Popup | lg (720px) | Clic règle |
| Éditeur règle | Popup | xl (960px) | "Edit" depuis visualiseur |
| Paramètres maintenance | Popup | full (fullscreen) | Settings > Maintenance |
| Paramètres utilisateurs | Popup | lg (720px) | Settings > Users |
| Paramètres tenants | Popup | lg (720px) | Settings > Tenants |
| Base de connaissances | Sheet | right-full-height | CommandBar ou hash |
| Signature 4-eyes | Popup | md (560px) | Bouton "Valider" rapport |
| Historique audit | Sheet | right-full-height | Icône audit dans Topbar |

Contrainte : **maximum 2 couches de surfaces simultanées** (ex. : une sheet +
un popup au-dessus). Pas de popup dans un popup dans une sheet.

### 4. Exception : /audit-viewer (route dédiée)

Un chemin `/audit-viewer` est maintenu comme **route séparée et isolée**,
accessible uniquement aux auditeurs externes (KPMG, inspecteurs BCT).

Justification en trois points :

**a. Defense in depth — RLS seul ne suffit pas pour la prévention des
mutations.** RLS Supabase garantit que les requêtes SQL d'un rôle
`auditor_ro` ne peuvent que lire. Mais si l'interface de mutation (boutons
"Upload", "Valider", "Éditer règle") est présente dans le DOM, un auditeur
malveillant ou une extension de navigateur compromise peut tenter d'appeler
directement les Server Actions Next.js ou l'API. Une route dédiée garantit
qu'aucun composant de mutation n'est rendu, `bundle`-includé, ni accessible
via le réseau de la session d'audit.

**b. Rôle base de données dédié `auditor_ro`.** La connexion Supabase
effectuée depuis `/audit-viewer` utilise un service role distinct avec
`GRANT SELECT` uniquement sur les vues et tables d'audit. Toute tentative
d'`INSERT`/`UPDATE`/`DELETE` retourne une erreur de permission au niveau
Postgres, indépendamment de la logique applicative.

**c. Session courte + MFA obligatoire.** Les sessions `/audit-viewer` expirent
après **2 heures** (vs 8 heures pour les utilisateurs internes). MFA TOTP est
obligatoire. Le lien d'accès est généré par un compliance officer interne et
expire après 24 h (OTP URL signé).

Fonctionnalités disponibles dans `/audit-viewer` :

- Lecture des rapports validés (PDF + données brutes)
- Lecture de la timeline d'audit (qui a fait quoi, quand)
- Lecture des règles RDG actives au moment du rapport
- Export PDF de la vue courante
- Aucun bouton de création, modification, upload, validation ou administration

### 5. Suppressions du pattern Angular

- Suppression du routeur Angular multi-page (`RouterModule`).
- Suppression des guards Angular par route (`CanActivate`).
- La protection des routes est gérée au niveau Next.js Middleware
  (`middleware.ts`) via la session Supabase Auth.

## Consequences

### Positives

- **Continuité de contexte** : le chatbot, l'arbre de navigation et la session
  XML restent actifs lors de l'ouverture d'un rapport ou d'une règle.
- **Deep-linking stable** : les liens envoyés par email aux équipes BCT pointent
  directement vers l'entité concernée.
- **Sécurité auditeur renforcée** : `/audit-viewer` isole physiquement
  (bundle, DOM, rôle DB) la consultation de la mutation.
- **Performances** : Next.js App Router ne recharge que les segments modifiés ;
  Topbar et CommandBar sont des Server Components stables.
- **UX cohérente** : une seule mental model "je suis dans /app, les modules
  s'ouvrent devant moi" plutôt que "je suis sur 3 pages différentes".

### Negatives

- **Gestion du hash côté client** : le hash n'est pas accessible côté serveur
  dans Next.js. La logique d'ouverture des popups est nécessairement un
  Client Component (`useSearchParams` ou `useHash` custom hook).
- **Accessibilité des modales** : chaque popup/sheet doit implémenter
  `aria-modal`, `focus-trap` et `Escape` pour dismissal — effort non trivial
  pour 10 surfaces.
- **Tests d'intégration plus complexes** : tester les états hash nécessite
  des helpers Playwright spécifiques (`page.goto('/app#rules/42')`).
- **Complexité initiale** : le routeur hash doit être documenté pour que les
  développeurs sachent comment ajouter un nouveau module sans casser le
  pattern.

### Neutres

- Le pattern popup/sheet est cohérent avec les références visuelles retenues
  (Linear, Arc Browser) — cf. ADR 0007.
- La route `/audit-viewer` peut être déployée sur un sous-domaine dédié
  (`audit.regalica.com`) si l'isolement réseau est requis ultérieurement.
