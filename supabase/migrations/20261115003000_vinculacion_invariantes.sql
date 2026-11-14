-- Spec 101 (FR-101-08 a FR-101-11, RN-39, D-032): invariantes de la vinculación de cuenta y expediente.
--
-- 1. `version` para concurrencia optimista al aprobar o rechazar (FR-100-12).
-- 2. Una vinculación resuelta queda cerrada: no vuelve a pendiente ni cambia de expediente, verificador o motivo.
-- 3. Una vinculación aprobada siempre nombra expediente, verificador e instante; una rechazada, verificador,
--    instante y motivo de al menos 10 caracteres.
--
-- Pre-chequeo en producción (debe devolver 0 filas antes de aplicar):
--   select id, estado from acceso.vinculacion_paciente
--   where (estado = 'aprobada' and (paciente_candidato_id is null or verificado_por is null or resuelto_en is null))
--      or (estado = 'rechazada' and (verificado_por is null or resuelto_en is null or length(trim(coalesce(motivo_rechazo, ''))) < 10));
--
-- Reversión:
--   alter table acceso.vinculacion_paciente drop constraint if exists vinculacion_resuelta_completa;
--   drop trigger if exists vinculacion_resuelta_inmutable on acceso.vinculacion_paciente;
--   drop function if exists acceso.proteger_vinculacion_resuelta();
--   alter table acceso.vinculacion_paciente drop column if exists version;

alter table acceso.vinculacion_paciente add column if not exists version int not null default 1;

do $$
declare
  v_incompletas int;
begin
  if exists (select 1 from pg_constraint where conname = 'vinculacion_resuelta_completa') then
    return;
  end if;
  select count(*) into v_incompletas from acceso.vinculacion_paciente
  where (estado = 'aprobada' and (paciente_candidato_id is null or verificado_por is null or resuelto_en is null))
     or (estado = 'rechazada' and (verificado_por is null or resuelto_en is null or length(trim(coalesce(motivo_rechazo, ''))) < 10));
  if v_incompletas > 0 then
    raise exception 'Hay % vinculación(es) resueltas sin expediente, verificador, instante o motivo válido; corrígelas antes de aplicar.', v_incompletas;
  end if;
  alter table acceso.vinculacion_paciente add constraint vinculacion_resuelta_completa check (
    estado = 'pendiente'
    or (estado = 'aprobada' and paciente_candidato_id is not null and verificado_por is not null and resuelto_en is not null)
    or (estado = 'rechazada' and verificado_por is not null and resuelto_en is not null and length(trim(motivo_rechazo)) >= 10));
end $$;

create or replace function acceso.proteger_vinculacion_resuelta() returns trigger language plpgsql set search_path = '' as $$
begin
  if old.estado <> 'pendiente' then
    raise exception 'vinculacion_resuelta' using errcode = 'P0001', detail = 'Una vinculación aprobada o rechazada no cambia.';
  end if;
  return new;
end $$;

drop trigger if exists vinculacion_resuelta_inmutable on acceso.vinculacion_paciente;
create trigger vinculacion_resuelta_inmutable before update on acceso.vinculacion_paciente
  for each row execute function acceso.proteger_vinculacion_resuelta();
