-- Spec 100. Plataforma: extensiones, rol de la API, idempotencia, outbox con publicación en Realtime,
-- inbox, auditoría encadenada (solo inserción) y políticas con vigencia. ADR-0004, ADR-0005, D-007 a D-009.

create schema if not exists extensions;
create extension if not exists btree_gist with schema extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;
create extension if not exists pgcrypto with schema extensions;

-- Rol con el que se conecta la API. Sin LOGIN en la migración: la contraseña se asigna fuera del repositorio
-- con  alter role sghu_api login password '...';
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'sghu_api') then
    create role sghu_api nologin;
  end if;
end $$;

create schema plataforma;
grant usage on schema plataforma to sghu_api;
grant usage on schema extensions to sghu_api;

create table plataforma.idempotencia (
  alcance text not null,
  clave text not null,
  huella text not null,
  estado text not null check (estado in ('en_proceso', 'completada')),
  respuesta jsonb,
  creado_en timestamptz not null default now(),
  primary key (alcance, clave)
);

create table plataforma.outbox (
  seq bigint generated always as identity primary key,
  evento_id uuid not null unique default gen_random_uuid(),
  tipo text not null,
  entidad text not null,
  entidad_id text not null,
  version int,
  canales text[] not null default '{}',
  push boolean not null default false,
  ocurrido_en timestamptz not null default now(),
  correlacion text,
  publicado_en timestamptz,
  push_enviado_en timestamptz,
  intentos int not null default 0,
  ultimo_error text
);
create index outbox_push_pendiente on plataforma.outbox (seq) where push and push_enviado_en is null;

create table plataforma.inbox (
  consumidor text not null,
  evento_id uuid not null,
  procesado_en timestamptz not null default now(),
  primary key (consumidor, evento_id)
);

-- Auditoría: solo inserción, encadenada por SHA-256 calculado en la API sobre JSON canónico.
create table plataforma.auditoria (
  seq bigint generated always as identity primary key,
  evento_id uuid not null unique,
  registrado_en timestamptz not null,
  actor_id uuid,
  actor_rol text,
  permiso text,
  accion text not null,
  entidad text not null,
  entidad_id text,
  paciente_id uuid,
  motivo text,
  resultado text not null check (resultado in ('exito', 'denegado', 'fallido')),
  correlacion text,
  detalle jsonb not null default '{}'::jsonb,
  hash_previo bytea not null,
  hash bytea not null
);
create index auditoria_paciente on plataforma.auditoria (paciente_id, registrado_en);
create index auditoria_actor on plataforma.auditoria (actor_id, registrado_en);

create table plataforma.politica (
  id bigint generated always as identity primary key,
  clave text not null,
  valor jsonb not null,
  vigencia tstzrange not null,
  fuente text not null,
  aprobado_por text not null,
  aprobado_en timestamptz not null default now(),
  exclude using gist (clave with =, vigencia with &&)
);

grant select, insert, update on plataforma.idempotencia to sghu_api;
grant select, insert on plataforma.outbox to sghu_api;
grant update (publicado_en, push_enviado_en, intentos, ultimo_error) on plataforma.outbox to sghu_api;
grant select, insert on plataforma.inbox to sghu_api;
grant select, insert on plataforma.auditoria to sghu_api;   -- nunca update ni delete (FR-100-07)
grant select on plataforma.politica to sghu_api;
grant usage on all sequences in schema plataforma to sghu_api;

-- Publicación en Supabase Realtime (Broadcast desde la base). Se ejecuta dentro de la transacción del cambio:
-- si la transacción se revierte, el mensaje tampoco existe (FR-100-08, FR-100-09).
create function plataforma.publicar_evento() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  canal text;
  carga jsonb := jsonb_build_object(
    'tipo', new.tipo, 'entidad', new.entidad, 'id', new.entidad_id,
    'version', new.version, 'ocurrido', new.ocurrido_en);
begin
  foreach canal in array new.canales loop
    perform realtime.send(carga, new.tipo, canal, canal <> 'publico');
  end loop;
  update plataforma.outbox set publicado_en = now() where seq = new.seq;
  return null;
exception when others then
  update plataforma.outbox set intentos = intentos + 1, ultimo_error = sqlerrm where seq = new.seq;
  return null;
end $$;

create trigger outbox_publicar after insert on plataforma.outbox
  for each row execute function plataforma.publicar_evento();

-- Política vigente a una fecha (FR-100-10).
create function plataforma.politica_vigente(p_clave text, p_en timestamptz default now())
returns jsonb language sql stable set search_path = '' as $$
  select valor from plataforma.politica where clave = p_clave and vigencia @> p_en
$$;
grant execute on function plataforma.politica_vigente(text, timestamptz) to sghu_api;

-- Políticas iniciales (D-054, RN-03, RN-21, RN-40). Fuente y aprobación registradas.
insert into plataforma.politica (clave, valor, vigencia, fuente, aprobado_por) values
 ('turnos.duracion', '{"min_horas":4,"max_horas":12,"max_guardia_medica":24}', tstzrange('2026-10-01', null), 'D-054', 'equipo SGHU'),
 ('turnos.descanso', '{"min_horas":8,"tras_guardia_24h":12}', tstzrange('2026-10-01', null), 'D-054', 'equipo SGHU'),
 ('turnos.horas_semanales', '{"aviso_diurnas":44,"fuente":"Código de Trabajo Art. 161"}', tstzrange('2026-10-01', null), 'D-054', 'equipo SGHU'),
 ('turnos.cobertura_minima', '{"emergencia":{"MED":1,"ENF":1},"planta_con_ocupacion":{"ENF":1},"recepcion_horario":{"REC":1},"laboratorio_horario":{"LAB":1}}', tstzrange('2026-10-01', null), 'D-054, RN-15', 'equipo SGHU'),
 ('camas.reserva_horas', '{"horas":2}', tstzrange('2026-10-01', null), 'RN-03', 'equipo SGHU'),
 ('citas.cancelacion_horas', '{"horas":2}', tstzrange('2026-10-01', null), 'RN-21', 'equipo SGHU'),
 ('citas.franja_minutos', '{"minutos":20}', tstzrange('2026-10-01', null), 'spec 105', 'equipo SGHU'),
 ('fila.llamados_maximos', '{"llamados":3}', tstzrange('2026-10-01', null), 'RN-19', 'equipo SGHU'),
 ('privacidad.acceso_excepcional_max_horas', '{"horas":24}', tstzrange('2026-10-01', null), 'RN-40', 'equipo SGHU');
