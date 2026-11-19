-- ============================================================================================================
-- CLIMESA · Conteo de los datos de demostración (solo lectura)                               tools/demo/
--
-- Una sola consulta SELECT: no escribe nada y se puede correr en el editor SQL de Supabase o con
-- «node tools/demo/demo.cjs conteo». Por tabla:
--   demo            filas demo (id de300000-..., o "[DEMO]" en ambulancia.cambio_estado). limpiar-demo.sql las borra.
--   cuentas_prueba  filas que no son demo y que crearon o atienden las cuentas de prueba (prueba.<algo>@climesa.com,
--                   admin@climesa.com; <rol>@example.test en pruebas locales). Es el punto de partida de la sección 0
--                   de limpiar-demo.sql; la limpieza borra eso más sus hijos y conserva lo que otra cuenta todavía usa.
-- El número exacto de lo que cambiaría sale de la simulación: node tools/demo/demo.cjs limpiar (sin --ejecutar).
-- Misma regla de cuentas de prueba que pg_temp.es_cuenta_prueba en semilla-demo.sql y limpiar-demo.sql.
-- ============================================================================================================
with u as (
  select id, persona_personal_id, paciente_id from acceso.usuario
  where id::text not like 'de300000-%'
    and (lower(coalesce(correo, '')) ~ '^(prueba\.[a-z0-9._-]+|admin)@climesa\.com$'
      or lower(coalesce(correo, '')) ~ '^(prueba\.)?(adm|jop|dpd|rec|ast|enf|med|lab|par|pac)@example\.test$')),
p as (select persona_personal_id as id from u where persona_personal_id is not null),
k as (select paciente_id as id from u where paciente_id is not null),
filas(orden, tabla, demo, cuentas_prueba) as (
  select 1, 'acceso.usuario (cuentas de prueba, no se borran)', 0, (select count(*) from u)
  union all select 2, 'personal.turno',
    (select count(*) from personal.turno where id::text like 'de300000-%'),
    (select count(*) from personal.turno where id::text not like 'de300000-%' and persona_id in (select id from p))
  union all select 3, 'atencion.cita',
    (select count(*) from atencion.cita where id::text like 'de300000-%'),
    (select count(*) from atencion.cita where id::text not like 'de300000-%'
       and (medico_id in (select id from p) or creado_por in (select id from u) or paciente_id in (select id from k)))
  union all select 4, 'atencion.solicitud_cita',
    (select count(*) from atencion.solicitud_cita where id::text like 'de300000-%'),
    (select count(*) from atencion.solicitud_cita where id::text not like 'de300000-%'
       and (creado_por in (select id from u) or paciente_id in (select id from k)))
  union all select 5, 'atencion.reprogramacion',
    (select count(*) from atencion.reprogramacion where id::text like 'de300000-%'),
    (select count(*) from atencion.reprogramacion where id::text not like 'de300000-%' and solicitado_por in (select id from u))
  union all select 6, 'atencion.ticket_fila',
    (select count(*) from atencion.ticket_fila where id::text like 'de300000-%'),
    (select count(*) from atencion.ticket_fila where id::text not like 'de300000-%'
       and (emitido_por in (select id from u) or paciente_id in (select id from k)))
  union all select 7, 'atencion.consulta',
    (select count(*) from atencion.consulta where id::text like 'de300000-%'),
    (select count(*) from atencion.consulta where id::text not like 'de300000-%'
       and (medico_id in (select id from p) or paciente_id in (select id from k)))
  union all select 8, 'laboratorio.orden',
    (select count(*) from laboratorio.orden where id::text like 'de300000-%'),
    (select count(*) from laboratorio.orden where id::text not like 'de300000-%'
       and (medico_id in (select id from p) or paciente_id in (select id from k)))
  union all select 9, 'hospitalizacion.admision',
    (select count(*) from hospitalizacion.admision where id::text like 'de300000-%'),
    (select count(*) from hospitalizacion.admision where id::text not like 'de300000-%'
       and (creado_por in (select id from u) or medico_tratante_id in (select id from p) or paciente_id in (select id from k)))
  union all select 10, 'ambulancia.solicitud',
    (select count(*) from ambulancia.solicitud where id::text like 'de300000-%'),
    (select count(*) from ambulancia.solicitud where id::text not like 'de300000-%'
       and (registrada_por in (select id from u) or solicitante_usuario_id in (select id from u) or paciente_id in (select id from k)))
  union all select 11, 'ambulancia.servicio',
    (select count(*) from ambulancia.servicio where id::text like 'de300000-%'),
    (select count(*) from ambulancia.servicio s where s.id::text not like 'de300000-%'
       and (s.despachado_por in (select id from u) or s.paciente_id in (select id from k)
            or exists (select 1 from ambulancia.tripulacion t where t.servicio_id = s.id and t.persona_id in (select id from p))))
  union all select 12, 'ambulancia.cambio_estado',
    (select count(*) from ambulancia.cambio_estado where motivo like '[DEMO]%'), 0
  union all select 13, 'publico.aviso',
    (select count(*) from publico.aviso where id::text like 'de300000-%'),
    (select count(*) from publico.aviso where id::text not like 'de300000-%' and publicado_por in (select id from u))
  union all select 14, 'acceso.vinculacion_paciente',
    (select count(*) from acceso.vinculacion_paciente where id::text like 'de300000-%'),
    (select count(*) from acceso.vinculacion_paciente where id::text not like 'de300000-%' and usuario_id in (select id from u) and estado <> 'aprobada')
  union all select 15, 'infra.bloqueo_cama',
    (select count(*) from infra.bloqueo_cama where id::text like 'de300000-%'),
    (select count(*) from infra.bloqueo_cama where id::text not like 'de300000-%' and creado_por in (select id from u))
  union all select 16, 'pacientes.paciente',
    (select count(*) from pacientes.paciente where id::text like 'de300000-%'),
    (select count(*) from pacientes.paciente where id::text not like 'de300000-%' and creado_por in (select id from u))
  union all select 17, 'personal.persona',
    (select count(*) from personal.persona where id::text like 'de300000-%'), 0
  union all select 18, 'inventario.movimiento (no se borra lo de cuentas de prueba)',
    (select count(*) from inventario.movimiento where id::text like 'de300000-%'),
    (select count(*) from inventario.movimiento where id::text not like 'de300000-%' and autor_id in (select id from u))
  union all select 19, 'plataforma.auditoria (no se borra nunca)',
    (select count(*) from plataforma.auditoria where evento_id::text like 'de300000-%'), 0
)
select tabla, demo::int, cuentas_prueba::int from filas order by orden;
