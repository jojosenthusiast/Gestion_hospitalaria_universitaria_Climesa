-- Pruebas de invariantes de la base (spec 130). Cada bloque debe imprimir OK; cualquier fallo aborta.
\set ON_ERROR_STOP 1
-- Inicializa el esquema temporal de la sesión antes de crear su función auxiliar.
create temporary table sghu_invariantes_contexto (id integer);
create or replace function pg_temp.espera_error(sql text, codigo text) returns text language plpgsql as $$
begin
  execute sql;
  raise exception 'FALLO: se esperaba error % y no hubo', codigo;
exception when others then
  if sqlerrm like '%' || codigo || '%' or sqlstate = codigo then return 'OK ' || codigo; end if;
  raise exception 'FALLO: se esperaba % y llegó % (%)', codigo, sqlerrm, sqlstate;
end $$;

-- Datos auxiliares
insert into pacientes.paciente (id, expediente, nombres, primer_apellido, sexo, precision_nacimiento, nacimiento)
values ('00000000-0000-0000-0000-0000000000a1', 'EXP-T1', 'Ana', 'Prueba', 'femenino', 'exacta', '1990-01-01'),
       ('00000000-0000-0000-0000-0000000000a2', 'EXP-T2', 'Berta', 'Prueba', 'femenino', 'exacta', '1985-01-01'),
       ('00000000-0000-0000-0000-0000000000a3', 'EXP-T3', 'Carlos', 'Prueba', 'masculino', 'exacta', '1980-01-01');
insert into hospitalizacion.admision (id, paciente_id, origen, origen_id, categoria_pedida, sexo_paciente, medico_tratante_id)
values ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a1', 'emergencia', gen_random_uuid(), 'semiprivada', 'femenino', gen_random_uuid()),
       ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000a2', 'emergencia', gen_random_uuid(), 'semiprivada', 'femenino', gen_random_uuid()),
       ('00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-0000000000a3', 'emergencia', gen_random_uuid(), 'vip', 'masculino', gen_random_uuid());

-- 1. Cama exclusiva (RN-02)
insert into hospitalizacion.ocupacion_cama (admision_id, cama_id, habitacion_id, categoria, periodo)
select '00000000-0000-0000-0000-0000000000b1', c.id, c.padre_id, 'semiprivada', tstzrange(now() - interval '1 hour', null)
from infra.espacio c where c.codigo = 'HAB-203-A';
select pg_temp.espera_error($$insert into hospitalizacion.ocupacion_cama (admision_id, cama_id, habitacion_id, categoria, periodo)
  select '00000000-0000-0000-0000-0000000000b2', c.id, c.padre_id, 'semiprivada', tstzrange(now(), null) from infra.espacio c where c.codigo = 'HAB-203-A'$$, '23P01');
select case when (select estado from infra.v_estado_cama where codigo = 'HAB-203-A') = 'ocupada' then 'OK estado ocupada' else 'FALLO estado' end;

-- 2. Capacidad de habitación (FR-104-03)
select pg_temp.espera_error($$insert into infra.espacio (padre_id, tipo, codigo, nombre) select id, 'cama', 'HAB-201-C', 'Cama C' from infra.espacio where codigo = 'HAB-201'$$, 'capacidad_excedida');
select pg_temp.espera_error($$update infra.espacio set capacidad = 1 where codigo = 'HAB-201'$$, 'capacidad_menor_que_camas');
-- 3. Ciclo en el árbol
select pg_temp.espera_error($$update infra.espacio set padre_id = (select id from infra.espacio where codigo = 'P2-HOS') where codigo = 'P2'$$, 'ciclo_en_arbol');
-- 4. Ruta recursiva
select case when infra.ruta((select id from infra.espacio where codigo = 'HAB-203-B')) = 'Planta 2 > Hospitalización semiprivada > HAB-203 > Cama B'
  then 'OK ruta' else 'FALLO ruta: ' || infra.ruta((select id from infra.espacio where codigo = 'HAB-203-B')) end;

-- 5. Traslado VIP prohibido (D-037)
insert into hospitalizacion.ocupacion_cama (id, admision_id, cama_id, habitacion_id, categoria, periodo)
select '00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000b3', c.id, c.padre_id, 'vip', tstzrange(now() - interval '1 hour', now())
from infra.espacio c where c.codigo = 'VIP-302-A';
insert into hospitalizacion.ocupacion_cama (id, admision_id, cama_id, habitacion_id, categoria, periodo)
select '00000000-0000-0000-0000-0000000000c4', '00000000-0000-0000-0000-0000000000b3', c.id, c.padre_id, 'vip', tstzrange(now(), null)
from infra.espacio c where c.codigo = 'VIP-303-A';
select pg_temp.espera_error($$insert into hospitalizacion.traslado (admision_id, ocupacion_origen_id, ocupacion_destino_id, motivo, realizado_por)
  values ('00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000c4', 'prueba', gen_random_uuid())$$, 'vip_no_se_traslada');
