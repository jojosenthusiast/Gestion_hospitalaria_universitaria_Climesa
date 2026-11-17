import { PGlite } from '@electric-sql/pglite';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createTestApp, TestApp } from './support/app';

jest.setTimeout(300000);
const MINUTE = 60_000;
const now = new Date(Math.floor(Date.now() / (20 * MINUTE)) * 20 * MINUTE);

const REFERENCE = { fileName: 'informe-externo.pdf', mimeType: 'application/pdf', sizeBytes: 2048 };
const PDF = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(2000, 0x20), Buffer.from('\n%%EOF\n')]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);
const sha = (content: Buffer) => createHash('sha256').update(content).digest('hex');

/** multipart/form-data body with one file part named `archivo` (the field the API reads). */
function form(content: Buffer, filename = 'informe.pdf', type = 'application/pdf', field = 'archivo') {
  const boundary = `----climesa${randomUUID().replace(/-/g, '')}`;
  const payload = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${field}"; filename="${filename}"\r\nContent-Type: ${type}\r\n\r\n`),
    content,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return { payload, contentType: `multipart/form-data; boundary=${boundary}` };
}

/**
 * T07b (S10, L13): the photo or PDF of an external result lives in a private bucket. Upload and download go only
 * through the API; a download is a short-lived signed URL for staff who see the order's values, audited; the patient
 * never gets it.
 */
