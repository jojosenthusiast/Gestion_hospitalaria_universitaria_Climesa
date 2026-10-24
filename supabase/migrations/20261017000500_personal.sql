-- Spec 103. Personal de salud (con o sin cuenta, D-053), inscripciones y turnos sin traslape (D-054, RN-12 a RN-17).

create schema personal;
grant usage on schema personal to sghu_api;

create table personal.persona (
  id uuid primary key default gen_random_uuid(),
  nombres text not null,
  apellidos text not null,
  tipo text not null check (tipo in ('medico', 'enfermero', 'asistente', 'recepcionista', 'laboratorista', 'paramedico', 'motorista', 'limpieza', 'administrativo', 'otro')),
  especialidad text,                                     -- medicina general, alergología, emergencias...
  area_id uuid,                                          -- infra.espacio (llave lógica)
  telefono text,
  dui text,
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  version int not null default 1
);

create table personal.inscripcion (
  id uuid primary key default gen_random_uuid(),
  persona_id uuid not null references personal.persona(id),
  junta text not null check (junta in ('JVPM', 'JVPE', 'JVPL', 'JVPO', 'otra')),
  numero text not null,
  vigencia daterange not null,
  unique (junta, numero)
);

create table personal.turno (
  id uuid primary key default gen_random_uuid(),
  persona_id uuid not null references personal.persona(id),
  area_id uuid not null,
  periodo tstzrange not null check (not isempty(periodo) and lower(periodo) is not null and upper(periodo) is not null),
  tipo text not null check (tipo in ('diurno', 'nocturno', 'guardia')),
  estado text not null default 'borrador' check (estado in ('borrador', 'publicado', 'en_curso', 'completado', 'cancelado')),
  justificacion text,
  publicado_por uuid,
  publicado_en timestamptz,
  creado_por uuid,
  version int not null default 1,
  -- Límite duro; la política turnos.duracion afina en la API (4 a 12 h, guardia médica hasta 24 h).
  check (upper(periodo) - lower(periodo) between interval '4 hours' and interval '24 hours'),
  -- FR-103-04: una persona no tiene dos turnos que se traslapen, garantizado por la base.
  exclude using gist (persona_id with =, periodo with &&) where (estado <> 'cancelado')
);
create index turno_area_periodo on personal.turno using gist (area_id, periodo);

grant select, insert, update on personal.persona, personal.inscripcion, personal.turno to sghu_api;

-- Inscripción vigente en una fecha (D-012, RN-16).
create function personal.inscrito(p_persona uuid, p_en date default current_date) returns boolean
language sql stable set search_path = '' as $$
  select exists (select 1 from personal.inscripcion where persona_id = p_persona and vigencia @> p_en)
$$;
grant execute on function personal.inscrito(uuid, date) to sghu_api;

-- Vista pública de médicos de turno (REQ-TUR-02, RN-17): solo nombre, especialidad y área.
create view personal.v_medicos_de_turno as
  select p.nombres || ' ' || p.apellidos as nombre, coalesce(p.especialidad, 'Medicina general') as especialidad,
         t.area_id, lower(t.periodo) as desde, upper(t.periodo) as hasta
  from personal.turno t join personal.persona p on p.id = t.persona_id
  where p.tipo = 'medico' and t.estado in ('publicado', 'en_curso') and t.periodo @> now();
grant select on personal.v_medicos_de_turno to sghu_api;

-- Personal con turno en curso por área (contexto "área" de privacidad y regla RN-30).
create view personal.v_turno_en_curso as
  select t.persona_id, p.tipo, t.area_id, t.periodo
  from personal.turno t join personal.persona p on p.id = t.persona_id
  where t.estado in ('publicado', 'en_curso') and t.periodo @> now();
grant select on personal.v_turno_en_curso to sghu_api;
