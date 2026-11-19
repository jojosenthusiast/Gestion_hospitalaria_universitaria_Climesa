-- ============================================================================================================
-- CLIMESA · Limpieza de los datos de demostración                                           tools/demo/
--
-- Quita exactamente lo que sembró semilla-demo.sql, en orden de dependencias, y deja la base como estaba.
-- Se ejecuta a mano con el rol dueño de las tablas (postgres en Supabase), nunca con sghu_api. Una sola
-- transacción: si algo falla, no se borra nada. Es idempotente.
--
-- IMPORTANTE (regla "nada clínico se borra", AGENTS.md regla 6 y constitución §3.2):
--   Esa regla protege los datos REALES. Este archivo solo toca filas demo, que se reconocen por el UUID fijo
--   de300000-... (o por "[DEMO]" en ambulancia.cambio_estado, que no tiene id propio). Aun así, la base impide
--   borrar lo firmado, así que la limpieza lo hace de forma explícita y acotada:
--     * atencion.diagnostico, receta, receta_item y signos_vitales tienen un disparador que prohíbe cambiar
--       los hijos de una consulta firmada. Las consultas demo firmadas no se pueden "reabrir", así que para borrar
--       esos hijos se DESACTIVAN esos cuatro disparadores dentro de la transacción (ALTER TABLE ... DISABLE
--       TRIGGER), se borran solo los hijos de consultas demo y se REACTIVAN en la misma transacción. Si la
--       limpieza falla, todo se revierte y los disparadores quedan activos. Nada más se desactiva.
--     * sghu_api no puede borrar esas tablas (REVOKE DELETE); este archivo corre con el rol dueño.
--     * plataforma.auditoria (solo inserción, encadenada por hash) NO se toca: los eventos de auditoría de
--       lecturas sobre pacientes demo quedan. Tampoco plataforma.outbox ni idempotencia.
--
-- Qué NO se borra, a propósito:
--   * Pacientes, personas de personal y espacios demo que ya tengan filas REALES que los usan (por ejemplo una
--     cita creada de verdad sobre un paciente demo): se conservan y la limpieza avisa con un NOTICE. Bórralos a
--     mano cuando ese uso termine, o vuelve a correr la limpieza.
--   * atencion.contador_fila: los números de fila ya emitidos no se reutilizan (quedan huecos en la numeración).
--   * La vinculación de las cuentas de prueba a una persona demo (solo cuando la cuenta no tenía persona) se
--     deshace; la cuenta no se borra ni se modifica de otro modo.
--
-- Lote 5 (S17): la sección 0 borra además lo que crearon las cuentas de prueba (ver su cabecera).
--
-- CONFIRMACIÓN OBLIGATORIA: este archivo borra datos. Solo corre si antes, en la misma sesión, se ejecuta
--   set demo.confirmar = 'limpiar';
-- tools/demo/demo.cjs lo hace solo con «limpiar --ejecutar» o «reiniciar --ejecutar». Sin esa marca se detiene sin
-- borrar nada. Para ver antes qué cambiaría: node tools/demo/demo.cjs limpiar (simulación, deshace todo al final).
-- ============================================================================================================

begin;

do $$ begin
  if coalesce(current_setting('demo.confirmar', true), '') <> 'limpiar' then
    raise exception 'limpiar-demo.sql borra datos: ejecuta antes  set demo.confirmar = ''limpiar'';  o usa  node tools/demo/demo.cjs limpiar --ejecutar';
  end if;
end $$;

-- Misma regla de cuentas de prueba que semilla-demo.sql.
create or replace function pg_temp.es_cuenta_prueba(correo text) returns boolean language sql immutable as
$$ select lower(coalesce(correo, '')) ~ '^(prueba\.[a-z0-9._-]+|admin)@climesa\.com$'
       or lower(coalesce(correo, '')) ~ '^(prueba\.)?(adm|jop|dpd|rec|ast|enf|med|lab|par|pac)@example\.test$' $$;

