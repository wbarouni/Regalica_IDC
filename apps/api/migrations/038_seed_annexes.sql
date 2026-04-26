-- Migration 038_seed_annexes.sql
-- Object: seed 52 BCT annexes from apps/api/seeds/referentials_annexes.json
-- Author: ALGORIA Factory
-- Date: 2026-04-26
-- Depends on: 008_referentials_annexes.sql, 003_tenants.sql, 004_users_roles.sql
-- References: Document 6 §9.1 (annexes referential)
--
-- Source data: tests/fixtures/rdg.xlsx via tools/ingest-rdg-xlsx/ingest.py.
-- Each row inserted with status='draft' — promotion to 'active' must
-- go through the 4-eyes governance flow (validator distinct from author,
-- per ck_four_eyes constraint).
--
-- Required session vars (set by the operator or test harness BEFORE
-- applying this migration):
--   app.seed_tenant_id        — UUID of the target tenant
--   app.seed_author_user_id   — UUID of the seeding user (author)
--   app.seed_valid_from       — TIMESTAMPTZ of bitemporal validity start
--
-- ON CONFLICT (tenant_id, code, valid_from) DO NOTHING — idempotent.

DO $$
DECLARE
  v_tenant_id  UUID;
  v_author_id  UUID;
  v_valid_from TIMESTAMPTZ;
  v_data       JSONB;
BEGIN
  v_tenant_id  := current_setting('app.seed_tenant_id')::UUID;
  v_author_id  := current_setting('app.seed_author_user_id')::UUID;
  v_valid_from := current_setting('app.seed_valid_from')::TIMESTAMPTZ;

  v_data := $SEED_DATA$
