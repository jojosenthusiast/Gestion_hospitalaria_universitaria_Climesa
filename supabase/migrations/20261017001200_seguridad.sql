-- Seguridad transversal (ADR-0004): RLS activado en todas las tablas de negocio sin políticas para anon ni
-- authenticated (todo denegado por acceso directo). El rol de la API, sghu_api, tiene una política explícita por tabla
-- y solo los GRANT de cada migración. Canales privados de Realtime autorizados por el token (ADR-0005).

do $$
declare
  t record;
begin
  for t in
    select schemaname, tablename from pg_tables
    where schemaname in ('plataforma', 'acceso', 'pacientes', 'infra', 'personal', 'atencion', 'laboratorio',
                         'hospitalizacion', 'ambulancia', 'inventario', 'publico')
  loop
    execute format('alter table %I.%I enable row level security', t.schemaname, t.tablename);
    execute format('create policy api_sghu on %I.%I for all to sghu_api using (true) with check (true)', t.schemaname, t.tablename);
  end loop;
end $$;

do $$
declare
  s text;
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    foreach s in array array['plataforma', 'acceso', 'pacientes', 'infra', 'personal', 'atencion', 'laboratorio',
                             'hospitalizacion', 'ambulancia', 'inventario', 'publico'] loop
      execute format('revoke all on all tables in schema %I from anon, authenticated', s);
      execute format('revoke usage on schema %I from anon, authenticated', s);
    end loop;
  end if;
end $$;

-- Autorización de canales privados de Realtime: el usuario escucha solo los canales que su token declara.
do $$ begin
  if exists (select 1 from pg_tables where schemaname = 'realtime' and tablename = 'messages') then
    execute $p$
      create policy sghu_escuchar_canales on realtime.messages for select to authenticated
      using (
        realtime.topic() = 'publico'
        or realtime.topic() in (select jsonb_array_elements_text(coalesce(auth.jwt() -> 'app_canales', '[]'::jsonb)))
      )
    $p$;
  end if;
end $$;