create or replace function pg_temp.paciente_en_uso(p uuid) returns boolean language sql stable as $$
  select exists (select 1 from atencion.cita where paciente_id = p)
      or exists (select 1 from atencion.solicitud_cita where paciente_id = p)
      or exists (select 1 from atencion.ticket_fila where paciente_id = p)
      or exists (select 1 from atencion.consulta where paciente_id = p)
      or exists (select 1 from atencion.signos_vitales where paciente_id = p)
      or exists (select 1 from atencion.relacion_atencion where paciente_id = p)
      or exists (select 1 from laboratorio.orden where paciente_id = p)
      or exists (select 1 from hospitalizacion.admision where paciente_id = p)
      or exists (select 1 from ambulancia.servicio where paciente_id = p)
      or exists (select 1 from ambulancia.solicitud where paciente_id = p)
      or exists (select 1 from inventario.movimiento where paciente_id = p)
      or exists (select 1 from acceso.usuario where paciente_id = p)
      or exists (select 1 from acceso.vinculacion_paciente where paciente_candidato_id = p)
      or exists (select 1 from acceso.acceso_excepcional where paciente_id = p)
      or exists (select 1 from pacientes.caso_duplicado where p = any (pacientes_ids) and id::text not like 'de300000-%') $$;

create or replace function pg_temp.persona_en_uso(p uuid) returns boolean language sql stable as $$
  select exists (select 1 from personal.turno where persona_id = p)
      or exists (select 1 from personal.inscripcion where persona_id = p and id::text not like 'de300000-%')
      or exists (select 1 from atencion.cita where medico_id = p)
      or exists (select 1 from atencion.solicitud_cita where medico_preferido_id = p)
      or exists (select 1 from atencion.consulta where medico_id = p)
      or exists (select 1 from atencion.relacion_atencion where profesional_id = p)
      or exists (select 1 from laboratorio.orden where medico_id = p)
      or exists (select 1 from hospitalizacion.admision where medico_tratante_id = p)
      or exists (select 1 from ambulancia.tripulacion where persona_id = p)
      or exists (select 1 from acceso.usuario where persona_personal_id = p) $$;

create or replace function pg_temp.espacio_en_uso(e uuid) returns boolean language sql stable as $$
  select exists (select 1 from infra.espacio where padre_id = e)
      or exists (select 1 from hospitalizacion.ocupacion_cama where cama_id = e or habitacion_id = e)
      or exists (select 1 from hospitalizacion.reserva_cama where cama_id = e)
      or exists (select 1 from inventario.existencia where bodega_id = e)
      or exists (select 1 from personal.turno where area_id = e)
      or exists (select 1 from personal.persona where area_id = e)
      or exists (select 1 from infra.equipo where espacio_id = e)
      or exists (select 1 from infra.limpieza_cama where cama_id = e)
      or exists (select 1 from infra.bloqueo_cama where cama_id = e)
      or exists (select 1 from atencion.ticket_fila where consultorio_id = e) $$;

-- ---------------------------------------------------------------------------------------------------------
-- 0. Datos que crearon las cuentas de prueba (Lote 5, S17)
--    Cuentas de prueba: prueba.<algo>@climesa.com, admin@climesa.com (y <rol>@example.test en pruebas locales); la
--    misma regla que en semilla-demo.sql y conteo-demo.sql. Las cuentas NO se borran ni cambian, salvo que la cuenta PAC
--    de prueba se separa de su expediente. Se borra lo que esas cuentas crearon o atienden al probar, cuando su id no es
--    demo (lo demo sale en las secciones 1 a 8):
--      * turnos de las personas de personal de las cuentas de prueba;
--      * citas creadas por ellas o de su médico, solicitudes por categoría y números de fila emitidos por ellas, y todo
--        lo del expediente unido a la cuenta PAC de prueba;
--      * consultas de su médico (con diagnósticos, recetas, signos y addendum), órdenes de laboratorio de su médico o de
--        esas consultas, admisiones que crearon o que atiende su médico (con camas, traslados, altas y notas), servicios
--        de ambulancia que despacharon o en los que fue su paramédico, solicitudes de ambulancia que registraron;
--      * avisos que publicaron, «Enterado» que marcaron, solicitudes de vinculación no aprobadas, bloqueos de cama que
--        crearon, limpiezas pendientes de camas de esas admisiones, casos de duplicado que abrieron, y los expedientes
--        que crearon si ya nada los usa.
--    Se conserva (lo dice un NOTICE): una cita o número que una consulta de otra cuenta usa. No se tocan inventario
--    (los movimientos ya cambiaron las existencias), invitaciones, plantillas de turnos ni la auditoría.
-- ---------------------------------------------------------------------------------------------------------
create temp table cp_usuario on commit drop as
  select id from acceso.usuario where id::text not like 'de300000-%' and pg_temp.es_cuenta_prueba(correo);
