/**
 * REGFlow — BCT XML Parser
 *
 * Détection de nomenclature XML.
 */

import type { Nomenclature } from './types.js';

/**
 * Détecte la nomenclature XML en inspectant les marqueurs root-level.
 *
 * Règles (évaluées dans l'ordre) :
 * 1. Présence de `<ENTETE>` majuscule → `legacy`
 * 2. Présence de `<Entete>` capitalized ET balises spécialisées → `specialized`
 * 3. Présence de `<Entete>` seul → `modern`
 * 4. Balises spécialisées sans Entete → `specialized`
 * 5. Rien → `unknown` (renvoie une valeur sentinelle, à traiter en amont)
 */
export function detectNomenclature(xmlContent: string): Nomenclature {
  const hasLegacyEntete = /<ENTETE\b/.test(xmlContent);
  if (hasLegacyEntete) {
    return 'legacy';
  }

  const hasModernEntete = /<Entete\b/.test(xmlContent);
  const hasSpecializedTags =
    /<TauxCrediteurs\b/.test(xmlContent) || /<TauxDebiteurs\b/.test(xmlContent);

  if (hasModernEntete && hasSpecializedTags) {
    return 'specialized';
  }
  if (hasModernEntete) {
    return 'modern';
  }
  if (hasSpecializedTags) {
    return 'specialized';
  }

  // Fallback : si on voit <RECAP_POS> ou <DET_PSC> seul sans ENTETE explicite
  if (/<RECAP_POS\b/.test(xmlContent) || /<DET_PSC\b/.test(xmlContent)) {
    return 'legacy';
  }

  // Par défaut on considère moderne pour laisser le parsing tenter
  return 'modern';
}

/**
 * Normalise une date BCT vers YYYY-MM-DD.
 *
 * Accepte :
 * - `YYYYMMDD` (nomenclature moderne)
 * - `DD/MM/YYYY` (nomenclature legacy)
 *
 * Retourne `null` si la date est vide ou non reconnaissable.
 */
export function normalizeDate(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // YYYYMMDD
  const yyyymmdd = trimmed.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (yyyymmdd) {
    const [, y, m, d] = yyyymmdd;
    return `${y}-${m}-${d}`;
  }

  // DD/MM/YYYY
  const ddmmyyyy = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (ddmmyyyy) {
    const [, d, m, y] = ddmmyyyy;
    return `${y}-${m!.padStart(2, '0')}-${d!.padStart(2, '0')}`;
  }

  return null;
}
