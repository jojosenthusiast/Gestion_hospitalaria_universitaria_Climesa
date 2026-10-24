-- Spec 101 y 110. Cuentas, roles, permisos, vinculación de pacientes, accesos excepcionales y dispositivos push.
-- Supabase Auth autentica; estas tablas autorizan (ADR-0004, D-031, D-032, D-050 a D-053).

create schema acceso;
grant usage on schema acceso to sghu_api;

create table acceso.rol (
  codigo text primary key check (codigo ~ '^[A-Z]{3}$'),
  nombre text not null,
  plataformas text[] not null,
  descripcion text not null
);

create table acceso.permiso (
  codigo text primary key,
  descripcion text not null
);

-- contexto: x (sin condición), propio, relacion, area, autor, propio_revisado, consumo, reactivos
create table acceso.rol_permiso (
  rol_codigo text not null references acceso.rol(codigo),
  permiso_codigo text not null references acceso.permiso(codigo),
  contexto text not null,
  primary key (rol_codigo, permiso_codigo)
);

create table acceso.usuario (
  id uuid primary key,                          -- igual a auth.users.id
  correo text not null,
  nombre_mostrar text not null default '',
  persona_personal_id uuid,                     -- personal.persona (llave lógica)
  paciente_id uuid,                             -- pacientes.paciente, solo tras vinculación aprobada
  estado text not null default 'activo' check (estado in ('activo', 'desactivado')),
  creado_en timestamptz not null default now(),
  version int not null default 1
);
create unique index usuario_persona_unica on acceso.usuario (persona_personal_id) where persona_personal_id is not null;
create unique index usuario_paciente_unico on acceso.usuario (paciente_id) where paciente_id is not null;

create table acceso.asignacion_rol (
  usuario_id uuid not null references acceso.usuario(id),
  rol_codigo text not null references acceso.rol(codigo),
  asignado_por uuid,                            -- nulo solo para el registro automático de pacientes
  asignado_en timestamptz not null default now(),
  primary key (usuario_id, rol_codigo),
  check (asignado_por is null or asignado_por <> usuario_id)   -- RN-38
);

create table acceso.vinculacion_paciente (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references acceso.usuario(id),
  dui_declarado text not null,
  nacimiento_declarado date not null,
  paciente_candidato_id uuid,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'aprobada', 'rechazada')),
  motivo_rechazo text,
  verificado_por uuid references acceso.usuario(id),
  creado_en timestamptz not null default now(),
  resuelto_en timestamptz,
  check (estado <> 'rechazada' or motivo_rechazo is not null),
  check (verificado_por is null or verificado_por <> usuario_id)
);
create unique index vinculacion_pendiente_unica on acceso.vinculacion_paciente (usuario_id) where estado = 'pendiente';

create table acceso.acceso_excepcional (
  id uuid primary key default gen_random_uuid(),
  solicitante_id uuid not null references acceso.usuario(id),
  paciente_id uuid not null,
  motivo text not null check (length(trim(motivo)) >= 10),
  horas int not null check (horas between 1 and 24),          -- RN-40
  vigencia tstzrange,                                          -- se fija al aprobar
  estado text not null default 'pendiente' check (estado in ('pendiente', 'aprobado', 'negado')),
  urgencia boolean not null default false,                     -- romper el vidrio (FR-110-09)
  resuelto_por uuid references acceso.usuario(id),
  resuelto_en timestamptz,
  creado_en timestamptz not null default now(),
  check (resuelto_por is null or resuelto_por <> solicitante_id),   -- nunca el propio (RN-38)
  check (estado <> 'aprobado' or vigencia is not null)
);
create index acceso_excepcional_vigente on acceso.acceso_excepcional using gist (solicitante_id, paciente_id, vigencia) where estado = 'aprobado';

create table acceso.dispositivo_push (
  usuario_id uuid not null references acceso.usuario(id),
  plataforma text not null check (plataforma in ('android', 'ios')),
  token text not null,
  actualizado_en timestamptz not null default now(),
  primary key (usuario_id, token)
);