create temp table cp_persona on commit drop as
  select distinct persona_personal_id as id from acceso.usuario where id in (select id from cp_usuario) and persona_personal_id is not null;
create temp table cp_paciente on commit drop as
  select distinct paciente_id as id from acceso.usuario where id in (select id from cp_usuario) and paciente_id is not null;

create temp table cp_consulta on commit drop as
  select id from atencion.consulta where id::text not like 'de300000-%'
    and (medico_id in (select id from cp_persona) or paciente_id in (select id from cp_paciente));
create temp table cp_cita on commit drop as
  select id from atencion.cita where id::text not like 'de300000-%'
    and (medico_id in (select id from cp_persona) or creado_por in (select id from cp_usuario) or paciente_id in (select id from cp_paciente));
create temp table cp_ticket on commit drop as
  select id from atencion.ticket_fila where id::text not like 'de300000-%'
    and (emitido_por in (select id from cp_usuario) or paciente_id in (select id from cp_paciente));
create temp table cp_solicitud on commit drop as
  select id from atencion.solicitud_cita where id::text not like 'de300000-%'
    and (creado_por in (select id from cp_usuario) or paciente_id in (select id from cp_paciente));
create temp table cp_servicio on commit drop as
  select s.id from ambulancia.servicio s where s.id::text not like 'de300000-%'
    and (s.despachado_por in (select id from cp_usuario) or s.paciente_id in (select id from cp_paciente)
         or exists (select 1 from ambulancia.tripulacion t where t.servicio_id = s.id and t.persona_id in (select id from cp_persona)));
create temp table cp_solicitud_amb on commit drop as
  select id from ambulancia.solicitud where id::text not like 'de300000-%'
    and (registrada_por in (select id from cp_usuario) or solicitante_usuario_id in (select id from cp_usuario) or paciente_id in (select id from cp_paciente));
create temp table cp_admision on commit drop as
  select id from hospitalizacion.admision where id::text not like 'de300000-%'
    and (creado_por in (select id from cp_usuario) or medico_tratante_id in (select id from cp_persona) or paciente_id in (select id from cp_paciente)
         or (origen = 'consulta' and origen_id in (select id from cp_consulta)) or (origen = 'cita' and origen_id in (select id from cp_cita))
         or (origen = 'emergencia' and origen_id in (select id from cp_ticket)) or (origen = 'ambulancia' and origen_id in (select id from cp_servicio)));
create temp table cp_orden on commit drop as
  select id from laboratorio.orden where id::text not like 'de300000-%'
    and (medico_id in (select id from cp_persona) or paciente_id in (select id from cp_paciente)
         or consulta_id in (select id from cp_consulta) or admision_id in (select id from cp_admision));

-- Lo que otra cuenta todavía usa se queda (llaves foráneas reales): citas y números de una consulta ajena, citas de una
-- solicitud, número, reprogramación, propuesta o cita reprogramada ajenas, y solicitudes de un servicio ajeno.
delete from cp_cita c where exists (select 1 from atencion.consulta k where k.cita_id = c.id and k.id not in (select id from cp_consulta))
  or exists (select 1 from atencion.solicitud_cita s where s.cita_id = c.id and s.id not in (select id from cp_solicitud))
  or exists (select 1 from atencion.ticket_fila t where t.cita_id = c.id and t.id not in (select id from cp_ticket))
  or exists (select 1 from laboratorio.propuesta_cita p where p.cita_id = c.id and p.orden_id not in (select id from cp_orden))
  or exists (select 1 from atencion.cita o where o.reprogramada_de = c.id and o.id not in (select id from cp_cita));
