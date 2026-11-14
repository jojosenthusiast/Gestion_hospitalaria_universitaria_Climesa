-- Specs 112 y 113. Información pública sin datos personales, avisos con vigencia y métricas agregadas.
--
-- 1. `publico.aviso`: la vigencia debe tener inicio y fin, y el fin ser posterior al inicio (FR-112-03).
--    Comprobación previa en producción (debe devolver 0):
--      select count(*) from publico.aviso
--      where isempty(vigencia) or lower_inf(vigencia) or upper_inf(vigencia);
-- 2. Vistas públicas que no leen `now()` (la API filtra con su reloj): turnos de médicos y números llamados.
-- 3. Esquema `metricas` con agregados para el tablero (FR-113-01); solo números, nunca personas.
-- 4. Eventos derivados en `plataforma.outbox` (tiempo-real.md): cada cambio de cama, fila o turno de un médico
--    deja además un evento delgado en el canal `publico` que no identifica camas, números ni personas, y cada
--    cambio que mueve un indicador deja `metricas.recalculadas` en los roles con `metricas.ver`.

-- 1. Vigencia válida del aviso.
do $$
declare
  v_invalidos int;
begin
  if exists (select 1 from pg_constraint where conname = 'aviso_vigencia_valida') then
    return;
  end if;
  select count(*) into v_invalidos from publico.aviso
  where isempty(vigencia) or lower_inf(vigencia) or upper_inf(vigencia);
  if v_invalidos > 0 then
    raise exception 'Hay % aviso(s) sin inicio o sin fin de vigencia; corrígelos antes de aplicar esta migración.', v_invalidos;
  end if;
  alter table publico.aviso add constraint aviso_vigencia_valida
    check (not isempty(vigencia) and not lower_inf(vigencia) and not upper_inf(vigencia));
end $$;

create index if not exists aviso_vigencia on publico.aviso using gist (vigencia);

-- 2. Vistas públicas filtradas por la API con su reloj (sin `now()`).
-- Médicos con turno publicado o en curso: nombre, especialidad y área (RN-17). Sin teléfono, DUI ni ids.
create or replace view publico.v_turnos_medicos as
  select p.nombres || ' ' || p.apellidos as nombre,
         coalesce(p.especialidad, 'Medicina general') as especialidad,
         e.nombre as area, t.periodo
  from personal.turno t
  join personal.persona p on p.id = t.persona_id
  left join infra.espacio e on e.id = t.area_id
  where p.tipo = 'medico' and p.activo and t.estado in ('publicado', 'en_curso');

-- Números llamados: servicio, fecha, número y consultorio. Nunca el paciente (FR-112-06).
create or replace view publico.v_fila_llamados as
  select t.servicio, t.fecha, t.numero, e.nombre as consultorio, t.llamados
  from atencion.ticket_fila t
  left join infra.espacio e on e.id = t.consultorio_id
  where t.estado = 'llamado';

alter view publico.v_turnos_medicos set (security_invoker = true);
alter view publico.v_fila_llamados set (security_invoker = true);
grant select on publico.v_turnos_medicos, publico.v_fila_llamados to sghu_api;

-- 3. Agregados del tablero.
create schema if not exists metricas;
grant usage on schema metricas to sghu_api;

create or replace view metricas.v_ocupacion_por_planta as
  select nivel as planta,
         count(*)::int as camas,
         count(*) filter (where estado = 'libre')::int as libres,
         count(*) filter (where estado = 'ocupada')::int as ocupadas,
         count(*) filter (where estado = 'limpieza')::int as limpieza,
         count(*) filter (where estado = 'bloqueada')::int as bloqueadas,
         count(*) filter (where estado = 'reservada')::int as reservadas
  from infra.v_estado_cama
  group by nivel;

create or replace view metricas.v_laboratorio_por_estado as
  select estado, (creada_en at time zone 'America/El_Salvador')::date as fecha_creacion,
         (completada_en at time zone 'America/El_Salvador')::date as fecha_completada,
         count(*)::int as ordenes
  from laboratorio.orden
  group by estado, fecha_creacion, fecha_completada;

