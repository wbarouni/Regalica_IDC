# Tier 1 — G1 PII Audit

**Date :** 2026-04-28
**Auteur :** ALGORIA Factory
**Périmètre :** colonnes sensibles dans le schéma PostgreSQL REGFlow (apps/api/migrations/)

## Extensions de chiffrement

`pgcrypto` : activé dans `001_extensions.sql:8` (`CREATE EXTENSION IF NOT EXISTS pgcrypto`). Disponible pour usage futur (`pgp_sym_encrypt`, `gen_random_bytes`, HMAC). Aucun amendment supplémentaire requis.

## Colonnes auditées

### users.email

- **Migration :** `004_users_roles.sql:14`
- **Type :** `CITEXT NOT NULL` avec contrainte `UNIQUE (tenant_id, email)` (`004_users_roles.sql:31`)
- **Décision :** non chiffré.
- **Justification technique :**
  - Le chiffrement symétrique (`pgp_sym_encrypt`) avec IV aléatoire produit un ciphertext différent à chaque insertion → casse le `UNIQUE` et le lookup de connexion.
  - Le chiffrement déterministe (IV fixe) restaure l'égalité mais ouvre une attaque par analyse de patterns sur l'email-set du tenant — non acceptable.
  - HMAC searchable + ciphertext = double colonne (`email_hmac` indexable + `email_ciphertext` opaque) + révision RLS complète + adaptation des routes login → ~150 lignes SQL et plusieurs amendments dédiés. Hors scope Phase 3-bis.
- **Protection actuelle :**
  - RLS `FORCE` isolant par tenant (Document 6 §22.1).
  - Accès restreint au rôle `regflow_app` (migration 036).
  - Audit trigger sur toute modification (`audit_log` partitioné, immuable, Document 6 §22.5).
- **TODO(@wbarouni) :** évaluer le pattern HMAC+ciphertext si une exigence réglementaire BCT, ANSI ou ISIE explicite l'impose.

### sessions.token_hash

- **Migration :** `004_users_roles.sql:76`
- **Type :** `VARCHAR(64) NOT NULL` avec contrainte `UNIQUE (token_hash)` (`004_users_roles.sql:83`)
- **Décision :** non chiffré.
- **Justification :** la colonne stocke le SHA-256 (64 caractères hex) du token de session. Le token clair est généré par `gen_random_bytes` côté API, transmis au client via cookie sécurisé, mais n'est jamais persisté en base. Un hash unidirectionnel n'est pas réversible — le chiffrer n'apporte aucun gain de sécurité supplémentaire.

### messages.content_markdown

- **Migration :** `032_messages.sql:18`
- **Type :** `TEXT NOT NULL`
- **Décision :** non chiffré en Phase 3-bis.
- **Justification :** contenu conversationnel utilisateur ↔ Regalica. Pas de PII direct (pas d'email, pas de numéro de pièce d'identité). RLS isole par tenant + user_id (Document 6 §22).
- **TODO(@wbarouni) :** évaluer chiffrement colonne si la conformité ISIE ou un avis CNDP qualifie le contenu conversationnel comme sensible.

### messages.content_json

- **Migration :** `032_messages.sql:19`
- **Type :** `JSONB`
- **Décision :** non chiffré.
- **Justification :** structure auxiliaire du message (suggested_actions, blocs typés). Même classification que `content_markdown`.

### messages.attachments

- **Migration :** `032_messages.sql:20`
- **Type :** `JSONB`
- **Décision :** non chiffré.
- **Justification :** métadonnées des pièces jointes (nom de fichier, type MIME, taille). Le contenu binaire des fichiers n'est pas stocké dans cette colonne. Si le stockage de fichiers chiffrés devient nécessaire, il s'appliquera au stockage objet, pas à cette colonne JSONB.

### messages.thinking_trace

- **Migration :** `032_messages.sql:25`
- **Type :** `JSONB`
- **Décision :** non chiffré.
- **Justification :** trace de raisonnement interne de Regalica (« L'utilisateur demande … . Mais je pense … . Donc je vais … . »). Métadonnées IA, pas de données personnelles.

### messages.citations

- **Migration :** `032_messages.sql:26`
- **Type :** `JSONB`
- **Décision :** non chiffré.
- **Justification :** citations réglementaires `[Circulaire BCT YYYY-NN article N §P]` produites par les agents Citation. Données réglementaires publiques.

### audit_log.old_value / audit_log.new_value

- **Migration :** `005_audit_log.sql:24-25`
- **Type :** `JSONB` (deux colonnes)
- **Décision :** non chiffré.
- **Justification :** logs d'audit immuables. Doivent rester lisibles et inspectables par le DPO et le contrôle interne pour conformité (Document 6 §22.5). Le chiffrement compromettrait la fonction d'audit.

### rag_chunks.content

- **Migration :** `034_rag_chunks.sql:25`
- **Type :** `TEXT NOT NULL`
- **Décision :** non chiffré.
- **Justification :** texte d'une circulaire BCT ingérée pour le RAG. Source publique réglementaire, indexée par embedding pgvector et trigram (`gin_trgm_ops`). Le chiffrement casserait l'indexation par similarité.

## Verdict G1

- pgcrypto activé : **[OK]**
- `sessions.token_hash` sécurisé par SHA-256 unidirectionnel : **[OK]**
- `users.email` protégé par RLS + audit trigger ; chiffrement différé avec justification technique : **[OK]**
- `messages.*`, `audit_log.*`, `rag_chunks.content` documentés ; non-chiffrement justifié par les cas d'usage (RLS, audit, indexation RAG) : **[OK]**

Périmètre G1 clos pour Phase 3-bis. Prochaine révision : avant Phase 6 (validation formelle sécurité, revue ANSI/CNDP).