delete from cp_ticket t where exists (select 1 from atencion.consulta k where k.ticket_id = t.id and k.id not in (select id from cp_consulta));
delete from cp_solicitud_amb a where exists (select 1 from ambulancia.servicio s where s.solicitud_id = a.id and s.id not in (select id from cp_servicio));

-- 0.1 Ambulancia
delete from ambulancia.ubicacion where servicio_id in (select id from cp_servicio);
delete from ambulancia.reporte_prehospital where servicio_id in (select id from cp_servicio);
do $$ begin
  if to_regclass('ambulancia.hito_anulado') is not null then
    execute 'delete from ambulancia.hito_anulado where servicio_id in (select id from cp_servicio)';
  end if;
  if exists (select 1 from pg_trigger where tgrelid = 'ambulancia.hito'::regclass and tgname = 'hito_borrado_guardia') then
    execute 'alter table ambulancia.hito disable trigger hito_borrado_guardia';
  end if;
end $$;
delete from ambulancia.hito where servicio_id in (select id from cp_servicio);
do $$ begin
  if exists (select 1 from pg_trigger where tgrelid = 'ambulancia.hito'::regclass and tgname = 'hito_borrado_guardia') then
    execute 'alter table ambulancia.hito enable trigger hito_borrado_guardia';
  end if;
end $$;
delete from ambulancia.tripulacion where servicio_id in (select id from cp_servicio);
delete from ambulancia.servicio where id in (select id from cp_servicio);
delete from ambulancia.solicitud where id in (select id from cp_solicitud_amb);
-- Si el servicio activo era de una cuenta de prueba, la unidad queda disponible (sin servicio no puede seguir En Servicio).
update ambulancia.unidad u set estado = 'disponible', version = u.version + 1
where u.estado = 'en_servicio' and not exists (select 1 from ambulancia.servicio s where s.unidad_id = u.id and s.finalizado_en is null);

-- 0.2 Laboratorio
delete from laboratorio.adjunto where orden_id in (select id from cp_orden);
delete from laboratorio.pendiente_medico where orden_id in (select id from cp_orden);
delete from laboratorio.propuesta_cita where orden_id in (select id from cp_orden);
delete from laboratorio.resultado_historial where orden_item_id in (select i.id from laboratorio.orden_item i where i.orden_id in (select id from cp_orden));
delete from laboratorio.resultado where orden_item_id in (select i.id from laboratorio.orden_item i where i.orden_id in (select id from cp_orden));
delete from laboratorio.orden_item where orden_id in (select id from cp_orden);
delete from laboratorio.orden where id in (select id from cp_orden);

-- 0.3 Hospitalización y camas
delete from infra.limpieza_cama l where l.id::text not like 'de300000-%' and l.verificada_en is null
  and l.cama_id in (select o.cama_id from hospitalizacion.ocupacion_cama o where o.admision_id in (select id from cp_admision));
delete from hospitalizacion.nota_enfermeria where admision_id in (select id from cp_admision);
delete from hospitalizacion.alta where admision_id in (select id from cp_admision);
delete from hospitalizacion.cambio_tratante where admision_id in (select id from cp_admision);
delete from hospitalizacion.traslado where admision_id in (select id from cp_admision);
delete from hospitalizacion.reserva_cama where admision_id in (select id from cp_admision);
delete from hospitalizacion.ocupacion_cama where admision_id in (select id from cp_admision);
delete from hospitalizacion.admision where id in (select id from cp_admision);
delete from infra.bloqueo_cama where id::text not like 'de300000-%' and creado_por in (select id from cp_usuario);

-- 0.4 Atención clínica (los cuatro disparadores *_consulta_abierta se desactivan solo aquí, como en la sección 5)
alter table atencion.diagnostico disable trigger diagnostico_consulta_abierta;
alter table atencion.receta disable trigger receta_consulta_abierta;
alter table atencion.receta_item disable trigger receta_item_consulta_abierta;
alter table atencion.signos_vitales disable trigger signos_consulta_abierta;
delete from atencion.diagnostico where consulta_id in (select id from cp_consulta);
delete from atencion.receta_item where receta_id in (select id from atencion.receta where consulta_id in (select id from cp_consulta));
delete from atencion.receta where consulta_id in (select id from cp_consulta);
delete from atencion.signos_vitales where id::text not like 'de300000-%'
  and (consulta_id in (select id from cp_consulta) or admision_id in (select id from cp_admision));