describe('Laboratorio · archivo privado del resultado externo (S10, T07b)', () => {
  let t: TestApp;
  let hb: string;

  beforeAll(async () => {
    t = await createTestApp(now);
    await t.enroll('MED');
    hb = (await t.one<{ id: string }>("SELECT id FROM laboratorio.examen WHERE codigo='HB'")).id;
  });
  afterAll(async () => { await t?.close(); });

  /** External order with its result loaded by the lab: one reference-only attachment, ready to receive its file. */
  async function referenceOnly(reference: Record<string, unknown> = REFERENCE) {
    const patientId = await t.patient({ name: `Adj${Math.random().toString(36).slice(2, 8)}`, linkPac: true });
    const consultation = await t.consultation(patientId);
    const created = await t.call('MED', 'POST', '/laboratorio/ordenes', { consultationId: consultation.id, exams: [hb] });
    const id = created.body.id as string;
    const item = (await t.one<{ id: string }>('SELECT id FROM laboratorio.orden_item WHERE orden_id=$1', [id])).id;
    const sent = await t.call('LAB', 'POST', `/laboratorio/ordenes/${id}/externa`, { version: created.body.version, place: 'Clínica Ficticia', instructions: 'Instrucciones de prueba suficientes.' });
    const loaded = await t.call('LAB', 'POST', `/laboratorio/ordenes/${id}/resultado-externo`, { version: sent.body.version, attachment: reference, results: [{ orderItemId: item, value: 12.9 }] });
    expect(loaded.status).toBe(201);
    return { orderId: id, patientId, attachmentId: loaded.body.attachmentId as string, version: loaded.body.version as number };
  }
  const row = (id: string) => t.one<{ ruta: string | null; huella: string | null; tipo: string; tamano: number }>(
    'SELECT ruta_almacenamiento AS ruta,huella_sha256 AS huella,tipo_mime AS tipo,tamano_bytes AS tamano FROM laboratorio.adjunto WHERE id=$1', [id]);
  const upload = (role: string, attachmentId: string, body = form(PDF), key?: string) =>
    t.send(role, 'POST', `/laboratorio/adjuntos/${attachmentId}/archivo`, body.payload, body.contentType, key);

  test('el laboratorio sube el archivo: la fila queda con ruta no adivinable y huella calculada en el servidor', async () => {
    const a = await referenceOnly();
    const before = t.storage.objects.size;
    const res = await upload('LAB', a.attachmentId);
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: a.attachmentId, stored: true, mimeType: 'application/pdf', sizeBytes: PDF.length, sha256: sha(PDF) });
    expect(JSON.stringify(res.body)).not.toContain(a.orderId);
    const saved = await row(a.attachmentId);
    expect(saved).toMatchObject({ huella: sha(PDF), tipo: 'application/pdf', tamano: PDF.length });
    expect(saved.ruta).toMatch(new RegExp(`^${a.orderId}/[0-9a-f-]{36}$`));
    expect(saved.ruta).not.toMatch(/Adj|informe/);
    expect(t.storage.objects.size).toBe(before + 1);
    expect(t.storage.objects.get(saved.ruta!)?.content.equals(PDF)).toBe(true);
    expect((await t.audits('laboratorio.adjunto_subido')).at(-1)).toMatchObject({ paciente_id: a.patientId, resultado: 'exito' });
    // The staff detail now says the file is stored; a second upload does not replace it.
    const detail = await t.call('MED', 'GET', `/laboratorio/ordenes/${a.orderId}`);
    expect(detail.body.attachments).toEqual([expect.objectContaining({ id: a.attachmentId, stored: true, sha256: sha(PDF) })]);
    expect(JSON.stringify(detail.body)).not.toContain(saved.ruta!);
    const again = await upload('LAB', a.attachmentId);
    expect([again.status, again.body.codigo]).toEqual([409, 'adjunto_ya_almacenado']);
    expect(t.storage.objects.size).toBe(before + 1);
  });

  test('la base guarda el archivo una sola vez y sghu_api no cambia el resto de la fila', async () => {
    const a = await referenceOnly();
    expect((await upload('LAB', a.attachmentId)).status).toBe(201);
    const asApi = (sql: string) => t.pg.transaction(async tx => { await tx.exec('SET LOCAL ROLE sghu_api'); await tx.query(sql, [a.attachmentId]); });
    await expect(asApi(`UPDATE laboratorio.adjunto SET ruta_almacenamiento='otra/ruta',huella_sha256=repeat('b',64) WHERE id=$1`)).rejects.toThrow(/adjunto_ya_almacenado/);
    await expect(asApi(`UPDATE laboratorio.adjunto SET nombre_archivo='cambiado.pdf' WHERE id=$1`)).rejects.toThrow(/permission denied/);
    await expect(asApi('DELETE FROM laboratorio.adjunto WHERE id=$1')).rejects.toThrow(/permission denied/);
  });

  test('un archivo cuyo contenido no es PDF ni imagen permitida se rechaza aunque diga application/pdf', async () => {
    const a = await referenceOnly();
    const before = t.storage.objects.size;
    const fake = await upload('LAB', a.attachmentId, form(Buffer.from('MZ ejecutable disfrazado de PDF'), 'informe.pdf', 'application/pdf'));
    expect([fake.status, fake.body.codigo]).toEqual([415, 'adjunto_tipo_invalido']);
    expect((await row(a.attachmentId)).ruta).toBeNull();
    expect(t.storage.objects.size).toBe(before);
    // A real PNG declared as PDF is stored as what it is.
    const png = await upload('LAB', a.attachmentId, form(PNG, 'foto.pdf', 'application/pdf'));
    expect([png.status, png.body.mimeType]).toEqual([201, 'image/png']);
  });

  // Auditoría T15: la huella declarada con la referencia debe ser la de los bytes subidos.
  test('un archivo distinto del declarado (otra huella) responde 409 adjunto_no_coincide y no se guarda nada', async () => {
    const a = await referenceOnly({ ...REFERENCE, sha256: sha(PNG) });
    const before = t.storage.objects.size;
    const res = await upload('LAB', a.attachmentId);
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ codigo: 'adjunto_no_coincide', campo: 'archivo', detail: expect.stringMatching(/no coincide/) });
    expect(t.storage.objects.size).toBe(before);
    expect(await row(a.attachmentId)).toMatchObject({ ruta: null, huella: sha(PNG) });
  });

  test('un archivo con la misma huella declarada se guarda como siempre', async () => {
    const a = await referenceOnly({ ...REFERENCE, sha256: sha(PDF) });
    const res = await upload('LAB', a.attachmentId);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ stored: true, sha256: sha(PDF) });
  });

  test('un archivo de más de 10 MiB se rechaza y no se guarda nada', async () => {
    const a = await referenceOnly();
    const before = t.storage.objects.size;
    const big = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(10 * 1024 * 1024, 0x20)]);
    const res = await upload('LAB', a.attachmentId, form(big));
    expect([res.status, res.body.codigo]).toEqual([413, 'adjunto_muy_grande']);
    expect((await row(a.attachmentId)).ruta).toBeNull();
    expect(t.storage.objects.size).toBe(before);
  });

  test('sin la parte `archivo` responde validación', async () => {
    const a = await referenceOnly();
    const res = await upload('LAB', a.attachmentId, form(PDF, 'informe.pdf', 'application/pdf', 'otro'));
    expect([res.status, res.body.codigo, res.body.campo]).toEqual([400, 'validacion', 'archivo']);
  });

  test('el médico descarga: recibe un enlace firmado de 5 minutos y queda una fila de auditoría', async () => {
    const a = await referenceOnly();
    expect((await upload('LAB', a.attachmentId)).status).toBe(201);
    const path = (await row(a.attachmentId)).ruta!;
    const audited = (await t.audits('laboratorio.adjunto_descargado')).length;
    const res = await t.call('MED', 'GET', `/laboratorio/adjuntos/${a.attachmentId}/enlace`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ fileName: REFERENCE.fileName, mimeType: 'application/pdf', sizeBytes: PDF.length, expiresInSeconds: 300 });
    expect(res.body.url).toMatch(/^https:\/\/almacen\.example\.test\/firmado\//);
    expect(new Date(res.body.expiresAt).valueOf()).toBe(now.valueOf() + 300_000);
    expect(JSON.stringify(res.body)).not.toContain(path);
    expect(t.storage.signed.at(-1)).toEqual({ path, seconds: 300, downloadName: REFERENCE.fileName });
    const audits = await t.audits('laboratorio.adjunto_descargado');
    expect(audits).toHaveLength(audited + 1);
    expect(audits.at(-1)).toMatchObject({ paciente_id: a.patientId, resultado: 'exito', detalle: expect.objectContaining({ attachmentId: a.attachmentId, expiresInSeconds: 300 }) });
    expect(JSON.stringify(audits.at(-1)?.detalle)).not.toMatch(/firmado|almacen/);
  });

  test('el paciente nunca obtiene el enlace, tampoco con la orden revisada', async () => {
    const a = await referenceOnly();
    expect((await upload('LAB', a.attachmentId)).status).toBe(201);
    expect((await t.call('MED', 'POST', `/laboratorio/ordenes/${a.orderId}/revisar`, { version: a.version })).status).toBe(201);
    const signed = t.storage.signed.length, audited = (await t.audits('laboratorio.adjunto_descargado')).length;
    const res = await t.call('PAC', 'GET', `/laboratorio/adjuntos/${a.attachmentId}/enlace`);
    expect([403, 404]).toContain(res.status);
    expect(JSON.stringify(res.body)).not.toMatch(/firmado|informe-externo/);
    expect(t.storage.signed.length).toBe(signed);
    expect(await t.audits('laboratorio.adjunto_descargado')).toHaveLength(audited);
    // Nor can the patient upload.
    expect((await upload('PAC', a.attachmentId)).status).toBe(403);
  });

  test('un adjunto que solo tiene la referencia responde un problema claro', async () => {
    const a = await referenceOnly();
    const res = await t.call('MED', 'GET', `/laboratorio/adjuntos/${a.attachmentId}/enlace`);
    expect([res.status, res.body.codigo]).toEqual([409, 'adjunto_sin_archivo']);
    expect(res.body.detail).toContain('referencia');
  });

  test('un adjunto inexistente responde 404', async () => {
    const res = await t.call('MED', 'GET', `/laboratorio/adjuntos/${randomUUID()}/enlace`);
    expect(res.status).toBe(404);
  });

  test('si la base falla después de subir, el objeto se retira: no quedan huérfanos', async () => {
    const a = await referenceOnly();
    const before = new Set(t.storage.objects.keys());
    await t.pg.exec(`CREATE FUNCTION public.prueba_falla_adjunto() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'falla de prueba'; END $$;
      CREATE TRIGGER prueba_falla_adjunto BEFORE UPDATE ON laboratorio.adjunto FOR EACH ROW EXECUTE FUNCTION public.prueba_falla_adjunto();`);
    try {
      const res = await upload('LAB', a.attachmentId);
      expect(res.status).toBeGreaterThanOrEqual(400);
    } finally {
      await t.pg.exec('DROP TRIGGER prueba_falla_adjunto ON laboratorio.adjunto; DROP FUNCTION public.prueba_falla_adjunto();');
    }
    expect([...t.storage.objects.keys()].filter(key => !before.has(key))).toEqual([]);
    expect((await row(a.attachmentId)).ruta).toBeNull();
  });

  test('repetir la subida con la misma clave devuelve la misma respuesta sin guardar otro objeto', async () => {
    const a = await referenceOnly();
    const key = randomUUID();
    const first = await upload('LAB', a.attachmentId, form(PDF), key);
    const size = t.storage.objects.size;
    const replay = await upload('LAB', a.attachmentId, form(PDF), key);
    expect([first.status, replay.status]).toEqual([201, 201]);
    expect(replay.body).toEqual(first.body);
    expect(t.storage.objects.size).toBe(size);
  });
});