[
  {
    "code": "00",
    "label": "Situation Mensuelle Comptable-Bilan",
    "domain": "1- REPORTING COMPTABLE",
    "periodicity": null,
    "reporting_deadline_days": null,
    "xml_structure_type": null,
    "has_detail_sentinel": null
  },
  {
    "code": "01",
    "label": "Situation Mensuelle Comptable-Hors Bilan",
    "domain": "1- REPORTING COMPTABLE",
    "periodicity": null,
    "reporting_deadline_days": null,
    "xml_structure_type": null,
    "has_detail_sentinel": null
  },
  {
    "code": "100",
    "label": "Expositions Intra-Groupe (Entre la banque ou l'établissement financier  et les sociétés faisant partie de son périmètre de consolidation comptable)",
    "domain": "4- REPORTING SUR BASE CONSOLIDEE",
    "periodicity": null,
    "reporting_deadline_days": null,
    "xml_structure_type": null,
    "has_detail_sentinel": null
  },
  {
    "code": "110",
    "label": "Périmètre de Consolidation",
    "domain": "4- REPORTING SUR BASE CONSOLIDEE",
    "periodicity": null,
    "reporting_deadline_days": null,
    "xml_structure_type": null,
    "has_detail_sentinel": null
  },
  {
    "code": "130",
    "label": "TABLEAU 1- CALCUL DES FONDS PROPRES",
    "domain": "SD 5- RESPECT DES NORMES LEGALES ET PRUDENTIELLES",
    "periodicity": null,
    "reporting_deadline_days": null,
    "xml_structure_type": null,
    "has_detail_sentinel": null
  },
  {
    "code": "131",
    "label": "TABLEAU 2- CALCUL DU RATIO DE SOLVABILITE",
    "domain": "SD 5- RESPECT DES NORMES LEGALES ET PRUDENTIELLES",
    "periodicity": null,
    "reporting_deadline_days": null,
    "xml_structure_type": null,
    "has_detail_sentinel": null
  },
  {
    "code": "132",
    "label": "Tableau 3: Risque de crédit",
    "domain": "SD 5- RESPECT DES NORMES LEGALES ET PRUDENTIELLES",
    "periodicity": null,
    "reporting_deadline_days": null,
    "xml_structure_type": null,
    "has_detail_sentinel": null
  },
  {
    "code": "133",
    "label": "Tableau 4: Calcul des risques de contrepartie sur les instruments dérivés",
    "domain": "SD 5- RESPECT DES NORMES LEGALES ET PRUDENTIELLES",
    "periodicity": null,
    "reporting_deadline_days": null,
    "xml_structure_type": null,
    "has_detail_sentinel": null
  },
  {
    "code": "134",
    "label": "Tableau 5: Risques opérationnels",
    "domain": "SD 5- RESPECT DES NORMES LEGALES ET PRUDENTIELLES",
    "periodicity": null,
    "reporting_deadline_days": null,
    "xml_structure_type": null,
    "has_detail_sentinel": null
  },
  {
    "code": "135",
    "label": "Tableau 6: Risques de marché",
    "domain": "SD 5- RESPECT DES NORMES LEGALES ET PRUDENTIELLES",
    "periodicity": null,
    "reporting_deadline_days": null,
    "xml_structure_type": null,
    "has_detail_sentinel": null
  },
  {
    "code": "136",
    "label": "Tableau 6-1 Exigences en fonds propres au titre du risque spécifique de taux d'intérêt",
    "domain": "SD 5- RESPECT DES NORMES LEGALES ET PRUDENTIELLES",
    "periodicity": null,
    "reporting_deadline_days": null,
    "xml_structure_type": null,
    "has_detail_sentinel": null
  },
  {
    "code": "137",
    "label": "Tableau 6-2 Exigences en fonds propres au titre du risque général de taux d'intérêt",
    "domain": "SD 5- RESPECT DES NORMES LEGALES ET PRUDENTIELLES",
    "periodicity": null,
    "reporting_deadline_days": null,
    "xml_structure_type": null,
    "has_detail_sentinel": null
  },
  {
    "code": "138",
    "label": "Tabelau 6-3 Exigences en fonds propres au titre du risque spécifique et général sur titres de propriété par marché",
    "domain": "SD 5- RESPECT DES NORMES LEGALES ET PRUDENTIELLES",
    "periodicity": null,
    "reporting_deadline_days": null,
    "xml_structure_type": null,
    "has_detail_sentinel": null
  },
  {
    "code": "139",
    "label": "Tableau 6-4 Exigences en fonds propres au titre du risque de change",
    "domain": "SD 5- RESPECT DES NORMES LEGALES ET PRUDENTIELLES",
    "periodicity": null,
    "reporting_deadline_days": null,
    "xml_structure_type": null,
    "has_detail_sentinel": null
  },
  {
    "code": "140",
    "label": "Tableau 6-5 Calcul du risque de réglement-livraison",
    "domain": "SD 5- RESPECT DES NORMES LEGALES ET PRUDENTIELLES",
    "periodicity": null,
    "reporting_deadline_days": null,
    "xml_structure_type": null,
    "has_detail_sentinel": null
  },
  {
    "code": "141",
    "label": "Tableau 6-5 (b) Calcul du risque de réglement-livraison (Situation prévue par l'article 46)",
    "domain": "SD 5- RESPECT DES NORMES LEGALES ET PRUDENTIELLES",
    "periodicity": null,
    "reporting_deadline_days": null,
    "xml_structure_type": null,
    "has_detail_sentinel": null
  },
  {
    "code": "142",
    "label": "Tableau 7 : CONVERSION DE L’EXIGENCE EN FONDS PROPRES AU TITRE DU RISQUE GENERAL DE TAUX D’INTERET",
    "domain": "SD 5- RESPECT DES NORMES LEGALES ET PRUDENTIELLES",
    "periodicity": null,
    "reporting_deadline_days": null,
    "xml_structure_type": null,
    "has_detail_sentinel": null
  },
  {
    "code": "210",
    "label": "Structure du Capital",
    "domain": "SD 1 : GOUVERNANCE",
    "periodicity": null,
    "reporting_deadline_days": null,
    "xml_structure_type": null,
    "has_detail_sentinel": null
  },
  {
    "code": "220",
    "label": "Renseignements sur les Structures de Gouvernance",
    "domain": "SD 1 : GOUVERNANCE",
    "periodicity": null,
    "reporting_deadline_days": null,
    "xml_structure_type": null,
    "has_detail_sentinel": null
  },
  {
    "code": "250",
    "label": "Concours Accordés  Aux Personnes Ayant des Liens Avec L'Etablissement Au Sens de l'Article 43 de la Loi n° 2016-48",
    "domain": "SD 1 : GOUVERNANCE",
    "periodicity": null,
    "reporting_deadline_days": null,
    "xml_structure_type": null,
    "has_detail_sentinel": null
  },
  {
    "code": "310",
    "label": "Statistiques sur les déclarations de Soupçons (Annexe 5 à la Circulaire n°2017-08)",
    "domain": "SD 5: LBA/FT",
    "periodicity": null,
    "reporting_deadline_days": null,
    "xml_structure_type": null,
    "has_detail_sentinel": null
  },
  {
    "code": "360",
    "label": "Statistiques relatives aux incidents et pertes liés au risque opérationnel",
    "domain": "SD 4- RISQUE OPERATIONNEL",
    "periodicity": null,
    "reporting_deadline_days": null,
    "xml_structure_type": null,
    "has_detail_sentinel": null
  },
  {
    "code": "47",
    "label": "Ratio de Liquidité (circulaire n° 2014-14)",
    "domain": "SD 2- RISQUE DE LIQUIDITE",
    "periodicity": null,
    "reporting_deadline_days": null,
    "xml_structure_type": null,
    "has_detail_sentinel": null
  },
  {
    "code": "480",
    "label": "Etat Nominatif de l'Evaluation des Actifs et de la Couverture des Risques",
    "domain": "SD 1- RISQUE DE CREDIT",
    "periodicity": null,
    "reporting_deadline_days": null,
    "xml_structure_type": null,
    "has_detail_sentinel": null
  },
  {
    "code": "481",
    "label": "Ventilation des Engagements par Classe de Risque et leur Couverture",
    "domain": "SD 1- RISQUE DE CREDIT",
    "periodicity": null,
    "reporting_deadline_days": null,
    "xml_structure_type": null,
    "has_detail_sentinel": null
  },
  {
    "code": "482",
    "label": "Ventilation des Engagements par Classe de Risque et par Secteur d'Activité",
    "domain": "SD 1- RISQUE DE CREDIT",
    "periodicity": null,
    "reporting_deadline_days": null,
    "xml_structure_type": null,
    "has_detail_sentinel": null
  },
  {
    "code": "483",
    "label": "Couverture des Actifs ayant une Ancienneté dans la Classe 4 Supérieure ou Egale à 3 ANS",
    "domain": "SD 1- RISQUE DE CREDIT",
    "periodicity": null,
    "reporting_deadline_days": null,
    "xml_structure_type": null,
    "has_detail_sentinel": null
  },
  {
    "code": "484",
    "label": "Etat de Détermination de la Provision Collective",
    "domain": "SD 1- RISQUE DE CREDIT",
    "periodicity": null,
    "reporting_deadline_days": null,
    "xml_structure_type": null,
    "has_detail_sentinel": null
  },
  {
    "code": "485",
    "label": "Etat de Migration des Engagements Par Classe de Risque",
    "domain": "SD 1- RISQUE DE CREDIT",
    "periodicity": null,
    "reporting_deadline_days": null,
    "xml_structure_type": null,
    "has_detail_sentinel": null
  },
  {
    "code": "51",
    "label": "Etat de Résultat",
    "domain": "1- REPORTING COMPTABLE",
    "periodicity": null,
    "reporting_deadline_days": null,
    "xml_structure_type": null,
    "has_detail_sentinel": null
  },
  {
    "code": "510",
    "label": "Ventilation des Actifs et des Passifs en Dinar par Durée Résiduelle",
    "domain": "SD 2- RISQUE DE LIQUIDITE",
    "periodicity": null,
    "reporting_deadline_days": null,
    "xml_structure_type": null,
    "has_detail_sentinel": null
  },
  {
    "code": "520",
    "label": "Ventilation des Actifs et des Passifs en Dollar Américain Par Maturité Résiduelle",
    "domain": "SD 2- RISQUE DE LIQUIDITE",
    "periodicity": null,
    "reporting_deadline_days": null,
    "xml_structure_type": null,
    "has_detail_sentinel": null
  },
  {
    "code": "530",
    "label": "Ventilation des Actifs et des Passifs en Euro Par Maturité Résiduelle",
    "domain": "SD 2- RISQUE DE LIQUIDITE",
    "periodicity": null,
    "reporting_deadline_days": null,
    "xml_structure_type": null,
    "has_detail_sentinel": null
  },
  {
    "code": "540",
    "label": "Concentration Sur les  50 Premiers Déposants en dinar",
    "domain": "SD 2- RISQUE DE LIQUIDITE",
    "periodicity": null,
    "reporting_deadline_days": null,
    "xml_structure_type": null,
    "has_detail_sentinel": null
  },
  {
    "code": "550",
    "label": "Concentration sur les 50 Premiers Déposants Toutes Devises Confondues",
    "domain": "SD 2- RISQUE DE LIQUIDITE",
    "periodicity": null,
    "reporting_deadline_days": null,
    "xml_structure_type": null,
    "has_detail_sentinel": null
  },
  {
    "code": "560",
    "label": "Ratio Crédits / Dépôts (Circulaire n°2018-10)",
    "domain": "SD 2- RISQUE DE LIQUIDITE",
    "periodicity": null,
    "reporting_deadline_days": null,
    "xml_structure_type": null,
    "has_detail_sentinel": null
  },
  {
    "code": "620",
    "label": "Etat Récapitulatif du Portefeuille-Titres (Hors Titres de l'Etat)",
    "domain": "2- REPORTING « STATISTIQUES MONETAIRES ET FINANCIERES »",
    "periodicity": null,
    "reporting_deadline_days": null,
    "xml_structure_type": null,
    "has_detail_sentinel": null
  },
  {
    "code": "630",
    "label": "Ventilation des Ressources Collectées par Secteur Institutionnel",
    "domain": "2- REPORTING « STATISTIQUES MONETAIRES ET FINANCIERES »",
    "periodicity": null,
    "reporting_deadline_days": null,
    "xml_structure_type": null,
    "has_detail_sentinel": null
  },
  {
    "code": "640",
    "label": "Ventilation des Créances Sur la Clientèle par Secteur Institutionnel",
    "domain": "2- REPORTING « STATISTIQUES MONETAIRES ET FINANCIERES »",
    "periodicity": null,
    "reporting_deadline_days": null,
    "xml_structure_type": null,
    "has_detail_sentinel": null
  },
  {
    "code": "720",
    "label": "Informations Générales",
    "domain": "6- REPORTING D'ORDRE GENERAL",
    "periodicity": null,
    "reporting_deadline_days": null,
    "xml_structure_type": null,
    "has_detail_sentinel": null
  },
  {
    "code": "730",
    "label": "Renseignements sur l'Activité des Agences",
    "domain": "6- REPORTING D'ORDRE GENERAL",
    "periodicity": null,
    "reporting_deadline_days": null,
    "xml_structure_type": null,
    "has_detail_sentinel": null
  },
  {
    "code": "740",
    "label": "Renseignements sur l'Activité de Leasing",
    "domain": "6- REPORTING D'ORDRE GENERAL",
    "periodicity": null,
    "reporting_deadline_days": null,
    "xml_structure_type": null,
    "has_detail_sentinel": null
  },
  {
    "code": "750",
    "label": "Renseignements sur l'Activité de Factoring",
    "domain": "6- REPORTING D'ORDRE GENERAL",
    "periodicity": null,
    "reporting_deadline_days": null,
    "xml_structure_type": null,
    "has_detail_sentinel": null
  },
  {
    "code": "760",
    "label": "Etat annuel des réclamations reçues par les établissements",
    "domain": "6- REPORTING D'ORDRE GENERAL",
    "periodicity": null,
    "reporting_deadline_days": null,
    "xml_structure_type": null,
    "has_detail_sentinel": null
  },
  {
    "code": "820",
    "label": "Etat Récapitulatif du Respect des Normes de Concentration, de Division des Risques et d'Exposition sur les Parties liées",
    "domain": "SD 5- RESPECT DES NORMES LEGALES ET PRUDENTIELLES",
    "periodicity": null,
    "reporting_deadline_days": null,
    "xml_structure_type": null,
    "has_detail_sentinel": null
  },
  {
    "code": "830",
    "label": "Liste des Bénéficiaires dont les Risques Encourus Dépassent 25% des Fonds Propres Nets",
    "domain": "SD 5- RESPECT DES NORMES LEGALES ET PRUDENTIELLES",
    "periodicity": null,
    "reporting_deadline_days": null,
    "xml_structure_type": null,
    "has_detail_sentinel": null
  },
  {
    "code": "840",
    "label": "Liste des Bénéficiaires dont les Risques Encourus sont supérieurs ou égaux chacun à 5% des Fonds Propres Nets",
    "domain": "SD 5- RESPECT DES NORMES LEGALES ET PRUDENTIELLES",
    "periodicity": null,
    "reporting_deadline_days": null,
    "xml_structure_type": null,
    "has_detail_sentinel": null
  },
  {
    "code": "850",
    "label": "Liste des Bénéficiaires dont les Risques Encourus sont supérieurs ou égaux chacun à 15% des Fonds Propres Nets",
    "domain": "SD 5- RESPECT DES NORMES LEGALES ET PRUDENTIELLES",
    "periodicity": null,
    "reporting_deadline_days": null,
    "xml_structure_type": null,
    "has_detail_sentinel": null
  },
  {
    "code": "860",
    "label": "Etat des Risques Encourus sur les Personnes ayant des liens avec l'Etablissement au sens de l'article 43 de la loi n°2016-48",
    "domain": "SD 5- RESPECT DES NORMES LEGALES ET PRUDENTIELLES",
    "periodicity": null,
    "reporting_deadline_days": null,
    "xml_structure_type": null,
    "has_detail_sentinel": null
  },
  {
    "code": "870",
    "label": "Etat Nominatif des Participations Directes et Indirectes de l'Etablissement",
    "domain": "SD 5- RESPECT DES NORMES LEGALES ET PRUDENTIELLES",
    "periodicity": null,
    "reporting_deadline_days": null,
    "xml_structure_type": null,
    "has_detail_sentinel": null
  },
  {
    "code": "880",
    "label": "Etat Récapitulatif des Normes Légales en Matière de Participation",
    "domain": "SD 5- RESPECT DES NORMES LEGALES ET PRUDENTIELLES",
    "periodicity": null,
    "reporting_deadline_days": null,
    "xml_structure_type": null,
    "has_detail_sentinel": null
  },
  {
    "code": "910",
    "label": "Ventilation des Actifs et des Passifs en Dinar Selon leur Taux et leur Durée Résiduelle",
    "domain": "SD 3- RISQUE DE TAUX",
    "periodicity": null,
    "reporting_deadline_days": null,
    "xml_structure_type": null,
    "has_detail_sentinel": null
  }
]
$SEED_DATA$::JSONB;

  INSERT INTO referentials_annexes (
    id, tenant_id, code, label, domain,
    periodicity, reporting_deadline_days,
    xml_structure_type, has_detail_sentinel,
    valid_from, author_user_id, status,
    created_at, updated_at
  )
  SELECT
    uuidv7(),
    v_tenant_id,
    r->>'code',
    r->>'label',
    r->>'domain',
    NULL,
    NULL,
    NULL,
    FALSE,
    v_valid_from,
    v_author_id,
    'draft',
    NOW(),
    NOW()
  FROM jsonb_array_elements(v_data) AS r
  ON CONFLICT (tenant_id, code, valid_from) DO NOTHING;
END $$;