-- 6. Admisión activa única (RN-10)
select pg_temp.espera_error($$insert into hospitalizacion.admision (paciente_id, origen, origen_id, categoria_pedida, sexo_paciente, medico_tratante_id)
  values ('00000000-0000-0000-0000-0000000000a1', 'consulta', gen_random_uuid(), 'vip', 'femenino', gen_random_uuid())$$, '23505');

-- 7. DUI exclusivo
insert into pacientes.identificador (paciente_id, tipo, emisor, valor_original, valor_normalizado, exclusivo)
values ('00000000-0000-0000-0000-0000000000a1', 'dui', 'RNPN', '01234567-8', '012345678', true);
select pg_temp.espera_error($$insert into pacientes.identificador (paciente_id, tipo, emisor, valor_original, valor_normalizado, exclusivo)
  values ('00000000-0000-0000-0000-0000000000a2', 'dui', 'RNPN', '01234567-8', '012345678', true)$$, '23505');
-- 8. Fecha estimada sin edad estimada (D-004)
select pg_temp.espera_error($$insert into pacientes.paciente (expediente, sexo, precision_nacimiento) values ('EXP-T9', 'masculino', 'estimada')$$, '23514');

-- 9. Turnos sin traslape (RN-12)
insert into personal.turno (persona_id, area_id, periodo, tipo)
select id, area_id, tstzrange('2026-11-02 07:00-06', '2026-11-02 15:00-06'), 'diurno' from personal.persona where apellidos = 'López Mejía';
select pg_temp.espera_error($$insert into personal.turno (persona_id, area_id, periodo, tipo)
  select id, area_id, tstzrange('2026-11-02 14:00-06', '2026-11-02 22:00-06'), 'diurno' from personal.persona where apellidos = 'López Mejía'$$, '23P01');
select pg_temp.espera_error($$insert into personal.turno (persona_id, area_id, periodo, tipo)
  select id, area_id, tstzrange('2026-11-03 07:00-06', '2026-11-03 09:00-06'), 'diurno' from personal.persona where apellidos = 'López Mejía'$$, '23514');

-- 10. Número de fila sin huecos
select case when atencion.emitir_numero('consulta_general', '2026-11-02') = 1 and atencion.emitir_numero('consulta_general', '2026-11-02') = 2
  and atencion.emitir_numero('consulta_general', '2026-11-03') = 1 then 'OK fila' else 'FALLO fila' end;

-- 11. Laboratorio: panel recursivo, ciclo y transiciones
select case when (select count(*) from laboratorio.hojas((select id from laboratorio.examen where codigo = 'PRENATAL'))) = 7
  then 'OK hojas prenatal' else 'FALLO hojas: ' || (select count(*) from laboratorio.hojas((select id from laboratorio.examen where codigo = 'PRENATAL'))) end;
select pg_temp.espera_error($$insert into laboratorio.examen_componente (panel_id, componente_id) select h.id, p.id from laboratorio.examen h, laboratorio.examen p where h.codigo = 'HEMO' and p.codigo = 'PRENATAL'$$, 'ciclo_en_catalogo');
insert into laboratorio.orden (id, consulta_id, paciente_id, medico_id) values ('00000000-0000-0000-0000-0000000000d1', gen_random_uuid(), '00000000-0000-0000-0000-0000000000a1', gen_random_uuid());
select pg_temp.espera_error($$update laboratorio.orden set estado = 'completado' where id = '00000000-0000-0000-0000-0000000000d1'$$, 'transicion_invalida');
update laboratorio.orden set estado = 'en_proceso' where id = '00000000-0000-0000-0000-0000000000d1';
select pg_temp.espera_error($$update laboratorio.orden set revisada_en = now() where id = '00000000-0000-0000-0000-0000000000d1'$$, '23514');

