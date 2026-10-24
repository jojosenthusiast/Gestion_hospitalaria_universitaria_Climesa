-- Spec 108. Admisión robusta (D-030, D-038), ocupación de cama sin traslapes (REQ-HAB-03), traslados con regla VIP
-- (D-037), alta y salida física (RN-02 a RN-11).

create schema hospitalizacion;
grant usage on schema hospitalizacion to sghu_api;

create table hospitalizacion.admision (
  id uuid primary key default gen_random_uuid(),
  paciente_id uuid not null,
  origen text not null check (origen in ('consulta', 'emergencia', 'ambulancia', 'programada')),
  origen_id uuid,
  categoria_pedida text not null check (categoria_pedida in ('vip', 'semiprivada')),
  sexo_paciente text not null check (sexo_paciente in ('femenino', 'masculino', 'indeterminado', 'no_registrado')),
  aislamiento boolean not null default false,
  medico_tratante_id uuid not null,
  fecha_programada timestamptz,
  estado text not null default 'pendiente_cama'
    check (estado in ('pendiente_cama', 'hospitalizado', 'alta_firmada', 'egresado', 'cancelada')),
  autorizado_por uuid,                                   -- excepción autorizada por JOP (FR-108-04)
  creado_por uuid,
  creado_en timestamptz not null default now(),
  version int not null default 1,
  check (origen = 'programada' or origen_id is not null),
  check (origen <> 'programada' or fecha_programada is not null)
);
-- RN-10: una sola admisión activa por paciente.
create unique index admision_activa_unica on hospitalizacion.admision (paciente_id)
  where estado in ('pendiente_cama', 'hospitalizado', 'alta_firmada');

create table hospitalizacion.ocupacion_cama (
  id uuid primary key default gen_random_uuid(),
  admision_id uuid not null references hospitalizacion.admision(id),
  cama_id uuid not null,                                 -- infra.espacio tipo cama
  habitacion_id uuid not null,
  categoria text not null check (categoria in ('vip', 'semiprivada')),
  periodo tstzrange not null,
  motivo_fin text check (motivo_fin in ('traslado', 'egreso', 'ingresado_por_error')),
  asignado_por uuid,
  clave_idempotencia text unique,
  -- RN-02 y FR-108-05: la base de datos impide dos ocupaciones simultáneas de la misma cama.
  exclude using gist (cama_id with =, periodo with &&),
  -- Un paciente ocupa una sola cama a la vez.
  exclude using gist (admision_id with =, periodo with &&)
);

create table hospitalizacion.reserva_cama (
  id uuid primary key default gen_random_uuid(),
  admision_id uuid not null references hospitalizacion.admision(id),
  cama_id uuid not null,
  periodo tstzrange not null,
  estado text not null default 'activa' check (estado in ('activa', 'usada', 'vencida', 'cancelada')),
  exclude using gist (cama_id with =, periodo with &&) where (estado = 'activa')
);

create table hospitalizacion.traslado (
  id uuid primary key default gen_random_uuid(),
  admision_id uuid not null references hospitalizacion.admision(id),
  ocupacion_origen_id uuid not null references hospitalizacion.ocupacion_cama(id),
  ocupacion_destino_id uuid not null references hospitalizacion.ocupacion_cama(id),
  motivo text not null,
  realizado_por uuid not null,
  realizado_en timestamptz not null default now()
);

-- D-037: quien ocupa una VIP no se traslada.
create function hospitalizacion.validar_traslado() returns trigger language plpgsql set search_path = '' as $$
begin
  if (select categoria from hospitalizacion.ocupacion_cama where id = new.ocupacion_origen_id) = 'vip' then
    raise exception 'vip_no_se_traslada' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger traslado_vip before insert on hospitalizacion.traslado
  for each row execute function hospitalizacion.validar_traslado();

create table hospitalizacion.alta (
  admision_id uuid primary key references hospitalizacion.admision(id),
  tipo text not null check (tipo in ('medica', 'voluntaria', 'traslado', 'defuncion')),
  firmada_por uuid not null,
  firmada_en timestamptz not null default now(),
  resumen text,
  pendientes jsonb not null default '[]'::jsonb,
  constancia_voluntaria boolean not null default false,
  check (tipo <> 'voluntaria' or constancia_voluntaria),
  -- RN-11: cada pendiente tiene responsable.
  check (not jsonb_path_exists(pendientes, '$[*] ? (!exists(@.responsable) || @.responsable == "")'))
);

create table hospitalizacion.nota_enfermeria (
  id uuid primary key default gen_random_uuid(),
  admision_id uuid not null references hospitalizacion.admision(id),
  autor_id uuid not null,
  texto text not null,
  creada_en timestamptz not null default now()
);

grant select, insert, update on hospitalizacion.admision, hospitalizacion.ocupacion_cama, hospitalizacion.reserva_cama to sghu_api;
grant select, insert on hospitalizacion.traslado, hospitalizacion.alta, hospitalizacion.nota_enfermeria to sghu_api;

-- Vista publicada (FR-108-15): ocupación activa sin datos personales.
create view hospitalizacion.v_ocupacion_activa as
  select o.cama_id, o.habitacion_id, o.categoria, a.sexo_paciente, a.aislamiento, o.admision_id
  from hospitalizacion.ocupacion_cama o join hospitalizacion.admision a on a.id = o.admision_id
  where o.periodo @> now();
create view hospitalizacion.v_reserva_activa as
  select cama_id, admision_id from hospitalizacion.reserva_cama where estado = 'activa' and periodo @> now();
grant select on hospitalizacion.v_ocupacion_activa, hospitalizacion.v_reserva_activa to sghu_api;

-- Estado de cada cama (RN-03): combina infraestructura y hospitalización. Pertenece a infra, lee solo vistas publicadas.
create view infra.v_estado_cama as
  select c.id as cama_id, c.codigo, c.nombre, h.id as habitacion_id, h.codigo as habitacion, h.categoria, h.nivel,
    case
      when o.cama_id is not null then 'ocupada'
      when l.cama_id is not null then 'limpieza'
      when b.cama_id is not null then 'bloqueada'
      when r.cama_id is not null then 'reservada'
      else 'libre'
    end as estado,
    o.sexo_paciente, coalesce(o.aislamiento, false) as aislamiento, o.admision_id
  from infra.espacio c
  join infra.espacio h on h.id = c.padre_id and h.tipo = 'habitacion'
  left join hospitalizacion.v_ocupacion_activa o on o.cama_id = c.id
  left join (select distinct cama_id from infra.limpieza_cama where verificada_en is null) l on l.cama_id = c.id
  left join (select distinct cama_id from infra.bloqueo_cama where periodo @> now()) b on b.cama_id = c.id
  left join hospitalizacion.v_reserva_activa r on r.cama_id = c.id
  where c.tipo = 'cama' and c.activo;
grant select on infra.v_estado_cama to sghu_api;