alter table atencion.diagnostico enable trigger diagnostico_consulta_abierta;
alter table atencion.receta enable trigger receta_consulta_abierta;
alter table atencion.receta_item enable trigger receta_item_consulta_abierta;
alter table atencion.signos_vitales enable trigger signos_consulta_abierta;
delete from atencion.addendum where consulta_id in (select id from cp_consulta);
delete from atencion.relacion_atencion where id::text not like 'de300000-%'
  and (origen_id in (select id from cp_consulta union select id from cp_admision) or profesional_id in (select id from cp_persona));
delete from atencion.consulta where id in (select id from cp_consulta);
delete from atencion.reprogramacion where id::text not like 'de300000-%'
  and (cita_id in (select id from cp_cita) or cita_nueva_id in (select id from cp_cita) or solicitado_por in (select id from cp_usuario));
delete from atencion.solicitud_cita where id in (select id from cp_solicitud);
delete from atencion.ticket_fila where id in (select id from cp_ticket);
delete from atencion.cita where id in (select id from cp_cita);

-- 0.5 Turnos, avisos, vinculaciones y duplicados
delete from personal.turno where id::text not like 'de300000-%' and persona_id in (select id from cp_persona);
delete from publico.aviso_enterado where usuario_id in (select id from cp_usuario)
  or aviso_id in (select id from publico.aviso where id::text not like 'de300000-%' and publicado_por in (select id from cp_usuario));
delete from publico.aviso where id::text not like 'de300000-%' and publicado_por in (select id from cp_usuario);
delete from acceso.vinculacion_paciente where id::text not like 'de300000-%' and usuario_id in (select id from cp_usuario) and estado <> 'aprobada';
delete from pacientes.caso_duplicado where id::text not like 'de300000-%' and abierto_por in (select id from cp_usuario);

-- 0.6 La cuenta PAC de prueba se separa de su expediente (la semilla la une a la paciente demo 4) y se borran los
--     expedientes que crearon las cuentas de prueba, si ya ningún dato los usa.
update acceso.usuario set paciente_id = null, version = version + 1 where id in (select id from cp_usuario) and paciente_id is not null;
create temp table cp_paciente_borrar on commit drop as
  select id from pacientes.paciente where id::text not like 'de300000-%' and creado_por in (select id from cp_usuario)
    and not pg_temp.paciente_en_uso(id);
delete from pacientes.caso_duplicado where pacientes_ids && array(select id from cp_paciente_borrar);
delete from pacientes.historial_demografico where paciente_id in (select id from cp_paciente_borrar);
delete from pacientes.identificador where paciente_id in (select id from cp_paciente_borrar);
delete from pacientes.paciente where id in (select id from cp_paciente_borrar);

do $$
declare
  v_citas int := (select count(*) from atencion.cita c where c.id::text not like 'de300000-%'
                    and (c.medico_id in (select id from cp_persona) or c.creado_por in (select id from cp_usuario)));
begin
  if v_citas > 0 then
    raise notice 'Se conservaron % cita(s) de cuentas de prueba porque una consulta, número o solicitud de otra cuenta las usa.', v_citas;
  end if;
end $$;

-- Estado previo de la unidad de ambulancia, guardado por la semilla en la bitácora.
create temp table unidad_previa on commit drop as
  select (select desde from ambulancia.cambio_estado where motivo like '[DEMO] Estado previo%' order by id limit 1) as estado;