-- 12. Ambulancia: un servicio activo, hitos en orden
insert into ambulancia.servicio (id, unidad_id, tipo, prioridad, origen, destino, despachado_por)
select '00000000-0000-0000-0000-0000000000e1', id, 'emergencia_domicilio', 'roja', 'Col. Prueba', 'Hospital', gen_random_uuid() from ambulancia.unidad;
select pg_temp.espera_error($$insert into ambulancia.servicio (unidad_id, tipo, prioridad, origen, destino, despachado_por)
  select id, 'traslado_interhospitalario', 'verde', 'A', 'B', gen_random_uuid() from ambulancia.unidad$$, '23505');
select pg_temp.espera_error($$insert into ambulancia.hito (servicio_id, tipo, ocurrido_en, registrado_por, clave_idempotencia)
  values ('00000000-0000-0000-0000-0000000000e1', 'en_escena', now(), gen_random_uuid(), 'k1')$$, 'hito_fuera_de_orden');
insert into ambulancia.hito (servicio_id, tipo, ocurrido_en, registrado_por, clave_idempotencia) values ('00000000-0000-0000-0000-0000000000e1', 'salida', now(), gen_random_uuid(), 'k2');
select pg_temp.espera_error($$insert into ambulancia.hito (servicio_id, tipo, ocurrido_en, registrado_por, clave_idempotencia)
  values ('00000000-0000-0000-0000-0000000000e1', 'salida', now(), gen_random_uuid(), 'k2')$$, '23505');

-- 13. Inventario sin negativos
select pg_temp.espera_error($$update inventario.existencia set cantidad = cantidad - 100000$$, '23514');

-- 14. Limpieza verificada por otra persona (D-013)
select pg_temp.espera_error($$insert into infra.limpieza_cama (cama_id, limpiada_por, limpiada_en, verificada_por, verificada_en)
  select id, '00000000-0000-0000-0000-0000000000f1', now(), '00000000-0000-0000-0000-0000000000f1', now() from infra.espacio where codigo = 'HAB-201-A'$$, '23514');

-- 15. Outbox publica en Realtime dentro de la transacción y no publica si se revierte
begin;
insert into plataforma.outbox (tipo, entidad, entidad_id, canales) values ('cama.estado_cambiado', 'cama', 'x', array['rol:REC', 'publico']);
rollback;
insert into plataforma.outbox (tipo, entidad, entidad_id, canales) values ('cama.estado_cambiado', 'cama', 'y', array['rol:REC', 'publico']);
select case when (select count(*) from realtime.messages where payload ->> 'id' = 'x') = 0
        and (select count(*) from realtime.messages where payload ->> 'id' = 'y') = 2
        and (select private from realtime.messages where payload ->> 'id' = 'y' and topic = 'publico') = false
  then 'OK outbox y Realtime' else 'FALLO outbox' end;

-- 16. Alta de usuario desde Auth y canales del token
insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000aaa1', 'paciente@demo.test');
select case when (select array_agg(rol_codigo) from acceso.asignacion_rol where usuario_id = '00000000-0000-0000-0000-00000000aaa1') = array['PAC']
  and acceso.hook_token('{"user_id":"00000000-0000-0000-0000-00000000aaa1","claims":{}}') -> 'claims' -> 'app_canales' ? 'rol:PAC'
  then 'OK alta y canales' else 'FALLO alta' end;
insert into auth.users (id, email, raw_app_meta_data) values ('00000000-0000-0000-0000-00000000aaa2', 'jefe@demo.test', '{"invitado":"true"}');
select case when not exists (select 1 from acceso.asignacion_rol where usuario_id = '00000000-0000-0000-0000-00000000aaa2') then 'OK invitado sin rol automático' else 'FALLO invitado' end;
select pg_temp.espera_error($$insert into acceso.asignacion_rol (usuario_id, rol_codigo, asignado_por) values ('00000000-0000-0000-0000-00000000aaa2', 'ADM', '00000000-0000-0000-0000-00000000aaa2')$$, '23514');

-- 17. Permisos sembrados
select case when (select count(*) from acceso.rol) = 10 and (select count(*) from acceso.permiso) = 79
  and exists (select 1 from acceso.rol_permiso where rol_codigo = 'DPD' and permiso_codigo = 'privacidad.aprobar_acceso')
  and not exists (select 1 from acceso.rol_permiso where rol_codigo = 'ADM' and permiso_codigo = 'expediente.ver')
  then 'OK catálogo de permisos' else 'FALLO permisos' end;

-- 18. Vista pública sin datos personales
select case when (select string_agg(column_name, ',') from information_schema.columns where table_schema = 'publico' and table_name = 'v_ocupacion')
  = 'planta,categoria,camas,libres,ocupadas' then 'OK vista pública' else 'FALLO vista pública' end;
