import { Injectable, OnModuleInit } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import multipart from '@fastify/multipart';
import { ProblemException } from './problem';

/**
 * Registers @fastify/multipart once on the Fastify instance (lab attachment upload, S10). Limits are tight by default:
 * one file, a few small fields; each route passes its own `fileSize` to `request.file()`. Files are read into memory,
 * never written to a temporary folder.
 */
@Injectable()
export class MultipartSetup implements OnModuleInit {
  constructor(private readonly host: HttpAdapterHost) {}
  onModuleInit() {
    const instance = this.host.httpAdapter?.getInstance?.() as { register?: (plugin: unknown, options: unknown) => unknown; hasContentTypeParser?: (type: string) => boolean } | undefined;
    if (!instance?.register || instance.hasContentTypeParser?.('multipart/form-data')) return;
    instance.register(multipart, { limits: { files: 1, fields: 5, fieldSize: 2048, parts: 6, fileSize: 10 * 1024 * 1024 } });
  }
}

type FilePart = { fieldname: string; file: { resume(): unknown }; toBuffer(): Promise<Buffer> };
type MultipartRequest = { isMultipart?: () => boolean; file?: (options: unknown) => Promise<FilePart | undefined> };

/**
 * Reads the one file part named `field` of a multipart/form-data request into memory, up to `maxBytes`. A request
 * without that part answers `validacion`; a larger file answers `adjunto_muy_grande` (413) before anything is stored.
 */
export async function readSingleFile(request: unknown, field: string, maxBytes: number): Promise<Buffer> {
  const req = request as MultipartRequest;
  const missing = () => new ProblemException('validacion', 400, `Envía el archivo como multipart/form-data en el campo ${field}.`, field);
  if (!req.isMultipart?.() || !req.file) throw missing();
  let part: FilePart | undefined;
  try {
    part = await req.file({ limits: { fileSize: maxBytes, files: 1 } });
  } catch {
    throw missing();
  }
  if (!part || part.fieldname !== field) {
    part?.file.resume();
    throw missing();
  }
  try {
    return await part.toBuffer();
  } catch (error) {
    if ((error as { code?: string }).code === 'FST_REQ_FILE_TOO_LARGE') {
      throw new ProblemException('adjunto_muy_grande', 413, `El archivo pasa de ${Math.round(maxBytes / (1024 * 1024))} MB.`, field);
    }
    throw missing();
  }
}