-- ---------------------------------------------------------------------------------------------------------
-- 1. Ambulancia
-- ---------------------------------------------------------------------------------------------------------
delete from ambulancia.ubicacion where servicio_id::text like 'de300000-%';
delete from ambulancia.reporte_prehospital where servicio_id::text like 'de300000-%' or id::text like 'de300000-%';
-- R7 G-4: `hito_borrado_guardia` (20261126002100) blocks deleting milestones of finished services, and
-- `hito_anulado` (20261126002000) keeps undone milestones. Only demo services are touched: the guard is disabled
-- inside this transaction and enabled again right after. Both steps are skipped on a base without those migrations.
do $$ begin
  if to_regclass('ambulancia.hito_anulado') is not null then
    execute $q$delete from ambulancia.hito_anulado where servicio_id::text like 'de300000-%'$q$;
  end if;
  if exists (select 1 from pg_trigger where tgrelid = 'ambulancia.hito'::regclass and tgname = 'hito_borrado_guardia') then
    execute 'alter table ambulancia.hito disable trigger hito_borrado_guardia';
  end if;
end $$;
delete from ambulancia.hito where servicio_id::text like 'de300000-%' or id::text like 'de300000-%';
do $$ begin
  if exists (select 1 from pg_trigger where tgrelid = 'ambulancia.hito'::regclass and tgname = 'hito_borrado_guardia') then
    execute 'alter table ambulancia.hito enable trigger hito_borrado_guardia';
  end if;
end $$;
delete from ambulancia.tripulacion where servicio_id::text like 'de300000-%';
delete from ambulancia.servicio where id::text like 'de300000-%';
delete from ambulancia.solicitud s where s.id::text like 'de300000-%' and not exists (select 1 from ambulancia.servicio v where v.solicitud_id = s.id);
-- La unidad vuelve al estado que tenía antes de la demostración (solo si ya no tiene servicio activo).
update ambulancia.unidad u set estado = p.estado
from unidad_previa p
where p.estado is not null and u.estado = 'en_servicio'
  and not exists (select 1 from ambulancia.servicio s where s.unidad_id = u.id and s.finalizado_en is null);
delete from ambulancia.cambio_estado where motivo like '[DEMO]%';

-- ---------------------------------------------------------------------------------------------------------
-- 2. Inventario y avisos
-- ---------------------------------------------------------------------------------------------------------
delete from inventario.movimiento where id::text like 'de300000-%' or lote_id::text like 'de300000-%';
delete from inventario.existencia where lote_id::text like 'de300000-%';
delete from inventario.lote where id::text like 'de300000-%';
delete from inventario.articulo a where a.id::text like 'de300000-%' and not exists (select 1 from inventario.lote l where l.articulo_id = a.id);
-- "Enterado" y recordatorios (Fase 2, S11) sobre avisos demo, de cualquier cuenta: van antes que el aviso (llave foránea).
delete from publico.aviso_enterado where aviso_id::text like 'de300000-%';
delete from publico.aviso where id::text like 'de300000-%';

-- ---------------------------------------------------------------------------------------------------------
-- 3. Laboratorio
-- ---------------------------------------------------------------------------------------------------------
create temp table items_demo on commit drop as
  select id from laboratorio.orden_item where id::text like 'de300000-%' or orden_id::text like 'de300000-%';
-- Fase 2, flujo C (S10): referencias de informes externos, pendientes del médico y citas propuestas de órdenes demo.
-- T07b: la semilla no crea archivos, pero si alguien subió uno a un adjunto demo, el objeto vive en el bucket privado
-- laboratorio-adjuntos (carpeta <orden_id>/) y este SQL no puede borrarlo: se avisa para retirarlo a mano en Storage.
do $$
declare guardados int;
begin
  select count(*) into guardados from laboratorio.adjunto where orden_id::text like 'de300000-%' and ruta_almacenamiento is not null;
  if guardados > 0 then
    raise notice 'Hay % archivo(s) de adjuntos demo en el bucket laboratorio-adjuntos (carpetas de300000-...): retíralos a mano en Supabase Storage.', guardados;
  end if;
end $$;
delete from laboratorio.adjunto where orden_id::text like 'de300000-%';
delete from laboratorio.pendiente_medico where orden_id::text like 'de300000-%';
delete from laboratorio.propuesta_cita where orden_id::text like 'de300000-%';
delete from laboratorio.resultado_historial where orden_item_id in (select id from items_demo);
delete from laboratorio.resultado where orden_item_id in (select id from items_demo);
delete from laboratorio.orden_item where id in (select id from items_demo);
delete from laboratorio.orden where id::text like 'de300000-%';