alter view metricas.v_ocupacion_por_planta set (security_invoker = true);
alter view metricas.v_laboratorio_por_estado set (security_invoker = true);
grant select on metricas.v_ocupacion_por_planta, metricas.v_laboratorio_por_estado to sghu_api;

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on all tables in schema metricas from anon, authenticated;
    revoke usage on schema metricas from anon, authenticated;
  end if;
end $$;

-- 4. Eventos derivados. Corre como el rol que inserta (sghu_api), en la misma transacción del cambio:
-- si el cambio se revierte, tampoco existen. Los eventos derivados usan entidad `publico` o `metricas`
-- y la condición del disparador los excluye, así que no se derivan de nuevo.
create or replace function plataforma.derivar_eventos() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_estado text;
  v_servicio text;
  v_medico boolean;
  v_canales text[];
begin
  if new.tipo = 'cama.estado_cambiado' and not ('publico' = any(new.canales)) then
    insert into plataforma.outbox (tipo, entidad, entidad_id, version, canales)
    values ('cama.estado_cambiado', 'publico', 'ocupacion', new.version, array['publico']);
  elsif new.tipo = 'fila.actualizada' then
    select estado, servicio into v_estado, v_servicio from atencion.ticket_fila where id::text = new.entidad_id;
    if v_servicio is not null then
      insert into plataforma.outbox (tipo, entidad, entidad_id, version, canales)
      values (case when v_estado = 'llamado' then 'fila.llamado' else 'fila.estado' end,
              'publico', 'fila:' || v_servicio, new.version, array['publico']);
    end if;
  elsif new.tipo like 'turno.%' then
    select p.tipo = 'medico' into v_medico
    from personal.turno t join personal.persona p on p.id = t.persona_id where t.id::text = new.entidad_id;
    if coalesce(v_medico, false) then
      insert into plataforma.outbox (tipo, entidad, entidad_id, version, canales)
      values (case when new.tipo = 'turno.publicado' then 'turno.publicado' else 'turno.cambiado' end,
              'publico', 'medicos_de_turno', new.version, array['publico']);
    end if;
  end if;

  if new.tipo in ('cama.estado_cambiado', 'cama.limpieza_pendiente', 'fila.actualizada', 'laboratorio.actualizado',
                  'laboratorio.critico', 'ambulancia.estado_cambiado', 'paciente.creado', 'paciente.actualizado')
     or new.tipo like 'turno.%' then
    -- Regla 8: los canales salen del catálogo de permisos, no de una lista de roles.
    select coalesce(array_agg(distinct 'rol:' || rol_codigo order by 'rol:' || rol_codigo), '{}') into v_canales
    from acceso.rol_permiso
    where permiso_codigo = 'metricas.ver' and contexto not in ('propio', 'propio_revisado');
    if cardinality(v_canales) > 0 then
      insert into plataforma.outbox (tipo, entidad, entidad_id, version, canales)
      values ('metricas.recalculadas', 'metricas', 'tablero', new.version, v_canales);
    end if;
  end if;
  return null;
end $$;

drop trigger if exists outbox_derivar on plataforma.outbox;
create trigger outbox_derivar after insert on plataforma.outbox
  for each row when (new.entidad not in ('publico', 'metricas'))
  execute function plataforma.derivar_eventos();

-- Reversión (manual):
-- drop trigger if exists outbox_derivar on plataforma.outbox;
-- drop function if exists plataforma.derivar_eventos();
-- drop view if exists metricas.v_laboratorio_por_estado, metricas.v_ocupacion_por_planta;
-- drop schema if exists metricas;
-- drop view if exists publico.v_fila_llamados, publico.v_turnos_medicos;
-- drop index if exists publico.aviso_vigencia;
-- alter table publico.aviso drop constraint if exists aviso_vigencia_valida;
