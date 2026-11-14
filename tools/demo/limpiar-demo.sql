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
-- ============================================================================================================

begin;

create or replace function pg_temp.paciente_en_uso(p uuid) returns boolean language sql stable as $$
  select exists (select 1 from atencion.cita where paciente_id = p)
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

-- Estado previo de la unidad de ambulancia, guardado por la semilla en la bitácora.
create temp table unidad_previa on commit drop as
  select (select desde from ambulancia.cambio_estado where motivo like '[DEMO] Estado previo%' order by id limit 1) as estado;

-- ---------------------------------------------------------------------------------------------------------
-- 1. Ambulancia
-- ---------------------------------------------------------------------------------------------------------
delete from ambulancia.ubicacion where servicio_id::text like 'de300000-%';
delete from ambulancia.reporte_prehospital where servicio_id::text like 'de300000-%' or id::text like 'de300000-%';
delete from ambulancia.hito where servicio_id::text like 'de300000-%' or id::text like 'de300000-%';
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
delete from publico.aviso where id::text like 'de300000-%';

-- ---------------------------------------------------------------------------------------------------------
-- 3. Laboratorio
-- ---------------------------------------------------------------------------------------------------------
create temp table items_demo on commit drop as
  select id from laboratorio.orden_item where id::text like 'de300000-%' or orden_id::text like 'de300000-%';
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
-- Cita o número usados por una consulta real se conservan (la consulta real los referencia).
delete from atencion.ticket_fila t where t.id::text like 'de300000-%' and not exists (select 1 from atencion.consulta c where c.ticket_id = t.id);
delete from atencion.cita c where c.id::text like 'de300000-%' and not exists (select 1 from atencion.consulta k where k.cita_id = c.id);

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
-- 7. Infraestructura: bloqueos, limpiezas, equipo y espacios de la Planta 4 (hijos antes que padres)
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
delete from acceso.asignacion_rol where usuario_id::text like 'de300000-%';
delete from acceso.usuario where id::text like 'de300000-%';

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
