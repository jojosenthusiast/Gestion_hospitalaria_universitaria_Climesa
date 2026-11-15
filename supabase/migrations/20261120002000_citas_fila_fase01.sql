-- Fase 0/1 · citas y fila del día (auditoría final 2026-11-14: FILA-01 a 03, CITA-02, CITA-05, CITA-07,
-- MA-CIT-02, MA-CIT-03, m-23; anexos 10, 12 y 14).
--
-- 1. Fila (FILA-01): "No se presentó" solo después de N llamados sin respuesta (política nueva
--    `fila.llamados_para_ausencia`, 3 por omisión). Ya no existe `en_espera -> no_se_presento`: nadie "no se presenta"
--    si no lo llamaron. Los llamados nunca superan `fila.llamados_maximos`.
-- 2. Fila (FILA-03, ASIS-04): estado `cerrado` ("cerrado sin atender") para el cierre automático del día operativo.
-- 3. Citas (CITA-05): estado `vencida` para una solicitud que nadie gestionó antes de su hora.
-- 4. Citas (CITA-02): estado `reprogramada` y la tabla `atencion.reprogramacion` (solicitud de reprogramación). La cita
--    original sigue vigente hasta que se acepta; al aceptar queda `reprogramada` y enlazada con la nueva
--    (`reprogramada_de`). Límite configurable de reprogramaciones por cadena (`citas.reprogramaciones_max`).
-- 5. Citas (CITA-07): máximo de solicitudes pendientes por paciente (`citas.solicitudes_pendientes_max`).
-- 6. Citas (MA-CIT-02, MA-CIT-03): una cita con consulta vigente (no anulada) no se cancela, ni se marca "no asistió",
--    ni se reprograma.
--
-- Pre-comprobación en producción (no debe devolver filas; si las hay, revisa esas citas antes de aplicar):
--   select id from atencion.cita where estado not in ('solicitada','confirmada','atendida','cancelada','rechazada','no_asistio');
--   select clave from plataforma.politica where clave in ('fila.llamados_para_ausencia','citas.reprogramaciones_max','citas.solicitudes_pendientes_max');
--
-- Los cambios toman candados sobre tablas en uso continuo: si no los obtiene en 5 s, la migración falla en lugar de
-- bloquear la recepción; vuelve a aplicarla.
set local lock_timeout = '5s';

-- ---------------------------------------------------------------------------------------------------------------
-- Estados nuevos (las restricciones CHECK de columna se reemplazan por nombre estable).
do $$
declare
  v_nombre text;
begin
  for v_nombre in select conname from pg_constraint
    where conrelid = 'atencion.cita'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%no_asistio%' loop
    execute format('alter table atencion.cita drop constraint %I', v_nombre);
  end loop;
  for v_nombre in select conname from pg_constraint
    where conrelid = 'atencion.ticket_fila'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%no_se_presento%' loop
    execute format('alter table atencion.ticket_fila drop constraint %I', v_nombre);
  end loop;
end $$;

alter table atencion.cita add constraint cita_estado_valido check (estado in
  ('solicitada', 'confirmada', 'atendida', 'cancelada', 'rechazada', 'no_asistio', 'vencida', 'reprogramada'));
alter table atencion.ticket_fila add constraint ticket_fila_estado_valido check (estado in
  ('en_espera', 'llamado', 'en_atencion', 'atendido', 'no_se_presento', 'cerrado'));

-- Cadena de reprogramaciones: la cita nueva apunta a la original y cuenta cuántas veces se movió la cadena.
alter table atencion.cita add column if not exists reprogramada_de uuid references atencion.cita(id);
alter table atencion.cita add column if not exists reprogramaciones int not null default 0 check (reprogramaciones >= 0);
create unique index if not exists cita_reprogramada_de_unica on atencion.cita (reprogramada_de) where reprogramada_de is not null;

-- ---------------------------------------------------------------------------------------------------------------
-- Políticas (fuente: auditoría final, anexos 12 y 14; el responsable puede cambiarlas con una vigencia nueva).
insert into plataforma.politica (clave, valor, vigencia, fuente, aprobado_por)
select v.clave, v.valor::jsonb, tstzrange('2026-10-01', null), v.fuente, 'equipo SGHU'
from (values
  ('fila.llamados_para_ausencia', '{"llamados":3}', 'Auditoría final FILA-01'),
  ('citas.reprogramaciones_max', '{"maximo":2}', 'Auditoría final CITA-02'),
  ('citas.solicitudes_pendientes_max', '{"maximo":2}', 'Auditoría final CITA-07')) as v(clave, valor, fuente)
where not exists (select 1 from plataforma.politica p where p.clave = v.clave);

-- ---------------------------------------------------------------------------------------------------------------
-- Máquina de estados de la cita (reemplaza la de 20261116002000_fase1_contrato_api.sql).
--   solicitada -> confirmada | rechazada | cancelada | vencida | reprogramada
--   confirmada -> atendida | cancelada | no_asistio | reprogramada
-- Con una consulta vigente (no anulada) la cita ya no se cancela, ni pasa a no_asistio ni a reprogramada (MA-CIT-03).
create or replace function atencion.validar_cita() returns trigger language plpgsql set search_path = '' as $$
begin
  if old.estado <> new.estado then
    if not (
         (old.estado = 'solicitada' and new.estado in ('confirmada', 'rechazada', 'cancelada', 'vencida', 'reprogramada'))
      or (old.estado = 'confirmada' and new.estado in ('atendida', 'cancelada', 'no_asistio', 'reprogramada'))) then
      raise exception 'transicion_invalida % -> %', old.estado, new.estado using errcode = 'P0001';
    end if;
    if new.estado in ('cancelada', 'no_asistio', 'reprogramada') and exists (
        select 1 from atencion.consulta k where k.cita_id = new.id and k.estado <> 'ingresada_por_error') then
      raise exception 'cita_con_consulta' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------------------------------------------
