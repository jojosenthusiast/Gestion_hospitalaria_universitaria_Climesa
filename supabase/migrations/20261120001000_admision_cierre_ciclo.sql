-- Fase 0 (auditoría final, BL-03, BL-04, MA-HOS-02): cierre del ciclo de la admisión.
-- 1. Solicitud de alta: Recepción o Jefatura pide el alta al médico tratante (la firma sigue siendo solo de MED, D-02).
-- 2. Cancelación y anulación: una admisión pendiente de cama se cancela; una hospitalizada por error se anula
--    (la ocupación se cierra con `motivo_fin = 'ingresado_por_error'` y la cama va a limpieza). Ambas quedan en
--    estado `cancelada`, con quién, cuándo y por qué. Nada se borra (regla 6).
-- 3. Cambio de médico tratante: Jefatura reasigna el tratante con motivo; queda el historial.
-- 4. Revocar el alta: mientras no haya salida física, el firmante o Jefatura revoca el alta con motivo. El alta
--    revocada se conserva; solo puede haber un alta vigente por admisión.
--
-- Comprobación previa en producción (solo lectura):
--   select count(*) from hospitalizacion.admision where estado = 'cancelada';          -- se espera 0 (no había escritor)
--   select admision_id, count(*) from hospitalizacion.alta group by 1 having count(*) > 1;  -- se espera ninguna fila
--
-- Reversión (manual, en este orden):
--   drop table if exists hospitalizacion.cambio_tratante;
--   drop index if exists hospitalizacion.alta_vigente_unica;
--   alter table hospitalizacion.alta drop constraint if exists alta_revocada_con_motivo, drop constraint alta_pkey,
--     drop column revocada_en, drop column revocada_por, drop column motivo_revocacion, drop column id;
--   alter table hospitalizacion.alta add primary key (admision_id);   -- solo si no quedaron altas revocadas
--   alter table hospitalizacion.admision drop constraint if exists admision_cierre_con_motivo,
--     drop column alta_solicitada_en, drop column alta_solicitada_por, drop column cerrada_en, drop column cerrada_por,
--     drop column motivo_cierre;

alter table hospitalizacion.admision
  add column if not exists alta_solicitada_en timestamptz,
  add column if not exists alta_solicitada_por uuid,
  add column if not exists cerrada_en timestamptz,
  add column if not exists cerrada_por uuid,
  add column if not exists motivo_cierre text;

-- El cierre (cancelar o anular) solo existe en una admisión cancelada y siempre dice quién y por qué (al menos 10
-- caracteres, D-13). Las canceladas anteriores sin cierre registrado (semilla demo) siguen siendo válidas.
alter table hospitalizacion.admision add constraint admision_cierre_con_motivo
  check (cerrada_en is null or (estado = 'cancelada' and cerrada_por is not null and char_length(btrim(coalesce(motivo_cierre, ''))) >= 10));

-- El alta revocada se conserva: la clave pasa a un id propio y la unicidad queda solo para el alta vigente.
alter table hospitalizacion.alta
  add column if not exists id uuid not null default gen_random_uuid(),
  add column if not exists revocada_en timestamptz,
  add column if not exists revocada_por uuid,
  add column if not exists motivo_revocacion text;
alter table hospitalizacion.alta drop constraint if exists alta_pkey;
alter table hospitalizacion.alta add primary key (id);
create unique index if not exists alta_vigente_unica on hospitalizacion.alta (admision_id) where revocada_en is null;
alter table hospitalizacion.alta add constraint alta_revocada_con_motivo
  check (revocada_en is null or (revocada_por is not null and char_length(btrim(coalesce(motivo_revocacion, ''))) >= 10));
-- La API solo marca la revocación; el contenido del alta firmada no se edita.
grant update (revocada_en, revocada_por, motivo_revocacion) on hospitalizacion.alta to sghu_api;

create table if not exists hospitalizacion.cambio_tratante (
  id uuid primary key default gen_random_uuid(),
  admision_id uuid not null references hospitalizacion.admision(id),
  anterior_id uuid not null,
  nuevo_id uuid not null,
  motivo text not null check (char_length(btrim(motivo)) >= 10),
  realizado_por uuid not null,
  realizado_en timestamptz not null default now(),
  check (anterior_id <> nuevo_id)
);
create index if not exists cambio_tratante_admision on hospitalizacion.cambio_tratante (admision_id, realizado_en);
grant select, insert on hospitalizacion.cambio_tratante to sghu_api;
alter table hospitalizacion.cambio_tratante enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'hospitalizacion' and tablename = 'cambio_tratante' and policyname = 'api_sghu') then
    create policy api_sghu on hospitalizacion.cambio_tratante for all to sghu_api using (true) with check (true);
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on hospitalizacion.cambio_tratante from anon, authenticated;
  end if;
end $$;
