-- Spec 104. Edificio como árbol (D-062), capacidad por habitación, bloqueos, limpieza verificada por otra persona,
-- equipo médico. REQ-HAB-01 a 07, RN-01 a RN-04.

create schema infra;
grant usage on schema infra to sghu_api;

create table infra.espacio (
  id uuid primary key default gen_random_uuid(),
  padre_id uuid references infra.espacio(id),
  tipo text not null check (tipo in ('hospital', 'planta', 'area', 'habitacion', 'cama', 'consultorio', 'cubiculo', 'bodega', 'bahia')),
  codigo text not null unique,
  nombre text not null,
  categoria text check (categoria in ('vip', 'semiprivada')),
  capacidad int check (capacidad > 0),
  nivel int,                                             -- número de planta
  activo boolean not null default true,
  version int not null default 1,
  check ((tipo = 'hospital') = (padre_id is null)),
  check (tipo <> 'habitacion' or (categoria is not null and capacidad is not null)),
  check (categoria is null or tipo = 'habitacion')
);
create index espacio_padre on infra.espacio (padre_id);

-- Sin ciclos en el árbol y camas solo dentro de habitaciones o cubículos.
create function infra.validar_arbol() returns trigger language plpgsql set search_path = '' as $$
declare
  tipo_padre text;
begin
  if new.padre_id is not null then
    select tipo into tipo_padre from infra.espacio where id = new.padre_id;
    if new.tipo = 'cama' and tipo_padre <> 'habitacion' then
      raise exception 'cama_fuera_de_habitacion' using errcode = 'P0001';
    end if;
    if exists (
      with recursive ancestros(id, padre_id) as (
        select id, padre_id from infra.espacio where id = new.padre_id
        union all
        select e.id, e.padre_id from infra.espacio e join ancestros a on e.id = a.padre_id
      ) cycle id set es_ciclo using ruta
      select 1 from ancestros where id = new.id
    ) then
      raise exception 'ciclo_en_arbol' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
create trigger espacio_arbol before insert or update of padre_id, tipo on infra.espacio
  for each row execute function infra.validar_arbol();

-- FR-104-03: una habitación no tiene más camas activas que su capacidad. Bloquea la fila de la habitación
-- para que dos inserciones simultáneas no pasen ambas.
create function infra.validar_capacidad() returns trigger language plpgsql set search_path = '' as $$
declare
  cap int;
  camas int;
begin
  if new.tipo = 'cama' and new.activo then
    select capacidad into cap from infra.espacio where id = new.padre_id for update;
    select count(*) into camas from infra.espacio
      where padre_id = new.padre_id and tipo = 'cama' and activo and id <> new.id;
    if camas + 1 > cap then
      raise exception 'capacidad_excedida' using errcode = 'P0001';
    end if;
  elsif new.tipo = 'habitacion' and tg_op = 'UPDATE' then
    select count(*) into camas from infra.espacio where padre_id = new.id and tipo = 'cama' and activo;
    if camas > new.capacidad then
      raise exception 'capacidad_menor_que_camas' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
create trigger espacio_capacidad before insert or update on infra.espacio
  for each row execute function infra.validar_capacidad();

create table infra.bloqueo_cama (
  id uuid primary key default gen_random_uuid(),
  cama_id uuid not null references infra.espacio(id),
  periodo tstzrange not null,
  motivo text not null check (length(trim(motivo)) >= 5),
  origen text not null default 'manual' check (origen in ('manual', 'aislamiento')),
  creado_por uuid,
  creado_en timestamptz not null default now(),
  exclude using gist (cama_id with =, periodo with &&)
);

create table infra.limpieza_cama (
  id uuid primary key default gen_random_uuid(),
  cama_id uuid not null references infra.espacio(id),
  pendiente_desde timestamptz not null default now(),
  limpiada_por uuid,
  limpiada_en timestamptz,
  lista jsonb,
  verificada_por uuid,
  verificada_en timestamptz,
  check (verificada_por is null or verificada_por <> limpiada_por),   -- D-013
  check (verificada_en is null or limpiada_en is not null)
);
create unique index limpieza_abierta_unica on infra.limpieza_cama (cama_id) where verificada_en is null;

create table infra.tipo_equipo (
  codigo text primary key,
  nombre text not null
);

create table infra.equipo (
  id uuid primary key default gen_random_uuid(),
  tipo text not null references infra.tipo_equipo(codigo),
  serie text unique,
  espacio_id uuid references infra.espacio(id),
  estado text not null default 'operativo' check (estado in ('operativo', 'mantenimiento', 'baja')),
  version int not null default 1
);

grant select, insert, update on infra.espacio, infra.bloqueo_cama, infra.limpieza_cama, infra.equipo to sghu_api;
grant select on infra.tipo_equipo to sghu_api;

-- Ruta legible de un espacio: "Planta 2 > HAB-203 > Cama B" (FR-104-13).
create function infra.ruta(p_id uuid) returns text language sql stable set search_path = '' as $$
  with recursive sube(id, padre_id, nombre, prof) as (
    select id, padre_id, nombre, 0 from infra.espacio where id = p_id
    union all
    select e.id, e.padre_id, e.nombre, s.prof + 1 from infra.espacio e join sube s on e.id = s.padre_id
  )
  select string_agg(nombre, ' > ' order by prof desc) from sube where padre_id is not null
$$;
grant execute on function infra.ruta(uuid) to sghu_api;