grant select on acceso.rol, acceso.permiso, acceso.rol_permiso to sghu_api;
grant select, insert, update on acceso.usuario, acceso.vinculacion_paciente, acceso.acceso_excepcional to sghu_api;
grant select, insert, delete on acceso.asignacion_rol, acceso.dispositivo_push to sghu_api;

-- Permisos efectivos de un usuario activo (usado por la API, FR-100-02).
create view acceso.v_permisos_usuario as
  select a.usuario_id, rp.permiso_codigo, rp.contexto, a.rol_codigo
  from acceso.asignacion_rol a
  join acceso.usuario u on u.id = a.usuario_id and u.estado = 'activo'
  join acceso.rol_permiso rp on rp.rol_codigo = a.rol_codigo;
grant select on acceso.v_permisos_usuario to sghu_api;

-- Último administrador (FR-101-06): no se puede quitar el rol ADM al último usuario activo que lo tiene.
create function acceso.proteger_ultimo_admin() returns trigger language plpgsql set search_path = '' as $$
begin
  if old.rol_codigo = 'ADM' and not exists (
      select 1 from acceso.asignacion_rol a join acceso.usuario u on u.id = a.usuario_id
      where a.rol_codigo = 'ADM' and u.estado = 'activo' and a.usuario_id <> old.usuario_id) then
    raise exception 'ultimo_administrador' using errcode = 'P0001';
  end if;
  return old;
end $$;
create trigger asignacion_ultimo_admin before delete on acceso.asignacion_rol
  for each row execute function acceso.proteger_ultimo_admin();

-- Alta automática al registrarse en Supabase Auth (FR-101-02). El personal invitado llega con
-- raw_app_meta_data.invitado = true y la API le asigna roles; quien se registra solo recibe PAC.
create function acceso.alta_usuario() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into acceso.usuario (id, correo, nombre_mostrar)
  values (new.id, coalesce(new.email, ''), coalesce(new.raw_user_meta_data ->> 'nombre', ''))
  on conflict (id) do nothing;
  if coalesce(new.raw_app_meta_data ->> 'invitado', 'false') <> 'true' then
    insert into acceso.asignacion_rol (usuario_id, rol_codigo, asignado_por)
    values (new.id, 'PAC', null) on conflict do nothing;
  end if;
  return new;
end $$;
create trigger alta_usuario_sghu after insert on auth.users
  for each row execute function acceso.alta_usuario();

-- Canales de Realtime permitidos para un usuario (ADR-0005). El área de turno se agrega en spec 103.
create function acceso.canales_de(p_usuario uuid) returns text[] language sql stable security definer set search_path = '' as $$
  select array['publico', 'usuario:' || p_usuario::text]
      || coalesce(array_agg(distinct 'rol:' || a.rol_codigo), '{}')
      || case when bool_or(a.rol_codigo in ('REC', 'JOP', 'PAR')) then array['ambulancia'] else '{}'::text[] end
  from acceso.asignacion_rol a join acceso.usuario u on u.id = a.usuario_id and u.estado = 'activo'
  where a.usuario_id = p_usuario
$$;

-- Gancho de token de Supabase Auth (Custom Access Token Hook). Se activa en el panel de Supabase:
-- Authentication > Hooks > Customize Access Token > acceso.hook_token. Solo informa canales; la API no lo usa para autorizar.
create function acceso.hook_token(event jsonb) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  claims jsonb := coalesce(event -> 'claims', '{}'::jsonb);
begin
  claims := jsonb_set(claims, '{app_canales}', to_jsonb(acceso.canales_de((event ->> 'user_id')::uuid)));
  return jsonb_set(event, '{claims}', claims);
end $$;

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    grant usage on schema acceso to supabase_auth_admin;
    grant execute on function acceso.hook_token(jsonb) to supabase_auth_admin;
    grant execute on function acceso.canales_de(uuid) to supabase_auth_admin;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke execute on function acceso.hook_token(jsonb) from authenticated, anon, public;
  end if;
end $$;
