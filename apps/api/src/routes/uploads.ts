import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';

import { XMLParser } from 'fast-xml-parser';
import { Router, type IRouter, type NextFunction, type Request, type Response } from 'express';
import multer, { MulterError } from 'multer';
import type { Pool, PoolClient } from 'pg';

import { handleDbError } from '../db/errors.js';
import { getPlatformConfig, getPlatformConfigNumber } from '../lib/platformConfig.js';
import { withConnection } from '../db/withConnection.js';

/**
 * POST /api/tenants/:tenantId/uploads
 *
 * Mounted under the tenant API prefix; assumes auth + tenant
 * middleware have already populated res.locals['userId'] and
 * validated :tenantId as a UUID.
 *
 * Pipeline:
 *   1. multipart parse (memory storage). multer's hard limit and the
 *      handler's soft limit both come from platform_config
 *      `upload_max_bytes`. The DB CHECK on xml_uploads.file_size_bytes
 *      is the ultimate backstop — keep platform_config <= the CHECK.
 *   2. SHA-256 of the raw bytes (Node built-in crypto).
 *   3. SELECT-then-INSERT dedup on (tenant_id, file_hash_sha256).
 *      Returns the existing row with deduplicated=true on a hit.
 *   4. fast-xml-parser walks the body to extract the BCT header
 *      tags <CodeBanque>, <CodeAnnexe>, <DateAnnexe>. Missing or
 *      malformed -> 422.
 *   5. zlib.gzipSync compresses the body at compression_level (also
 *      from platform_config). compression_algo carries the algo name
 *      ('gzip' today; switch to 'zstd' once the native build lands).
 *   6. INSERT into xml_uploads with status='pending'.
 *   7. 201 Created with the upload id and parsed metadata.
 */

interface BctXmlHeader {
  codeBanque: string;
  codeAnnexe: string;
  dateAnnexe: string;
}

class XmlHeaderError extends Error {
  constructor(public readonly missing: string) {
    super(`XML header missing required tag <${missing}>`);
    this.name = 'XmlHeaderError';
  }
}

function parseBctXmlHeader(raw: string): BctXmlHeader {
  let doc: unknown;
  try {
    doc = new XMLParser({ ignoreAttributes: true, parseTagValue: false }).parse(raw);
  } catch {
    throw new XmlHeaderError('root');
  }
  if (typeof doc !== 'object' || doc === null) {
    throw new XmlHeaderError('root');
  }
  // Tree walk — fast-xml-parser returns a tree, no cycles to guard
  // against. Each call is its own DFS so multiple lookups on the
  // same `doc` traverse independently.
  function findTag(node: unknown, tag: string): string | null {
    if (typeof node !== 'object' || node === null) {
      return null;
    }
    if (Array.isArray(node)) {
      for (const item of node) {
        const r = findTag(item, tag);
        if (r !== null) return r;
      }
      return null;
    }
    const obj = node as Record<string, unknown>;
    const direct = obj[tag];
    if (typeof direct === 'string' && direct.length > 0) {
      return direct;
    }
    if (typeof direct === 'number') {
      return String(direct);
    }
    for (const v of Object.values(obj)) {
      const r = findTag(v, tag);
      if (r !== null) return r;
    }
    return null;
  }
  const codeBanque = findTag(doc, 'CodeBanque');
  if (codeBanque === null) throw new XmlHeaderError('CodeBanque');
  const codeAnnexe = findTag(doc, 'CodeAnnexe');
  if (codeAnnexe === null) throw new XmlHeaderError('CodeAnnexe');
  const dateAnnexe = findTag(doc, 'DateAnnexe');
  if (dateAnnexe === null) throw new XmlHeaderError('DateAnnexe');
  return {
    codeBanque: codeBanque.trim(),
    codeAnnexe: codeAnnexe.trim(),
    dateAnnexe: dateAnnexe.trim(),
  };
}