describe('Migración del bucket privado de adjuntos (T07b)', () => {
  const root = resolve(__dirname, '../../supabase/migrations');
  const file = readdirSync(root).find(name => /^20261125006\d{3}_.*\.sql$/.test(name) && name.includes('adjuntos'));
  const sql = file ? readFileSync(resolve(root, file), 'utf8') : '';
  /** Same columns as Supabase's storage.buckets that the migration writes. */
  const STORAGE = `CREATE SCHEMA storage; CREATE TABLE storage.buckets(id text PRIMARY KEY, name text NOT NULL, public boolean DEFAULT false,
    file_size_limit bigint, allowed_mime_types text[]); CREATE TABLE storage.objects(id uuid PRIMARY KEY, bucket_id text, name text);`;

  test('crea el bucket privado, con límite y tipos, y es repetible', async () => {
    expect(file).toBeDefined();
    const pg = await PGlite.create();
    try {
      await pg.exec(STORAGE);
      await pg.exec(sql);
      await pg.exec(sql);
      const rows = (await pg.query('SELECT id,public,file_size_limit::int AS "limit",allowed_mime_types AS types FROM storage.buckets')).rows;
      expect(rows).toEqual([{ id: 'laboratorio-adjuntos', public: false, limit: 10485760, types: ['application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'image/webp'] }]);
    } finally { await pg.close(); }
  });

  test('falla si ya existe un bucket público con ese nombre', async () => {
    const pg = await PGlite.create();
    try {
      await pg.exec(STORAGE + "INSERT INTO storage.buckets(id,name,public) VALUES('laboratorio-adjuntos','laboratorio-adjuntos',true);");
      await expect(pg.exec(sql)).rejects.toThrow(/público|public/);
    } finally { await pg.close(); }
  });

  test('sin el esquema storage (PGlite) no hace nada, y nunca crea políticas para anon o authenticated', async () => {
    const pg = await PGlite.create();
    try { await expect(pg.exec(sql)).resolves.toBeDefined(); } finally { await pg.close(); }
    expect(sql).not.toMatch(/create\s+policy/i);
    expect(sql).not.toMatch(/grant\b/i);
  });
});
