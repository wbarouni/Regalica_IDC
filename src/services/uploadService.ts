import { db } from '../db'
import { uploads } from '../db/schema'
import { eq } from 'drizzle-orm'
import { Upload, UploadStatus } from '../types'
import { generateId } from '../lib/utils'

export async function createUpload(
  userId: string,
  fileName: string,
  fileSize: number,
  fileType: string = 'xml'
): Promise<Upload> {
  const id = generateId()
  const now = new Date()

  await db.insert(uploads).values({
    id,
    userId,
    fileName,
    fileSize,
    fileType,
    status: 'pending',
    uploadedAt: now,
  })

  return {
    id,
    userId,
    fileName,
    fileSize,
    fileType,
    status: 'pending',
    uploadedAt: now,
  }
}

export async function getUploadById(id: string): Promise<Upload | null> {
  const upload = await db.query.uploads.findFirst({
    where: eq(uploads.id, id),
  })

  if (!upload) return null

  return {
    id: upload.id,
    userId: upload.userId,
    fileName: upload.fileName,
    filePath: upload.filePath || undefined,
    fileSize: upload.fileSize || undefined,
    fileType: upload.fileType || 'xml',
    status: upload.status || 'pending',
    errorMessage: upload.errorMessage || undefined,
    uploadedAt: upload.uploadedAt || new Date(),
    processedAt: upload.processedAt || undefined,
  }
}

export async function updateUploadStatus(id: string, status: UploadStatus, errorMessage?: string): Promise<Upload | null> {
  const updateData: Record<string, unknown> = { status }

  if (status === 'completed' || status === 'failed') {
    updateData.processedAt = new Date()
  }

  if (errorMessage) {
    updateData.errorMessage = errorMessage
  }

  await db.update(uploads).set(updateData).where(eq(uploads.id, id))
  return getUploadById(id)
}

export async function updateUploadPath(id: string, filePath: string): Promise<Upload | null> {
  await db.update(uploads).set({ filePath }).where(eq(uploads.id, id))
  return getUploadById(id)
}

export async function getUploadsByUserId(userId: string, limit: number = 10, offset: number = 0): Promise<Upload[]> {
  const uploadsList = await db.query.uploads.findMany({
    where: eq(uploads.userId, userId),
    limit,
    offset,
  })

  return uploadsList.map((u) => ({
    id: u.id,
    userId: u.userId,
    fileName: u.fileName,
    filePath: u.filePath || undefined,
    fileSize: u.fileSize || undefined,
    fileType: u.fileType || 'xml',
    status: u.status || 'pending',
    errorMessage: u.errorMessage || undefined,
    uploadedAt: u.uploadedAt || new Date(),
    processedAt: u.processedAt || undefined,
  }))
}

export async function deleteUpload(id: string): Promise<boolean> {
  await db.delete(uploads).where(eq(uploads.id, id))
  return true
}
