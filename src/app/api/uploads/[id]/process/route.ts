import { NextRequest, NextResponse } from 'next/server'
import { getUploadById, updateUploadStatus } from '../../../../../services/uploadService'
import { updateValidationStatus, getValidationsByUploadId } from '../../../../../services/validationService'
import { parseXMLFile, extractBankingData, validateXMLStructure } from '../../../../../services/xmlParserService'
import { executeValidation } from '../../../../../services/validationEngineService'
import { verifyToken, getTokenFromHeader } from '../../../../../lib/auth'
import { ApiResponse } from '../../../../../types'
import { db } from '../../../../../db'
import { bankingData } from '../../../../../db/schema'
import { createAuditLog } from '../../../../../services/auditService'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  try {
    const authHeader = req.headers.get('authorization')
    const token = getTokenFromHeader(authHeader)

    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Token manquant' } as ApiResponse,
        { status: 401 }
      )
    }

    const decoded = verifyToken(token)
    if (!decoded) {
      return NextResponse.json(
        { success: false, error: 'Token invalide ou expiré' } as ApiResponse,
        { status: 401 }
      )
    }

    // Récupérer l'upload
    const upload = await getUploadById(params.id)
    if (!upload) {
      return NextResponse.json(
        { success: false, error: 'Upload non trouvé' } as ApiResponse,
        { status: 404 }
      )
    }

    // Vérifier que l'utilisateur a accès à cet upload
    if (upload.userId !== decoded.id && decoded.role !== 'admin') {
      return NextResponse.json(
        { success: false, error: 'Accès refusé' } as ApiResponse,
        { status: 403 }
      )
    }

    // Récupérer le contenu du fichier XML depuis la requête
    const body = await req.json()
    const { xmlContent } = body

    if (!xmlContent) {
      return NextResponse.json(
        { success: false, error: 'Contenu XML manquant' } as ApiResponse,
        { status: 400 }
      )
    }

    // Mettre à jour le statut à "processing"
    await updateUploadStatus(params.id, 'processing')

    // Parser le XML
    const parsedData = await parseXMLFile(xmlContent)

    // Valider la structure
    const validation = validateXMLStructure(parsedData)
    if (!validation.isValid) {
      await updateUploadStatus(
        params.id,
        'failed',
        `Erreur de structure XML: ${validation.errors.join(', ')}`
      )

      await createAuditLog({
        userId: decoded.id,
        action: 'upload_failed',
        entityType: 'upload',
        entityId: params.id,
        changes: {
          error: `Erreur de structure XML: ${validation.errors.join(', ')}`,
        },
      })

      return NextResponse.json(
        {
          success: false,
          error: `Erreur de structure XML: ${validation.errors.join(', ')}`,
        } as ApiResponse,
        { status: 400 }
      )
    }

    // Extraire les données bancaires
    const bankingDataList = await extractBankingData(params.id, parsedData)

    // Enregistrer les données bancaires
    for (const data of bankingDataList) {
      await db.insert(bankingData).values({
        id: data.id,
        uploadId: data.uploadId,
        dataType: data.dataType,
        bankCode: data.bankCode,
        reportingPeriod: data.reportingPeriod,
        annexNumber: data.annexNumber,
        rawData: data.rawData,
        parsedData: data.parsedData,
        createdAt: data.createdAt,
      })
    }

    // Récupérer la validation associée
    const validations = await getValidationsByUploadId(params.id)
    if (validations.length === 0) {
      throw new Error('Aucune validation trouvée pour cet upload')
    }

    const validationRecord = validations[0]

    // Mettre à jour le statut de la validation à "in_progress"
    await updateValidationStatus(validationRecord.id, 'in_progress')

    // Exécuter la validation
    const results = await executeValidation({
      validationId: validationRecord.id,
      data: parsedData,
      metadata: {
        uploadId: params.id,
        fileName: upload.fileName,
        fileSize: upload.fileSize,
      },
    })

    // Mettre à jour le statut de la validation à "completed"
    await updateValidationStatus(validationRecord.id, 'completed')

    // Mettre à jour le statut de l'upload à "completed"
    await updateUploadStatus(params.id, 'completed')

    // Enregistrer dans l'audit
    await createAuditLog({
      userId: decoded.id,
      action: 'upload_processed',
      entityType: 'upload',
      entityId: params.id,
      changes: {
        bankingDataCount: bankingDataList.length,
        validationResultsCount: results.length,
      },
    })

    return NextResponse.json(
      {
        success: true,
        data: {
          upload,
          validation: validationRecord,
          results: {
            total: results.length,
            passed: results.filter((r) => r.status === 'passed').length,
            failed: results.filter((r) => r.status === 'failed').length,
            pending: results.filter((r) => r.status === 'pending').length,
          },
        },
        message: 'Traitement du fichier réussi',
      } as ApiResponse,
      { status: 200 }
    )
  } catch (error: any) {
    // Mettre à jour le statut de l'upload à "failed"
    await updateUploadStatus(params.id, 'failed', error.message)

    // Enregistrer l'erreur dans l'audit
    const authHeader = req.headers.get('authorization')
    const token = getTokenFromHeader(authHeader)
    if (token) {
      const decoded = verifyToken(token)
      if (decoded) {
        await createAuditLog({
          userId: decoded.id,
          action: 'upload_error',
          entityType: 'upload',
          entityId: params.id,
          changes: {
            error: error.message,
          },
        })
      }
    }

    return NextResponse.json(
      { success: false, error: error.message || 'Erreur lors du traitement du fichier' } as ApiResponse,
      { status: 500 }
    )
  }
}
