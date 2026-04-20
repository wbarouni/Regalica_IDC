/**
 * Prompts Registry Seeder
 *
 * Seeds the `prompts_registry` table with Regalica's default AI voice prompts.
 * All prompts use tenant_id = NULL (global defaults, inherited by all tenants).
 *
 * Safe to re-run: uses ON CONFLICT DO NOTHING on (tenant_id, key, locale, version).
 *
 * CLI script — console.log is intentional (not prod code, CLAUDE.md exemption).
 *
 * Run from project root:
 *   npx tsx apps/api/src/db/seeders/prompts-seed.ts
 */

import 'dotenv/config';
import { sequelize } from '../sequelize';

// ─── Prompt definitions ───────────────────────────────────────────────────────

interface PromptEntry {
  key: string;
  locale: string;
  version: number;
  content: string;
  variables: string[];
}

const PROMPTS: PromptEntry[] = [
  {
    key: 'regalica.opening',
    locale: 'fr',
    version: 1,
    content: `Bonjour, je suis **Regalica**, votre co-pilote de conformité BCT.

Mon cadre de travail :
→ Je ne calcule jamais sans citation vérifiable
→ Je ne valide jamais sans preuve traçable
→ Je ne décide jamais à votre place

Déposez vos fichiers XML d'annexes dans le panneau de gauche pour que j'analyse leur conformité aux 4 611 règles RDG. Je vous fournirai un rapport détaillé avec les écarts détectés, leur cause racine, et les corrections recommandées.

Sur quoi travaillons-nous ?`,
    variables: [],
  },
  {
    key: 'regalica.analysis_start',
    locale: 'fr',
    version: 1,
    content: `Analyse en cours pour **{{count}}** fichier(s)… Validation structure + {{rules_count}} règles RDG applicables.`,
    variables: ['count', 'rules_count'],
  },
  {
    key: 'regalica.analysis_fail',
    locale: 'fr',
    version: 1,
    content: `Analyse terminée. J'ai détecté **{{fail_count}} écart(s) réglementaire(s) SEVERE** dans vos annexes.

La rubrique **{{rubrique}}** ({{domaine}}, annexe {{annexe_code}}) présente un écart de **{{gap}} TND** — exactement le type d'incohérence inter-annexe qui peut déclencher une observation BCT.

Souhaitez-vous que j'effectue une analyse approfondie de ces FAIL ?`,
    variables: ['fail_count', 'rubrique', 'domaine', 'annexe_code', 'gap'],
  },
  {
    key: 'regalica.analysis_pass',
    locale: 'fr',
    version: 1,
    content: `✓ Toutes les annexes sont conformes — aucun écart réglementaire détecté. Score global : **{{score}}%**.

Vous pouvez procéder à la signature et au dépôt BCT.`,
    variables: ['score'],
  },
  {
    key: 'regalica.error_api',
    locale: 'fr',
    version: 1,
    content: `Erreur lors de la connexion à l'API. Vérifiez que le serveur est démarré sur le port 3000.`,
    variables: [],
  },
  {
    key: 'regalica.faq_fail_investigation',
    locale: 'fr',
    version: 1,
    content: `La rubrique **{{rubrique}}** correspond à la ventilation sectorielle des ressources clientèle.

L'écart de **{{gap}} TND** signifie que la somme déclarée diffère de la valeur attendue calculée à partir des annexes croisées.

**Correction suggérée :** Vérifiez la ligne {{rubrique}} dans votre fichier XML — la valeur doit respecter l'équation définie par la règle {{annexe_code}}/{{num_regle}}.

*Pilier 4 — Suggest Don't Repair : c'est vous qui effectuez la correction dans votre XML.*`,
    variables: ['rubrique', 'gap', 'annexe_code', 'num_regle'],
  },
  {
    key: 'regalica.faq_score',
    locale: 'fr',
    version: 1,
    content: `Le score de conformité est calculé comme : **PASS / (PASS + FAIL) × 100**.

Avec {{pass_count}} règles satisfaites et {{fail_count}} écarts, vous atteignez **{{score}}%**.`,
    variables: ['pass_count', 'fail_count', 'score'],
  },
  {
    key: 'regalica.faq_rdg',
    locale: 'fr',
    version: 1,
    content: `Le RDG (Recueil de Déclarations et de Gestion) contient **4 611 règles** réparties sur **52 annexes**. Chaque règle définit une contrainte mathématique entre rubriques déclarées.

Pour vos annexes déposées, **{{applicable_count}} règles sont applicables**.`,
    variables: ['applicable_count'],
  },
  {
    key: 'regalica.faq_default',
    locale: 'fr',
    version: 1,
    content: `Je suis à votre disposition pour analyser vos rapports BCT, expliquer les écarts détectés, ou répondre à toute question sur les règles RDG.

N'hésitez pas à me poser une question précise sur un FAIL, une rubrique, ou une circulaire BCT.`,
    variables: [],
  },
];

// ─── Seeder logic ─────────────────────────────────────────────────────────────

async function seed(): Promise<void> {
  await sequelize.authenticate();
  console.log('[prompts-seed] Database connection established.');
  console.log(`[prompts-seed] Seeding ${PROMPTS.length} prompt(s)…`);

  let inserted = 0;
  let skipped = 0;

  for (const prompt of PROMPTS) {
    const variablesJson = JSON.stringify(prompt.variables);

    // tenant_id = NULL means global default (inherited by all tenants)
    // The UNIQUE constraint is on (tenant_id, key, locale, version);
    // NULL values are treated as distinct in most DBs, but our constraint
    // uses NULLS NOT DISTINCT (PostgreSQL 15+) or we rely on DO NOTHING
    // with a partial unique index. We use a safe WHERE-based approach.
    const [, meta] = await sequelize.query(
      `
      INSERT INTO prompts_registry (tenant_id, key, locale, version, content, variables, is_active)
      VALUES (NULL, :key, :locale, :version, :content, :variables::jsonb, TRUE)
      ON CONFLICT (tenant_id, key, locale, version) DO NOTHING;
      `,
      {
        replacements: {
          key: prompt.key,
          locale: prompt.locale,
          version: prompt.version,
          content: prompt.content,
          variables: variablesJson,
        },
        type: 'INSERT' as any,
      },
    );

    // meta.rowCount is the number of rows affected (0 = conflict / skipped)
    const rowCount = (meta as any)?.rowCount ?? (meta as any)?.affectedRows ?? 0;
    if (rowCount > 0) {
      inserted += 1;
      console.log(`[prompts-seed]   ✓ inserted  ${prompt.key} [${prompt.locale}]`);
    } else {
      skipped += 1;
      console.log(`[prompts-seed]   – skipped   ${prompt.key} [${prompt.locale}] (already exists)`);
    }
  }

  console.log('');
  console.log('╔══════════════════════════════════════╗');
  console.log('║       Prompts Seeder — Done          ║');
  console.log('╠══════════════════════════════════════╣');
  console.log(`║  Inserted : ${String(inserted).padEnd(25)}║`);
  console.log(`║  Skipped  : ${String(skipped).padEnd(25)}║`);
  console.log('╚══════════════════════════════════════╝');
}

// ─── Entry point ──────────────────────────────────────────────────────────────

seed()
  .then(() => {
    process.exit(0);
  })
  .catch((err: unknown) => {
    console.error('[prompts-seed] Fatal error:', err);
    process.exit(1);
  });
