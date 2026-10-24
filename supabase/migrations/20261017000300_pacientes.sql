-- Spec 102. Pacientes: buscar antes de crear, identificadores con exclusividad garantizada por la base,
-- identidad provisional sin datos inventados, historial de solo inserción, casos de duplicado.
-- Portado de legado Identity 0001 (D-004, D-011, Norma 1616 Art. 11, 14, 42).

create schema pacientes;
grant usage on schema pacientes to sghu_api;

create sequence pacientes.expediente_seq start 1;
create sequence pacientes.provisional_seq start 1;

create table pacientes.tipo_identificador (
  codigo text primary key,
  nombre text not null,
  emisor text not null,
  exclusivo boolean not null,
  validador text
);
insert into pacientes.tipo_identificador values
 ('dui', 'Documento Único de Identidad', 'RNPN', true, 'dui'),
 ('nui', 'Número Único de Identidad', 'RNPN', true, null),
 ('partida_nacimiento', 'Partida de nacimiento', 'municipio', false, null),
 ('carne_minoridad', 'Carné de minoridad', 'municipio', false, null),
 ('pasaporte', 'Pasaporte', 'país', true, null),
 ('carne_residente', 'Carné de residente', 'DGME', true, null);

create table pacientes.paciente (
  id uuid primary key default gen_random_uuid(),
  expediente text not null unique,                       -- número con dígito ISO 7064 MOD 11-2 (calculado en la API)
  estado text not null default 'activo'
    check (estado in ('provisional', 'activo', 'inactivo', 'ingresado_por_error')),
  nombres text,
  primer_apellido text,
  segundo_apellido text,
  apellido_casada text,
  alias_provisional text unique,                         -- NN-2026-0001
  sexo text not null check (sexo in ('femenino', 'masculino', 'indeterminado', 'no_registrado')),
  nacimiento date,
  precision_nacimiento text not null
    check (precision_nacimiento in ('exacta', 'anio_mes', 'anio', 'estimada', 'desconocida')),
  edad_estimada int check (edad_estimada between 0 and 120),
  edad_estimada_en date,
  telefono text,
  correo text,
  direccion text,
  municipio text,
  contacto_emergencia jsonb,
  senas text,                                            -- descripción física de un paciente sin identidad
  busqueda_normalizada text not null default '',
  fon_apellido text not null default '',
  fon_nombres text not null default '',
  creado_en timestamptz not null default now(),
  creado_por uuid,
  version int not null default 1,
  -- D-004: una fecha estimada nunca se guarda como exacta; lo desconocido no se inventa.
  check (precision_nacimiento <> 'exacta' or nacimiento is not null),
  check (precision_nacimiento <> 'estimada' or (edad_estimada is not null and edad_estimada_en is not null)),
  check (estado <> 'provisional' or alias_provisional is not null)
);
create index paciente_trgm on pacientes.paciente using gin (busqueda_normalizada extensions.gin_trgm_ops);
create index paciente_fonetico on pacientes.paciente (fon_apellido, fon_nombres);

create table pacientes.identificador (
  id uuid primary key default gen_random_uuid(),
  paciente_id uuid not null references pacientes.paciente(id),
  tipo text not null references pacientes.tipo_identificador(codigo),
  emisor text not null,
  valor_original text not null,
  valor_normalizado text not null,
  estado text not null default 'sin_verificar' check (estado in ('sin_verificar', 'verificado', 'retirado', 'ingresado_por_error')),
  exclusivo boolean not null,
  creado_en timestamptz not null default now()
);
-- FR-102-03 y FR-102-12: un DUI activo pertenece a un solo paciente, también con registros simultáneos.
create unique index identificador_exclusivo on pacientes.identificador (tipo, emisor, valor_normalizado)
  where exclusivo and estado in ('sin_verificar', 'verificado');
create index identificador_valor on pacientes.identificador (valor_normalizado);

-- FR-102-06: historial de solo inserción.
create table pacientes.historial_demografico (
  paciente_id uuid not null references pacientes.paciente(id),
  version int not null,
  cambiado_en timestamptz not null default now(),
  actor_id uuid,
  motivo text not null,
  cambios jsonb not null,
  primary key (paciente_id, version)
);

-- FR-102-02: el registro exige una búsqueda reciente (token de 10 minutos).
create table pacientes.busqueda_registro (
  token uuid primary key default gen_random_uuid(),
  usuario_id uuid not null,
  huella_criterios text not null,
  resultados int not null,
  creado_en timestamptz not null default now(),
  vence_en timestamptz not null default now() + interval '10 minutes'
);

create table pacientes.caso_duplicado (
  id uuid primary key default gen_random_uuid(),
  pacientes_ids uuid[] not null check (cardinality(pacientes_ids) = 2),
  estado text not null default 'sospechado' check (estado in ('sospechado', 'en_revision', 'descartado', 'confirmado')),
  motivo text not null,
  abierto_por uuid,
  abierto_en timestamptz not null default now()
);
create unique index caso_duplicado_abierto on pacientes.caso_duplicado (pacientes_ids) where estado in ('sospechado', 'en_revision');

grant select, insert, update on pacientes.paciente, pacientes.identificador, pacientes.caso_duplicado to sghu_api;
grant select, insert on pacientes.historial_demografico, pacientes.busqueda_registro to sghu_api;
grant select on pacientes.tipo_identificador to sghu_api;
grant usage on all sequences in schema pacientes to sghu_api;

-- Vista publicada para otros módulos: datos mínimos y edad/sexo para rangos de laboratorio.
create view pacientes.v_paciente_basico as
  select id, expediente, estado, sexo, nacimiento, precision_nacimiento,
         coalesce(nullif(trim(concat_ws(' ', nombres, primer_apellido, segundo_apellido)), ''), alias_provisional) as nombre_completo
  from pacientes.paciente;
grant select on pacientes.v_paciente_basico to sghu_api;
