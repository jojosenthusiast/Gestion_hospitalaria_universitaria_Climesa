-- R7 G-4: la tripulación deshace su último hito registrado por error (por ejemplo, «En hospital» tocado de más).
--
-- El hito deshecho no se pierde: se copia a `ambulancia.hito_anulado` con quién y cuándo lo deshizo, y después se borra
-- de `ambulancia.hito` (la tabla conserva `unique (servicio_id, tipo)`, así el hito se puede volver a registrar). La API
-- solo deshace el último hito, nunca `finalizado` ni `en_hospital` con la entrega ya registrada, y solo dentro de los
-- 15 minutos siguientes a su registro; la regla vive en la API (`ambulance.service.ts`, `undoMilestone`).
--
-- Efecto en datos existentes: ninguna fila existente cambia. Solo se crea una tabla vacía y se conceden permisos.
--
-- Comprobación previa (solo lectura, informativa): la tabla nueva no existe todavía.
--   select to_regclass('ambulancia.hito_anulado');  -- esperado: null
--
-- Reversión (manual, en este orden):
--   revoke delete on ambulancia.hito from sghu_api;
--   drop table if exists ambulancia.hito_anulado;

set lock_timeout = '5s';

create table if not exists ambulancia.hito_anulado (
  id uuid primary key,
  servicio_id uuid not null references ambulancia.servicio(id),
  tipo text not null,
  ocurrido_en timestamptz not null,
  registrado_en timestamptz not null,
  registrado_por uuid not null,
  anulado_en timestamptz not null,
  anulado_por uuid not null
);
create index if not exists hito_anulado_servicio_idx on ambulancia.hito_anulado (servicio_id);

alter table ambulancia.hito_anulado enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'ambulancia' and tablename = 'hito_anulado' and policyname = 'api_sghu') then
    create policy api_sghu on ambulancia.hito_anulado for all to sghu_api using (true) with check (true);
  end if;
end $$;
grant select, insert on ambulancia.hito_anulado to sghu_api;
grant delete on ambulancia.hito to sghu_api;