-- ---------------------------------------------------------------------------------------------------------
-- 4. Hospitalización (traslado antes que las ocupaciones que referencia)
-- ---------------------------------------------------------------------------------------------------------
delete from hospitalizacion.nota_enfermeria where admision_id::text like 'de300000-%' or id::text like 'de300000-%';
delete from hospitalizacion.alta where admision_id::text like 'de300000-%';
delete from hospitalizacion.traslado where admision_id::text like 'de300000-%' or id::text like 'de300000-%';
delete from hospitalizacion.reserva_cama where admision_id::text like 'de300000-%' or id::text like 'de300000-%';
delete from hospitalizacion.ocupacion_cama where admision_id::text like 'de300000-%' or id::text like 'de300000-%';
delete from hospitalizacion.admision where id::text like 'de300000-%';

-- ---------------------------------------------------------------------------------------------------------
-- 5. Atención clínica
--    Los cuatro disparadores *_consulta_abierta impiden tocar los hijos de una consulta firmada. Se desactivan
--    solo aquí, solo para borrar hijos de consultas demo, y se reactivan antes de seguir (misma transacción).
-- ---------------------------------------------------------------------------------------------------------
alter table atencion.diagnostico disable trigger diagnostico_consulta_abierta;
alter table atencion.receta disable trigger receta_consulta_abierta;
alter table atencion.receta_item disable trigger receta_item_consulta_abierta;
alter table atencion.signos_vitales disable trigger signos_consulta_abierta;

delete from atencion.diagnostico where consulta_id::text like 'de300000-%' or id::text like 'de300000-%';
delete from atencion.receta_item where id::text like 'de300000-%'
  or receta_id in (select id from atencion.receta where consulta_id::text like 'de300000-%' or id::text like 'de300000-%');
delete from atencion.receta where consulta_id::text like 'de300000-%' or id::text like 'de300000-%';
delete from atencion.signos_vitales where id::text like 'de300000-%' or consulta_id::text like 'de300000-%' or admision_id::text like 'de300000-%';

alter table atencion.diagnostico enable trigger diagnostico_consulta_abierta;
alter table atencion.receta enable trigger receta_consulta_abierta;
alter table atencion.receta_item enable trigger receta_item_consulta_abierta;
alter table atencion.signos_vitales enable trigger signos_consulta_abierta;

delete from atencion.addendum where id::text like 'de300000-%' or consulta_id::text like 'de300000-%';
delete from atencion.relacion_atencion where id::text like 'de300000-%' or origen_id::text like 'de300000-%';
delete from atencion.consulta where id::text like 'de300000-%';
-- Solicitudes de cita por categoría demo (S6) antes que sus citas asignadas. Las solicitudes reales se quedan, aunque
-- sean de un paciente demo o prefieran a un médico demo (esos se conservan con el NOTICE de abajo).
delete from atencion.solicitud_cita where id::text like 'de300000-%';
-- Lote 5: reprogramaciones demo o sobre citas demo (las de otras cuentas sobre citas demo también: la cita se va).
delete from atencion.reprogramacion where id::text like 'de300000-%' or cita_id::text like 'de300000-%' or cita_nueva_id::text like 'de300000-%';
-- Cita o número usados por una consulta real se conservan (la consulta real los referencia); igual una cita que asignó una
-- solicitud por motivo (atencion.solicitud_cita.cita_id).
delete from atencion.ticket_fila t where t.id::text like 'de300000-%' and not exists (select 1 from atencion.consulta c where c.ticket_id = t.id);
-- Una cita demo enlazada a una propuesta de seguimiento real (orden real) también se conserva: la propuesta confirmada la exige.
delete from atencion.cita c where c.id::text like 'de300000-%' and not exists (select 1 from atencion.consulta k where k.cita_id = c.id)
  and not exists (select 1 from atencion.solicitud_cita s where s.cita_id = c.id)
  and not exists (select 1 from laboratorio.propuesta_cita p where p.cita_id = c.id);

