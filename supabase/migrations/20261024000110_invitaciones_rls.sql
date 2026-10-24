-- Complemento de 20261024000100_invitaciones_jerarquia.sql (esa migracion ya esta aplicada en el proyecto remoto y no se edita).
-- Aplica la convencion de seguridad transversal (ADR-0004): RLS con politica explicita para sghu_api, y el permiso de insercion
-- que necesita el API para fijar al administrador principal la primera vez. Es idempotente.

alter table acceso.administrador_principal enable row level security;
alter table acceso.invitacion enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'acceso' and tablename = 'administrador_principal' and policyname = 'api_sghu') then
    create policy api_sghu on acceso.administrador_principal for all to sghu_api using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'acceso' and tablename = 'invitacion' and policyname = 'api_sghu') then
    create policy api_sghu on acceso.invitacion for all to sghu_api using (true) with check (true);
  end if;
end $$;

grant insert on acceso.administrador_principal to sghu_api;