function sha256Hex(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

interface ExistingUploadRow {
  id: string;
  file_name: string;
  code_annexe: string;
  date_annexe: string;
  file_size_bytes: string;
  status: string;
}

async function selectExistingByHash(
  client: PoolClient,
  hash: string,
  tenantId: string,
): Promise<ExistingUploadRow | null> {
  // date_annexe::text returns YYYY-MM-DD in the SQL session locale,
  // bypassing the JS Date timezone shift that turns 2024-03-31 into
  // 2024-03-30 when serialised via .toISOString().
  const r = await client.query<ExistingUploadRow>(
    `SELECT id, file_name, code_annexe, date_annexe::text AS date_annexe,
            file_size_bytes, status
     FROM xml_uploads
     WHERE tenant_id = $1 AND file_hash_sha256 = $2 AND deleted_at IS NULL
     LIMIT 1`,
    [tenantId, hash],
  );
  return r.rows[0] ?? null;
}

interface UploadDtoExisting {
  upload_id: string;
  filename: string;
  annexe_code: string;
  arrete_date: string;
  size_bytes: number;
  deduplicated: boolean;
  status: string;
}

function rowToDto(r: ExistingUploadRow, deduplicated: boolean): UploadDtoExisting {
  return {
    upload_id: r.id,
    filename: r.file_name,
    annexe_code: r.code_annexe,
    arrete_date: r.date_annexe,
    size_bytes: Number.parseInt(r.file_size_bytes, 10),
    deduplicated,
    status: r.status,
  };
}

export function uploadsRouter(pool: Pool): IRouter {
  const router = Router({ mergeParams: true });

  // Lazy multer init: read upload_max_bytes from platform_config on
  // first request and reuse the multer instance for subsequent calls.
  // Avoids any inline numeric literal (Guard D-006).
  let cachedMulter: multer.Multer | null = null;

  async function ensureMulter(): Promise<multer.Multer> {
    if (cachedMulter !== null) {
      return cachedMulter;
    }
    const max = await getPlatformConfigNumber(pool, 'upload_max_bytes');
    cachedMulter = multer({
      storage: multer.memoryStorage(),
      limits: { fileSize: max },
    });
    return cachedMulter;
  }

  function multipart(req: Request, res: Response, next: NextFunction): void {
    void ensureMulter()
      .then((m) => {
        m.single('file')(req, res, (err: unknown) => {
          if (err === undefined || err === null) {
            next();
            return;
          }
          if (err instanceof MulterError && err.code === 'LIMIT_FILE_SIZE') {
            res.status(413).json({
              error: { code: 'UPLOAD_TOO_LARGE', message: 'File exceeds upload_max_bytes' },
            });
            return;
          }
          if (err instanceof MulterError) {
            res.status(400).json({
              error: { code: 'MULTIPART_ERROR', message: err.code },
            });
            return;
          }
          next(err);
        });
      })
      .catch((err: unknown) => handleDbError(err, res));
  }

  router.post('/uploads', multipart, async (req: Request, res: Response) => {
    const tenantId = req.params['tenantId'] as string;
    const userId = res.locals['userId'] as string;
    const file = req.file;
    if (file === undefined) {
      res.status(400).json({
        error: { code: 'MISSING_FILE', message: 'multipart field "file" is required' },
      });
      return;
    }

    let header: BctXmlHeader;
    try {
      header = parseBctXmlHeader(file.buffer.toString('utf-8'));
    } catch (err) {
      const code = err instanceof XmlHeaderError ? 'XML_HEADER_INVALID' : 'XML_PARSE_FAILED';
      res.status(422).json({
        error: { code, message: err instanceof Error ? err.message : 'Invalid XML' },
      });
      return;
    }

    const hash = sha256Hex(file.buffer);
    let level: number;
    let algo: string;
    try {
      level = await getPlatformConfigNumber(pool, 'compression_level');
      algo = await getPlatformConfig<string>(pool, 'compression_algo');
    } catch (err) {
      handleDbError(err, res);
      return;
    }

    try {
      const dto = await withConnection(pool, { tenantId, userId }, async (client) => {
        const existing = await selectExistingByHash(client, hash, tenantId);
        if (existing !== null) {
          return rowToDto(existing, true);
        }
        const compressed = gzipSync(file.buffer, { level });
        const inserted = await client.query<ExistingUploadRow>(
          `INSERT INTO xml_uploads
             (tenant_id, code_banque, code_annexe, date_annexe,
              file_name, file_size_bytes, file_hash_sha256,
              content_compressed, compression_algo, encoding_detected,
              uploaded_by_user_id, status)
           VALUES
             ($1, $2, $3, $4,
              $5, $6, $7,
              $8, $9, $10,
              $11, $12)
           RETURNING id, file_name, code_annexe, date_annexe::text AS date_annexe,
                     file_size_bytes, status`,
          [
            tenantId,
            header.codeBanque,
            header.codeAnnexe,
            header.dateAnnexe,
            file.originalname,
            file.size,
            hash,
            compressed,
            algo,
            'utf-8',
            userId,
            'pending',
          ],
        );
        const row = inserted.rows[0];
        if (row === undefined) {
          throw new Error('insert returned no row');
        }
        return rowToDto(row, false);
      });
      const status = dto.deduplicated ? 200 : 201;
      res.status(status).json({
        data: dto,
        meta: { ts: new Date().toISOString(), version: '1' },
      });
    } catch (err) {
      handleDbError(err, res);
    }
  });

  return router;
}