-- Máquina de estados del número de fila (reemplaza la de 20261017000600_atencion.sql).
--   en_espera  -> llamado | cerrado
--   llamado    -> llamado | en_atencion | no_se_presento (solo con N llamados) | en_espera | cerrado
--   en_atencion -> atendido | cerrado
-- Los llamados nunca superan `fila.llamados_maximos` (RN-19).
create or replace function atencion.validar_ticket() returns trigger language plpgsql set search_path = '' as $$
declare
  v_para_ausencia int := coalesce((plataforma.politica_vigente('fila.llamados_para_ausencia', now()) ->> 'llamados')::int, 3);
  v_maximos int := coalesce((plataforma.politica_vigente('fila.llamados_maximos', now()) ->> 'llamados')::int, 3);
begin
  if old.estado <> new.estado and not (
       (old.estado = 'en_espera' and new.estado in ('llamado', 'cerrado'))
    or (old.estado = 'llamado' and new.estado in ('llamado', 'en_atencion', 'no_se_presento', 'en_espera', 'cerrado'))
    or (old.estado = 'en_atencion' and new.estado in ('atendido', 'cerrado'))) then
    raise exception 'transicion_invalida % -> %', old.estado, new.estado using errcode = 'P0001';
  end if;
  if new.estado = 'no_se_presento' and old.estado <> 'no_se_presento' and old.llamados < v_para_ausencia then
    raise exception 'fila_llamados_insuficientes' using errcode = 'P0001';
  end if;
  if new.llamados > old.llamados and new.llamados > v_maximos then
    raise exception 'fila_max_llamados' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists ticket_transicion on atencion.ticket_fila;
create trigger ticket_transicion before update of estado, llamados on atencion.ticket_fila
  for each row execute function atencion.validar_ticket();

-- ---------------------------------------------------------------------------------------------------------------
-- Solicitudes de reprogramación (CITA-02). Una sola pendiente por cita; la franja pedida es del mismo médico.
create table if not exists atencion.reprogramacion (
  id uuid primary key default gen_random_uuid(),
  cita_id uuid not null references atencion.cita(id),
  medico_id uuid not null,
  horario tstzrange not null,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'aceptada', 'rechazada', 'vencida')),
  origen text not null check (origen in ('paciente', 'recepcion')),
  motivo text,
  motivo_rechazo text,
  solicitado_por uuid,
  decidido_por uuid,
  decidido_en timestamptz,
  cita_nueva_id uuid references atencion.cita(id),
  creado_en timestamptz not null default now(),
  version int not null default 1,
  check (estado <> 'rechazada' or motivo_rechazo is not null),
  check (estado <> 'aceptada' or cita_nueva_id is not null)
);
create unique index if not exists reprogramacion_pendiente_unica on atencion.reprogramacion (cita_id) where estado = 'pendiente';
create index if not exists reprogramacion_cita on atencion.reprogramacion (cita_id, creado_en desc);

create or replace function atencion.validar_reprogramacion() returns trigger language plpgsql set search_path = '' as $$
begin
  if old.estado <> new.estado and not (old.estado = 'pendiente' and new.estado in ('aceptada', 'rechazada', 'vencida')) then
    raise exception 'transicion_invalida % -> %', old.estado, new.estado using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists reprogramacion_transicion on atencion.reprogramacion;
create trigger reprogramacion_transicion before update of estado on atencion.reprogramacion
  for each row execute function atencion.validar_reprogramacion();

grant select, insert, update on atencion.reprogramacion to sghu_api;
alter table atencion.reprogramacion enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'atencion' and tablename = 'reprogramacion' and policyname = 'api_sghu') then
    create policy api_sghu on atencion.reprogramacion for all to sghu_api using (true) with check (true);
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on atencion.reprogramacion from anon, authenticated;
  end if;
end $$;

-- Reversión (manual, en este orden):
-- drop table if exists atencion.reprogramacion;
-- drop function if exists atencion.validar_reprogramacion();
-- update atencion.cita set estado = 'cancelada' where estado in ('vencida', 'reprogramada');   -- solo si hace falta volver
-- update atencion.ticket_fila set estado = 'no_se_presento' where estado = 'cerrado';
-- alter table atencion.cita drop constraint cita_estado_valido, drop column reprogramada_de, drop column reprogramaciones;
-- alter table atencion.cita add check (estado in ('solicitada','confirmada','atendida','cancelada','rechazada','no_asistio'));
-- alter table atencion.ticket_fila drop constraint ticket_fila_estado_valido;
-- alter table atencion.ticket_fila add check (estado in ('en_espera','llamado','en_atencion','atendido','no_se_presento'));
-- (y las funciones validar_cita y validar_ticket de 20261116002000 y 20261017000600)
-- delete from plataforma.politica where clave in ('fila.llamados_para_ausencia','citas.reprogramaciones_max','citas.solicitudes_pendientes_max');
