-- Spec 107. Catálogo recursivo (paneles), rangos por sexo y edad con vigencia, órdenes con estados del curso
-- (Pendiente, En Proceso, Completado) más Cancelado y la marca de revisión (D-039, D-040, D-059, RN-24 a RN-27).

create schema laboratorio;
grant usage on schema laboratorio to sghu_api;

create table laboratorio.examen (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nombre text not null,
  es_panel boolean not null default false,
  unidad text,
  tipo_resultado text not null default 'numerico' check (tipo_resultado in ('numerico', 'texto')),
  activo boolean not null default true,
  check (es_panel or unidad is not null or tipo_resultado = 'texto')
);

create table laboratorio.examen_componente (
  panel_id uuid not null references laboratorio.examen(id),
  componente_id uuid not null references laboratorio.examen(id),
  orden int not null default 0,
  primary key (panel_id, componente_id),
  check (panel_id <> componente_id)
);

-- RN-27: sin ciclos en el catálogo.
create function laboratorio.validar_componente() returns trigger language plpgsql set search_path = '' as $$
begin
  if not (select es_panel from laboratorio.examen where id = new.panel_id) then
    raise exception 'componente_de_no_panel' using errcode = 'P0001';
  end if;
  if exists (
    with recursive baja(id) as (
      select new.componente_id
      union
      select c.componente_id from laboratorio.examen_componente c join baja b on c.panel_id = b.id
    )
    select 1 from baja where id = new.panel_id
  ) then
    raise exception 'ciclo_en_catalogo' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger componente_sin_ciclo before insert or update on laboratorio.examen_componente
  for each row execute function laboratorio.validar_componente();

-- Exámenes hoja de un examen o panel (FR-107-02).
create function laboratorio.hojas(p_examen uuid) returns setof uuid language sql stable set search_path = '' as $$
  with recursive baja(id) as (
    select p_examen
    union
    select c.componente_id from laboratorio.examen_componente c join baja b on c.panel_id = b.id
  )
  select b.id from baja b join laboratorio.examen e on e.id = b.id where not e.es_panel
$$;

create table laboratorio.rango_referencia (
  id uuid primary key default gen_random_uuid(),
  examen_id uuid not null references laboratorio.examen(id),
  sexo text not null check (sexo in ('femenino', 'masculino', 'cualquiera')),
  edad_anios int4range not null,
  minimo numeric,
  maximo numeric,
  critico_bajo numeric,
  critico_alto numeric,
  vigencia daterange not null,
  fuente text not null,
  check (minimo is null or maximo is null or minimo <= maximo),
  exclude using gist (examen_id with =, sexo with =, edad_anios with &&, vigencia with &&)
);

create table laboratorio.orden (
  id uuid primary key default gen_random_uuid(),
  consulta_id uuid,
  admision_id uuid,
  paciente_id uuid not null,
  medico_id uuid not null,
  prioridad text not null default 'rutina' check (prioridad in ('rutina', 'urgente')),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'en_proceso', 'completado', 'cancelado')),
  motivo_cancelacion text,
  muestra_tomada_en timestamptz,
  muestra_tomada_por uuid,
  completada_en timestamptz,
  completada_por uuid,
  revisada_en timestamptz,                               -- D-040: el paciente ve valores solo con esta marca
  revisada_por uuid,
  creada_en timestamptz not null default now(),
  version int not null default 1,
  check (consulta_id is not null or admision_id is not null),
  check (estado <> 'cancelado' or motivo_cancelacion is not null),
  check (revisada_en is null or estado = 'completado')
);
create index orden_cola on laboratorio.orden (estado, prioridad, creada_en);
create index orden_paciente on laboratorio.orden (paciente_id, creada_en desc);

-- FR-107-13: solo Pendiente -> En Proceso -> Completado, y Pendiente o En Proceso -> Cancelado.
create function laboratorio.validar_orden() returns trigger language plpgsql set search_path = '' as $$
begin
  if old.estado <> new.estado and not (
       (old.estado = 'pendiente' and new.estado in ('en_proceso', 'cancelado'))
    or (old.estado = 'en_proceso' and new.estado in ('completado', 'cancelado'))) then
    raise exception 'transicion_invalida % -> %', old.estado, new.estado using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger orden_transicion before update of estado on laboratorio.orden
  for each row execute function laboratorio.validar_orden();

create table laboratorio.orden_item (
  id uuid primary key default gen_random_uuid(),
  orden_id uuid not null references laboratorio.orden(id),
  examen_id uuid not null references laboratorio.examen(id),
  pedido_como uuid references laboratorio.examen(id),    -- panel original
  unique (orden_id, examen_id)                           -- cada hoja una sola vez
);

create table laboratorio.resultado (
  orden_item_id uuid primary key references laboratorio.orden_item(id),
  valor numeric,
  texto text,
  marca text not null check (marca in ('normal', 'alto', 'bajo', 'critico_alto', 'critico_bajo', 'sin_rango')),
  rango_id uuid references laboratorio.rango_referencia(id),
  capturado_por uuid not null,
  capturado_en timestamptz not null default now(),
  version int not null default 1,
  check (valor is not null or texto is not null)
);

create table laboratorio.resultado_historial (
  orden_item_id uuid not null,
  version int not null,
  valor numeric,
  texto text,
  marca text not null,
  cambiado_por uuid not null,
  cambiado_en timestamptz not null default now(),
  motivo text not null,
  primary key (orden_item_id, version)
);

grant select, insert, update on laboratorio.examen, laboratorio.examen_componente, laboratorio.rango_referencia,
  laboratorio.orden, laboratorio.resultado to sghu_api;
grant select, insert on laboratorio.orden_item, laboratorio.resultado_historial to sghu_api;
grant execute on function laboratorio.hojas(uuid) to sghu_api;
