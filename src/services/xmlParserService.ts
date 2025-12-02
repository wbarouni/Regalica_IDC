import { XMLParser } from 'fast-xml-parser'
import { BankingData } from '../types'
import { generateId } from '../lib/utils'

interface XMLParserOptions {
  ignoreAttributes?: boolean
  parseTagValue?: boolean
}

const defaultOptions: XMLParserOptions = {
  ignoreAttributes: false,
  parseTagValue: true,
}

export async function parseXMLFile(fileContent: string): Promise<Record<string, unknown>> {
  try {
    const parser = new XMLParser(defaultOptions)
    const result = parser.parse(fileContent)
    return result
  } catch (error: any) {
    throw new Error(`Erreur lors du parsing XML: ${error.message}`)
  }
}

export async function extractBankingData(
  uploadId: string,
  parsedData: Record<string, unknown>
): Promise<BankingData[]> {
  const bankingDataList: BankingData[] = []

  // Extraire les annexes (ANNEX_XXX)
  const annexPattern = /ANNEX_(\d+)/i

  for (const [key, value] of Object.entries(parsedData)) {
    const match = key.match(annexPattern)

    if (match) {
      const annexNumber = match[1]
      const bankingData: BankingData = {
        id: generateId(),
        uploadId,
        dataType: `ANNEX_${annexNumber}`,
        annexNumber,
        rawData: value as Record<string, unknown>,
        parsedData: normalizeData(value),
        createdAt: new Date(),
      }

      bankingDataList.push(bankingData)
    }
  }

  // Extraire les informations générales
  if (parsedData.BANK_INFO) {
    const bankingData: BankingData = {
      id: generateId(),
      uploadId,
      dataType: 'BANK_INFO',
      bankCode: extractBankCode(parsedData.BANK_INFO),
      reportingPeriod: extractReportingPeriod(parsedData.BANK_INFO),
      rawData: parsedData.BANK_INFO as Record<string, unknown>,
      parsedData: normalizeData(parsedData.BANK_INFO),
      createdAt: new Date(),
    }

    bankingDataList.push(bankingData)
  }

  return bankingDataList
}

export function normalizeData(data: unknown): Record<string, unknown> {
  if (typeof data !== 'object' || data === null) {
    return { value: data }
  }

  const normalized: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(data)) {
    // Convertir les clés en camelCase
    const camelKey = convertToCamelCase(key)

    if (typeof value === 'object' && value !== null) {
      normalized[camelKey] = normalizeData(value)
    } else if (typeof value === 'string') {
      // Essayer de convertir en nombre si possible
      const numValue = parseFloat(value)
      normalized[camelKey] = isNaN(numValue) ? value : numValue
    } else {
      normalized[camelKey] = value
    }
  }

  return normalized
}

export function convertToCamelCase(str: string): string {
  return str.replace(/_([a-z])/g, (g) => g[1].toUpperCase()).toLowerCase()
}

export function extractBankCode(bankInfo: unknown): string | undefined {
  if (typeof bankInfo !== 'object' || bankInfo === null) return undefined

  const info = bankInfo as Record<string, unknown>
  return (info.BANK_CODE || info.bankCode || info.code) as string | undefined
}

export function extractReportingPeriod(bankInfo: unknown): string | undefined {
  if (typeof bankInfo !== 'object' || bankInfo === null) return undefined

  const info = bankInfo as Record<string, unknown>
  return (info.REPORTING_PERIOD || info.reportingPeriod || info.period) as string | undefined
}

export function validateXMLStructure(parsedData: Record<string, unknown>): {
  isValid: boolean
  errors: string[]
} {
  const errors: string[] = []

  // Vérifier la présence des éléments obligatoires
  if (!parsedData.BANK_INFO) {
    errors.push('BANK_INFO manquant')
  }

  // Vérifier la présence d'au moins une annexe
  const hasAnnex = Object.keys(parsedData).some((key) => /ANNEX_\d+/i.test(key))
  if (!hasAnnex) {
    errors.push('Aucune annexe trouvée')
  }

  return {
    isValid: errors.length === 0,
    errors,
  }
}

export function extractMetadata(parsedData: Record<string, unknown>): Record<string, unknown> {
  const metadata: Record<string, unknown> = {}

  if (parsedData.BANK_INFO) {
    const bankInfo = parsedData.BANK_INFO as Record<string, unknown>
    metadata.bankCode = bankInfo.BANK_CODE || bankInfo.bankCode
    metadata.reportingPeriod = bankInfo.REPORTING_PERIOD || bankInfo.reportingPeriod
    metadata.submissionDate = bankInfo.SUBMISSION_DATE || bankInfo.submissionDate
  }

  // Compter les annexes
  const annexCount = Object.keys(parsedData).filter((key) => /ANNEX_\d+/i.test(key)).length
  metadata.annexCount = annexCount

  return metadata
}
