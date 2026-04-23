/**
 * REGFlow — BCT XML Parser
 *
 * Types et interfaces canoniques du parser XML BCT dual-nomenclature.
 */

import type { Decimal } from 'decimal.js';

/**
 * Nomenclatures XML BCT supportées.
 *
 * - `modern` : standard actuel avec <Entete>, <Annexe>, <Rubrique>, <Colonne>.
 * - `legacy` : ancien format avec <ENTETE>, <DATE_DECLAR>, <BQ>, <RECAP_POS> (ex: annexe 810).
 * - `specialized` : formats propres à certaines annexes (ex: 781 taux avec <TauxCrediteurs>).
 */
export type Nomenclature = 'modern' | 'legacy' | 'specialized';

/**
 * Métadonnées d'entête extraites au parsing, indépendamment de la nomenclature.
 */
export interface XmlHeader {
  readonly codeBanque: string;
  readonly dateAnnexe: string; // Toujours au format YYYY-MM-DD
  readonly codeAnnexe: string;
  readonly nomenclature: Nomenclature;
}

/**
 * Matrice de cellules unifiée : Map<codeAnnexe, Map<rubrique, Map<colonne, Decimal>>>.
 *
 * C'est l'interface unique utilisée par le moteur d'évaluation pour accéder aux données
 * d'un batch XML, indépendamment de la nomenclature source.
 *
 * Pour les nomenclatures non tabulaires (legacy 810, specialized 781), le parser mappe
 * les balises métier vers des pseudos rubriques et colonnes via la table de correspondance
 * `referentials_xml_structures`.
 */
export type CellMatrix = ReadonlyMap<
  string, // codeAnnexe
  ReadonlyMap<
    string, // rubrique
    ReadonlyMap<string, Decimal> // colonne -> valeur
  >
>;

/**
 * Résultat complet du parsing d'un XML unique.
 */
export interface ParsedXml {
  readonly header: XmlHeader;
  readonly cells: CellMatrix;
  readonly rawRubriquesCount: number;
  readonly rawValuesCount: number;
  readonly warnings: readonly ParseWarning[];
}

/**
 * Avertissement non-bloquant remonté pendant le parsing.
 */
export interface ParseWarning {
  readonly code: ParseWarningCode;
  readonly message: string;
  readonly context?: Record<string, unknown>;
}

export type ParseWarningCode =
  | 'unknown_nomenclature'
  | 'missing_code_banque'
  | 'missing_date_annexe'
  | 'missing_code_annexe'
  | 'non_numeric_cell_value'
  | 'duplicate_rubrique'
  | 'empty_annexe';

/**
 * Erreur bloquante levée si le XML est inexploitable.
 */
export class ParseError extends Error {
  constructor(
    message: string,
    public readonly code: ParseErrorCode,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ParseError';
  }
}

export type ParseErrorCode =
  | 'invalid_xml_syntax'
  | 'no_recognizable_header'
  | 'no_annexe_code'
  | 'no_date_annexe';
