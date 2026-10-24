-- Specs 105 y 106. Fila del día, citas, consulta general, signos, diagnósticos, recetas, addendum y
-- relación de atención (D-033, D-035, RN-18 a RN-23).

create schema atencion;
grant usage on schema atencion to sghu_api;

create table atencion.contador_fila (
  servicio text not null,
  fecha date not null,
  ultimo int not null default 0,
  primary key (servicio, fecha)
);

create table atencion.ticket_fila (
  id uuid primary key default gen_random_uuid(),
  servicio text not null,
  fecha date not null,
  numero int not null check (numero > 0),
  paciente_id uuid,
  estado text not null default 'en_espera' check (estado in ('en_espera', 'llamado', 'en_atencion', 'atendido', 'no_se_presento')),
  consultorio_id uuid,
  llamados int not null default 0,
  emitido_por uuid,
  emitido_en timestamptz not null default now(),
  version int not null default 1,
  unique (servicio, fecha, numero)                       -- RN-18
);

-- Emisión atómica sin huecos ni repetidos (FR-105-01): una sola sentencia sobre el contador.
create function atencion.emitir_numero(p_servicio text, p_fecha date) returns int
language sql volatile set search_path = '' as $$
  insert into atencion.contador_fila as c (servicio, fecha, ultimo) values (p_servicio, p_fecha, 1)
  on conflict (servicio, fecha) do update set ultimo = c.ultimo + 1
  returning ultimo
$$;

-- Transiciones válidas del número de fila (RN-19).
create function atencion.validar_ticket() returns trigger language plpgsql set search_path = '' as $$
begin
  if old.estado <> new.estado and not (
       (old.estado = 'en_espera' and new.estado in ('llamado', 'no_se_presento'))
    or (old.estado = 'llamado' and new.estado in ('llamado', 'en_atencion', 'no_se_presento', 'en_espera'))
    or (old.estado = 'en_atencion' and new.estado = 'atendido')) then
    raise exception 'transicion_invalida % -> %', old.estado, new.estado using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger ticket_transicion before update of estado on atencion.ticket_fila
  for each row execute function atencion.validar_ticket();

create table atencion.cita (
  id uuid primary key default gen_random_uuid(),
  paciente_id uuid not null,
  medico_id uuid not null,                               -- personal.persona
  horario tstzrange not null,
  motivo text,
  estado text not null check (estado in ('solicitada', 'confirmada', 'atendida', 'cancelada', 'rechazada', 'no_asistio')),
  origen text not null check (origen in ('recepcion', 'paciente')),
  motivo_rechazo text,
  creado_por uuid,
  creado_en timestamptz not null default now(),
  version int not null default 1,
  -- RN-20: un médico no tiene dos citas a la vez.
  exclude using gist (medico_id with =, horario with &&) where (estado in ('solicitada', 'confirmada')),
  check (estado <> 'rechazada' or motivo_rechazo is not null)
);
create index cita_paciente on atencion.cita (paciente_id, horario);

create table atencion.cie10 (
  codigo text primary key,
  descripcion text not null
);

create table atencion.consulta (
  id uuid primary key default gen_random_uuid(),
  paciente_id uuid not null,
  medico_id uuid not null,
  consultorio_id uuid,
  ticket_id uuid references atencion.ticket_fila(id),
  cita_id uuid references atencion.cita(id),
  motivo text,
  examen_fisico text,
  plan text,
  estado text not null default 'abierta' check (estado in ('abierta', 'firmada', 'ingresada_por_error')),
  iniciada_en timestamptz not null default now(),
  firmada_en timestamptz,
  version int not null default 1,
  check (ticket_id is not null or cita_id is not null),  -- RN-22
  check (estado <> 'firmada' or firmada_en is not null)
);
create index consulta_paciente on atencion.consulta (paciente_id, iniciada_en desc);

-- RN-23: lo firmado no se edita; se corrige con addendum.
create function atencion.proteger_firmada() returns trigger language plpgsql set search_path = '' as $$
begin
  if old.estado = 'firmada' and (new.motivo is distinct from old.motivo or new.examen_fisico is distinct from old.examen_fisico
      or new.plan is distinct from old.plan or new.estado = 'abierta') then
    raise exception 'consulta_firmada' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger consulta_firmada before update on atencion.consulta
  for each row execute function atencion.proteger_firmada();

create table atencion.signos_vitales (
  id uuid primary key default gen_random_uuid(),
  paciente_id uuid not null,
  consulta_id uuid references atencion.consulta(id),
  admision_id uuid,
  tomado_por uuid not null,
  tomado_en timestamptz not null default now(),
  pa_sistolica int check (pa_sistolica between 40 and 300),
  pa_diastolica int check (pa_diastolica between 20 and 200),
  fc int check (fc between 20 and 250),
  fr int check (fr between 4 and 80),
  temperatura numeric(4,1) check (temperatura between 30 and 45),
  sat_o2 int check (sat_o2 between 40 and 100),
  peso_kg numeric(5,2) check (peso_kg between 0.3 and 400),
  talla_cm numeric(5,1) check (talla_cm between 20 and 250)
);

create table atencion.diagnostico (
  id uuid primary key default gen_random_uuid(),
  consulta_id uuid not null references atencion.consulta(id),
  cie10 text not null references atencion.cie10(codigo),
  principal boolean not null default false,
  nota text
);
create unique index diagnostico_principal_unico on atencion.diagnostico (consulta_id) where principal;

create table atencion.receta (
  id uuid primary key default gen_random_uuid(),
  consulta_id uuid not null references atencion.consulta(id),
  emitida_en timestamptz not null default now()
);
create table atencion.receta_item (
  id uuid primary key default gen_random_uuid(),
  receta_id uuid not null references atencion.receta(id),
  medicamento text not null,
  dosis text not null,
  via text not null,
  frecuencia text not null,
  duracion text not null,
  indicaciones text
);

create table atencion.addendum (
  id uuid primary key default gen_random_uuid(),
  consulta_id uuid not null references atencion.consulta(id),
  autor_id uuid not null,
  motivo text not null,
  texto text not null,
  original jsonb not null,
  creado_en timestamptz not null default now()
);

-- Relación de atención: base del contexto clínico de privacidad (spec 110).
create table atencion.relacion_atencion (
  id uuid primary key default gen_random_uuid(),
  paciente_id uuid not null,
  profesional_id uuid not null,                          -- personal.persona
  origen text not null check (origen in ('consulta', 'admision', 'ambulancia')),
  origen_id uuid not null,
  vigencia tstzrange not null default tstzrange(now(), now() + interval '30 days')
);
create index relacion_vigente on atencion.relacion_atencion using gist (profesional_id, paciente_id, vigencia);

grant select, insert, update on atencion.ticket_fila, atencion.cita, atencion.consulta, atencion.relacion_atencion to sghu_api;
grant select, insert, update on atencion.contador_fila to sghu_api;
grant select, insert on atencion.signos_vitales, atencion.diagnostico, atencion.receta, atencion.receta_item, atencion.addendum to sghu_api;
grant delete on atencion.diagnostico, atencion.receta_item to sghu_api;      -- solo mientras la consulta está abierta (validado en la API)
grant select on atencion.cie10 to sghu_api;
grant execute on function atencion.emitir_numero(text, date) to sghu_api;
