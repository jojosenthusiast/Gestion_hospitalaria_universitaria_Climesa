-- Auditoría final, MA-AVI-02: un aviso se puede editar (texto, prioridad, audiencia y vigencia, incluido adelantar
-- su fin) y retirar antes de tiempo con un motivo, con auditoría. Patrón único de corrección (D-13): motivo de 10
-- caracteres o más, auditado, conservando el original (la auditoría guarda el antes y el después de cada edición).
--
-- Esta migración:
--   1. Agrega `version` (concurrencia optimista), quién y cuándo editó por última vez, y el retiro (cuándo, quién y motivo).
--   2. Exige que el retiro esté completo: fecha, autor y un motivo de 10 caracteres o más, o nada.
--   3. Un aviso retirado ya no admite cambios (trigger, código `aviso_retirado`).
--
-- Pre-comprobación en producción (informativa; no cambia filas existentes: todo aviso queda en versión 1 y sin retiro):
--   select count(*) from publico.aviso;
--
-- Reversa:
--   drop trigger if exists aviso_sin_cambios_tras_retiro on publico.aviso;
--   drop function if exists publico.aviso_sin_cambios_tras_retiro();
--   alter table publico.aviso drop constraint if exists aviso_retiro_completo;
--   alter table publico.aviso drop column if exists motivo_retiro, drop column if exists retirado_por, drop column if exists retirado_en,
--     drop column if exists editado_por, drop column if exists editado_en, drop column if exists version;

alter table publico.aviso
  add column if not exists version integer not null default 1,
  add column if not exists editado_en timestamptz,
  add column if not exists editado_por uuid,
  add column if not exists retirado_en timestamptz,
  add column if not exists retirado_por uuid,
  add column if not exists motivo_retiro text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'aviso_retiro_completo') then
    alter table publico.aviso add constraint aviso_retiro_completo check (
      (retirado_en is null and retirado_por is null and motivo_retiro is null)
      or (retirado_en is not null and retirado_por is not null and length(btrim(motivo_retiro)) between 10 and 500)
    );
  end if;
end $$;

create or replace function publico.aviso_sin_cambios_tras_retiro() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.retirado_en is not null then
    raise exception 'aviso_retirado' using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists aviso_sin_cambios_tras_retiro on publico.aviso;
create trigger aviso_sin_cambios_tras_retiro before update on publico.aviso
  for each row execute function publico.aviso_sin_cambios_tras_retiro();

comment on column publico.aviso.version is 'Concurrencia optimista: sube en cada edición y en el retiro.';
comment on column publico.aviso.retirado_en is 'Retiro antes de tiempo: el aviso deja de verse en todas partes; no admite más cambios.';
comment on column publico.aviso.motivo_retiro is 'Motivo del retiro, 10 caracteres o más (D-13).';
