-- Spec 112. Avisos y vistas públicas sin datos personales (REQ-PRV-01).

create schema publico;
grant usage on schema publico to sghu_api;

create table publico.aviso (
  id uuid primary key default gen_random_uuid(),
  titulo text not null check (length(titulo) <= 120),
  cuerpo text not null check (length(cuerpo) <= 1000),
  vigencia tstzrange not null,
  publicado_por uuid not null,
  creado_en timestamptz not null default now()
);
grant select, insert, update on publico.aviso to sghu_api;

-- Ocupación general por planta y categoría: solo números (FR-112-01).
create view publico.v_ocupacion as
  select nivel as planta, categoria,
         count(*) as camas,
         count(*) filter (where estado = 'libre') as libres,
         count(*) filter (where estado = 'ocupada') as ocupadas
  from infra.v_estado_cama
  group by nivel, categoria;

create view publico.v_avisos_vigentes as
  select id, titulo, cuerpo, lower(vigencia) as desde, upper(vigencia) as hasta
  from publico.aviso where vigencia @> now();

create view publico.v_medicos_de_turno as
  select m.nombre, m.especialidad, e.nombre as area, m.hasta
  from personal.v_medicos_de_turno m left join infra.espacio e on e.id = m.area_id;

grant select on publico.v_ocupacion, publico.v_avisos_vigentes, publico.v_medicos_de_turno to sghu_api;
