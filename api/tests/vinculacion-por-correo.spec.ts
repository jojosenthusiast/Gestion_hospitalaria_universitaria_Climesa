import { randomUUID } from 'node:crypto';
import { createTestApp, TestApp } from './support/app';
import { userId } from './support/database';

jest.setTimeout(240000);
const now = new Date('2026-11-19T15:00:00Z');

/**
 * Owner observations 2026-11-18, batch 2: the app account joins its record on its own, only by verified email.
 * Linked when: the account has no record, Supabase Auth confirmed its email, exactly one active record has that email
 * and that record has no other account. No DUI or birth-date self-linking and no approval queue.
 */
describe('vinculación automática por correo verificado', () => {
  let t: TestApp;
  /** A patient account that signed up in the app (the trigger gives it PAC), not linked to any record. */
  const account = async (email: string) => {
    const id = randomUUID();
    await t.pg.query('INSERT INTO auth.users(id,email,raw_user_meta_data,raw_app_meta_data) VALUES($1,$2,$3,$4)', [id, email, { nombre: 'Cuenta ficticia' }, {}]);
    return id;
  };
  /** A record inserted directly with this email (legacy data, bypassing the API checks). */
  const record = async (email: string | null, name = 'Ficticia') => (await t.one<{ id: string }>(`INSERT INTO pacientes.paciente(expediente,nombres,primer_apellido,sexo,precision_nacimiento,nacimiento,correo)
      VALUES($1,$2,'Ejemplo','femenino','exacta','1990-01-01',$3) RETURNING id`, [`T-${randomUUID().slice(0, 8)}`, name, email])).id;
  const linkedTo = async (id: string) => (await t.one<{ paciente_id: string | null }>('SELECT paciente_id FROM acceso.usuario WHERE id=$1', [id])).paciente_id;
  const create = async (data: Record<string, unknown>) => {
    const search = await t.call('REC', 'POST', '/pacientes/busquedas', { query: String(data.givenNames) });
    return t.call('REC', 'POST', '/pacientes', { surnames: 'Ejemplo Ficticio', sex: 'femenino', birth: '1991-03-04', ...data, searchToken: search.body.token, searchQuery: data.givenNames });
  };
  const edit = async (id: string, email: string) => {
    const current = (await t.call('REC', 'GET', `/pacientes/${id}`)).body;
    return t.call('REC', 'PATCH', `/pacientes/${id}`, { givenNames: current.givenNames, surnames: current.surnames, sex: current.sex, birth: current.birth, email, version: current.version, reason: 'Recepción anota el correo de la cuenta' });
  };

  beforeAll(async () => { t = await createTestApp(now); });
  afterAll(async () => { await t?.close(); });

  test('a verified email that only one active record has links the account on its next session, with audit and events', async () => {
    const patientId = await record('marta.ficticia@example.test');
    t.authUser('PAC', 'Marta.Ficticia@example.test');
    const me = await t.call('PAC', 'GET', '/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.patientId).toBe(patientId);
    expect(await linkedTo(userId('PAC'))).toBe(patientId);
    const [audit] = (await t.audits('vinculacion.automatica')).filter(a => a.paciente_id === patientId);
    expect(audit).toMatchObject({ resultado: 'exito', detalle: expect.objectContaining({ accountId: userId('PAC'), source: 'sesion' }) });
    expect(JSON.stringify(audit.detalle)).not.toContain('marta.ficticia');
    const resolved = await t.events('vinculacion.resuelta', userId('PAC'));
    expect(resolved).toHaveLength(1);
    expect(resolved[0]).toContain(`usuario:${userId('PAC')}`);
    expect((await t.events('paciente.actualizado', patientId)).at(-1)).toEqual(expect.arrayContaining(['rol:REC', `usuario:${userId('PAC')}`]));
    expect((await t.call('PAC', 'GET', '/me/vinculacion')).body).toEqual({ linked: true, email: 'marta.ficticia@example.test', emailVerified: true, request: null });
    expect((await t.call('PAC', 'GET', '/me/paciente')).status).toBe(200);
    expect((await t.call('REC', 'GET', `/pacientes/${patientId}`)).body.appAccount).toBe('vinculada');
    // A later session does not link again nor write another audit row.
    await t.call('PAC', 'GET', '/auth/me');
    expect((await t.audits('vinculacion.automatica')).filter(a => a.paciente_id === patientId)).toHaveLength(1);
  });

  test('an unverified email never links, and /me/vinculacion says which email Recepción must write', async () => {
    const id = await account('sin.confirmar@example.test');
    const patientId = await record('sin.confirmar@example.test');
    t.authUser(id, 'sin.confirmar@example.test', false);
    expect((await t.call(id, 'GET', '/auth/me')).body.patientId).toBeNull();
    expect(await linkedTo(id)).toBeNull();
    expect((await t.call(id, 'GET', '/me/vinculacion')).body).toEqual({ linked: false, email: 'sin.confirmar@example.test', emailVerified: false, request: null });
    expect((await t.call('REC', 'GET', `/pacientes/${patientId}`)).body.appAccount).toBe('sin_cuenta');
    // Once Supabase Auth confirms it, the next session links.
    t.authUser(id, 'sin.confirmar@example.test', true);
    expect((await t.call(id, 'GET', '/auth/me')).body.patientId).toBe(patientId);
  });

  test('two active records with one email link neither, Recepción sees why, and no save can create that ambiguity', async () => {
    const id = await account('compartido@example.test');
    const first = await record('compartido@example.test', 'Primera');
    const second = await record('COMPARTIDO@example.test', 'Segunda');
    t.authUser(id, 'compartido@example.test');
    expect((await t.call(id, 'GET', '/auth/me')).body.patientId).toBeNull();
    expect(await linkedTo(id)).toBeNull();
    expect((await t.call('REC', 'GET', `/pacientes/${first}`)).body.appAccount).toBe('correo_repetido');
    expect((await t.call('REC', 'GET', `/pacientes/${second}`)).body.appAccount).toBe('correo_repetido');

    const created = await create({ givenNames: 'Tercera', email: 'Compartido@Example.test' });
    expect(created.status).toBe(409);
    expect(created.body.codigo).toBe('correo_en_uso');
    // The REC message names the record; the body carries no other patient id.
    expect(created.body).not.toHaveProperty('paciente');
    expect(JSON.stringify(created.body)).not.toContain(first);
    expect(JSON.stringify(created.body)).not.toContain(second);
    const other = await record('otra.persona@example.test', 'Cuarta');
    const edited = await edit(other, 'compartido@example.test');
    expect(edited.status).toBe(409);
    expect(edited.body.codigo).toBe('correo_en_uso');

    // Deactivating one record solves it: the next session links the account to the one that stays active.
    const state = (await t.call('REC', 'GET', `/pacientes/${second}`)).body;
    expect((await t.call('REC', 'POST', `/pacientes/${second}/estado`, { active: false, version: state.version, reason: 'Expediente duplicado ficticio' })).status).toBe(201);
    expect((await t.call(id, 'GET', '/auth/me')).body.patientId).toBe(first);
    // Reactivating it would bring the ambiguity back, so it is refused.
    const inactive = (await t.call('REC', 'GET', `/pacientes/${second}`)).body;
    const reactivated = await t.call('REC', 'POST', `/pacientes/${second}/estado`, { active: true, version: inactive.version, reason: 'Reactivación de prueba ficticia' });
    expect(reactivated.status).toBe(409);
    expect(reactivated.body.codigo).toBe('correo_en_uso');
  });

  test('flow 2: the account came first; Recepción creates the record with its email and it links in the same save', async () => {
    const id = await account('primero.app@example.test');
    t.authUser(id, 'primero.app@example.test');
    expect((await t.call(id, 'GET', '/auth/me')).body.patientId).toBeNull();
    const created = await create({ givenNames: 'Lucía', email: 'Primero.App@example.test' });
    expect(created.status).toBe(201);
    expect(await linkedTo(id)).toBe(created.body.id);
    const [audit] = (await t.audits('vinculacion.automatica')).filter(a => a.paciente_id === created.body.id);
    expect(audit.detalle).toMatchObject({ accountId: id, source: 'expediente' });
    expect((await t.call('REC', 'GET', `/pacientes/${created.body.id}`)).body.appAccount).toBe('vinculada');
    // Recepción finds the person by the account email.
    const found = await t.call('REC', 'GET', `/pacientes?query=${encodeURIComponent('primero.app@')}`);
    expect((found.body as Array<{ id: string; matchReason: string }>).find((p: { id: string }) => p.id === created.body.id)?.matchReason).toContain('Coincidencia de correo');
  });

  test('Recepción writing the email on an existing record links the verified account that already exists', async () => {
    const id = await account('despues@example.test');
    t.authUser(id, 'despues@example.test');
    await t.call(id, 'GET', '/auth/me');
    const patientId = await record(null, 'Sin correo');
    const edited = await edit(patientId, 'despues@example.test');
    expect(edited.status).toBe(200);
    expect(await linkedTo(id)).toBe(patientId);
  });

  test('no link when the record already has another account; refusal when the email belongs to an account linked elsewhere', async () => {
    const owner = await account('duena@example.test');
    const owned = await record('duena@example.test', 'Dueña');
    t.authUser(owner, 'duena@example.test');
    expect((await t.call(owner, 'GET', '/auth/me')).body.patientId).toBe(owned);

    // Another verified account whose email Recepción then writes on the already linked record: the record keeps its account.
    const intruder = await account('otra.cuenta@example.test');
    t.authUser(intruder, 'otra.cuenta@example.test');
    await t.call(intruder, 'GET', '/auth/me');
    expect((await edit(owned, 'otra.cuenta@example.test')).status).toBe(200);
    expect(await linkedTo(intruder)).toBeNull();
    expect((await t.call(intruder, 'GET', '/auth/me')).body.patientId).toBeNull();

    // The owner's verified email on a different record is refused with the reason.
    const different = await record(null, 'Diferente');
    const refused = await edit(different, 'duena@example.test');
    expect(refused.status).toBe(409);
    expect(refused.body.codigo).toBe('correo_de_otra_cuenta');
    expect(refused.body).not.toHaveProperty('paciente');
    expect(JSON.stringify(refused.body)).not.toContain(owned);
    const createdRefused = await create({ givenNames: 'Quinta', email: 'duena@example.test' });
    expect(createdRefused.body.codigo).toBe('correo_de_otra_cuenta');
  });

  test('the patient cannot change its record email, and the refusal never depends on other records', async () => {
    const id = await account('propia@example.test');
    const own = await record('propia@example.test', 'Propia');
    await record('ajena@example.test', 'Ajena');
    t.authUser(id, 'propia@example.test');
    expect((await t.call(id, 'GET', '/auth/me')).body.patientId).toBe(own);
    const version = async () => (await t.call(id, 'GET', '/me/paciente')).body.version as number;
    const taken = await t.call(id, 'PATCH', '/me/paciente', { version: await version(), email: 'ajena@example.test' });
    const free = await t.call(id, 'PATCH', '/me/paciente', { version: await version(), email: 'nadie.la.usa@example.test' });
    expect(taken.status).toBe(403);
    expect(taken.body.codigo).toBe('correo_lo_gestiona_recepcion');
    expect(taken.body.detail).toBe('Tu correo lo actualiza Recepción. Pídelo en ventanilla.');
    // Same answer whether or not another record has the email: nothing to learn about other patients.
    const strip = (body: Record<string, unknown>) => { const rest = { ...body }; delete rest.requestId; return rest; };
    expect({ status: free.status, body: strip(free.body) }).toEqual({ status: taken.status, body: strip(taken.body) });
    expect(JSON.stringify(taken.body)).not.toMatch(/ajena|paciente/);
    expect((await t.one<{ correo: string }>('SELECT correo FROM pacientes.paciente WHERE id=$1', [own])).correo).toBe('propia@example.test');
    // Phone and address still change; the same email (any case) is accepted for released clients.
    const ok = await t.call(id, 'PATCH', '/me/paciente', { version: await version(), phone: '7000-2222', address: 'Calle ficticia 2', email: 'PROPIA@example.test' });
    expect(ok.status).toBe(200);
    expect((await t.one<{ telefono: string; correo: string }>('SELECT telefono,correo FROM pacientes.paciente WHERE id=$1', [own]))).toEqual({ telefono: '70002222', correo: 'propia@example.test' });
  });

  test('the DUI request and the approval answer 410, and the W27 tray is empty', async () => {
    const id = await account('vieja.app@example.test');
    const sent = await t.call(id, 'POST', '/cuentas/vinculacion', { dui: '04567891-1', birth: '1990-01-01' });
    expect(sent.status).toBe(410);
    expect(sent.body).toMatchObject({ codigo: 'vinculacion_automatica', detail: 'La vinculación ahora es automática: pide en Recepción que anoten tu correo en tu expediente.' });
    expect((await t.call(id, 'POST', '/cuentas/vinculacion', {})).status).toBe(410);
    const old = (await t.one<{ id: string }>(`INSERT INTO acceso.vinculacion_paciente(usuario_id,dui_declarado,nacimiento_declarado) VALUES($1,'045678911','1990-01-01') RETURNING id`, [id])).id;
    expect((await t.call('REC', 'GET', '/cuentas/vinculaciones')).body).toEqual([]);
    const approve = await t.call('REC', 'POST', `/cuentas/vinculaciones/${old}/aprobar`, { version: 1 });
    expect(approve.status).toBe(410);
    expect(approve.body.codigo).toBe('vinculacion_automatica');
    expect(await linkedTo(id)).toBeNull();
    // Old pending rows can still be closed; the history stays.
    expect((await t.call('REC', 'POST', `/cuentas/vinculaciones/${old}/rechazar`, { version: 1, reason: 'La vinculación ahora es por correo' })).status).toBe(201);
    expect((await t.one<{ estado: string }>('SELECT estado FROM acceso.vinculacion_paciente WHERE id=$1', [old])).estado).toBe('rechazada');
  });
});
