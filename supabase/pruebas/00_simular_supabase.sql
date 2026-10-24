-- Solo para PostgreSQL local de pruebas: simula lo mínimo de Supabase (auth.users, auth.jwt, realtime.send,
-- realtime.topic y roles). Nunca se aplica en la nube.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then create role supabase_auth_admin nologin; end if;
end $$;
create schema auth;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb default '{}'::jsonb,
  raw_app_meta_data jsonb default '{}'::jsonb
);
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
create function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt()->>'sub','')::uuid $$;
create schema realtime;
create table realtime.messages (
  id bigint generated always as identity primary key,
  topic text not null, extension text default 'broadcast', event text, payload jsonb, private boolean,
  inserted_at timestamptz default now()
);
create function realtime.send(payload jsonb, event text, topic text, private boolean default true) returns void
language sql as $$ insert into realtime.messages (topic, event, payload, private) values (topic, event, payload, private) $$;
create function realtime.topic() returns text language sql stable as $$ select current_setting('realtime.topic', true) $$;