-- ---------------------------------------------------------------------------------------------------------
-- 6. Personal: turnos, inscripciones, vínculo de las cuentas de prueba y personas demo sin uso real
-- ---------------------------------------------------------------------------------------------------------
delete from personal.turno where id::text like 'de300000-%';
delete from personal.inscripcion where id::text like 'de300000-%';
-- Solo las personas que la semilla creó para las cuentas de prueba (idx 20 a 25) se desvinculan.
update acceso.usuario set persona_personal_id = null
where persona_personal_id in (select ('de300000-0002-4000-8000-' || lpad(n::text, 12, '0'))::uuid from generate_series(20, 25) n);

create temp table personas_sobran on commit drop as
  select id from personal.persona where id::text like 'de300000-%' and pg_temp.persona_en_uso(id);
delete from personal.persona p where p.id::text like 'de300000-%' and p.id not in (select id from personas_sobran);

-- ---------------------------------------------------------------------------------------------------------
-- 7. Infraestructura: bloqueos, limpiezas, equipo y espacios demo (hijos antes que padres). La semilla actual ya no crea la Planta 4 (BL-01); esto también borra la de una semilla anterior.
-- ---------------------------------------------------------------------------------------------------------
delete from infra.limpieza_cama where id::text like 'de300000-%' or cama_id::text like 'de300000-%';
delete from infra.bloqueo_cama where id::text like 'de300000-%' or cama_id::text like 'de300000-%';
delete from infra.equipo where id::text like 'de300000-%';

do $$
declare
  v_borradas int;
begin
  loop
    delete from infra.espacio e where e.id::text like 'de300000-%' and not pg_temp.espacio_en_uso(e.id);
    get diagnostics v_borradas = row_count;
    exit when v_borradas = 0;
  end loop;
end $$;

-- ---------------------------------------------------------------------------------------------------------
-- 7b. Cuentas demo de solicitudes e invitaciones (filas de acceso.usuario sin usuario en Supabase Auth)
-- ---------------------------------------------------------------------------------------------------------
delete from acceso.invitacion where id::text like 'de300000-%' or usuario_id::text like 'de300000-%';
delete from acceso.vinculacion_paciente where id::text like 'de300000-%' or usuario_id::text like 'de300000-%';
delete from publico.aviso_enterado where usuario_id::text like 'de300000-%';
delete from acceso.asignacion_rol where usuario_id::text like 'de300000-%';
delete from acceso.usuario where id::text like 'de300000-%';
-- Lote 5: la cuenta PAC de prueba unida a la paciente demo se separa (la ficha demo se borra abajo).
update acceso.usuario set paciente_id = null, version = version + 1
where paciente_id::text like 'de300000-%' and id::text not like 'de300000-%' and pg_temp.es_cuenta_prueba(correo);

-- ---------------------------------------------------------------------------------------------------------
-- 8. Pacientes: solo los que ningún dato real usa; sus hijos salen con ellos
-- ---------------------------------------------------------------------------------------------------------
create temp table pacientes_sobran on commit drop as
  select id from pacientes.paciente where id::text like 'de300000-%' and pg_temp.paciente_en_uso(id);
create temp table pacientes_borrar on commit drop as
  select id from pacientes.paciente where id::text like 'de300000-%' and id not in (select id from pacientes_sobran);

delete from pacientes.caso_duplicado where id::text like 'de300000-%' or pacientes_ids && array(select id from pacientes_borrar);
delete from pacientes.historial_demografico where paciente_id in (select id from pacientes_borrar);
delete from pacientes.identificador where paciente_id in (select id from pacientes_borrar);
delete from pacientes.paciente where id in (select id from pacientes_borrar);

do $$
declare
  v_pac int := (select count(*) from pacientes_sobran);
  v_per int := (select count(*) from personas_sobran);
  v_esp int := (select count(*) from infra.espacio where id::text like 'de300000-%');
begin
  if v_pac + v_per + v_esp > 0 then
    raise notice 'Se conservaron % paciente(s), % persona(s) de personal y % espacio(s) demo porque datos reales los usan. Bórralos a mano cuando ese uso termine.', v_pac, v_per, v_esp;
  end if;
end $$;

commit;
