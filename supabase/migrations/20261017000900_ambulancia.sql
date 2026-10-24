-- Spec 109. Una sola ambulancia (REQ-AMB-01), estados Disponible, En Servicio, En Mantenimiento (REQ-AMB-02),
-- un servicio activo por unidad (REQ-AMB-05), hitos en orden, prehospital idempotente, bitácora (RN-28 a RN-35).

create schema ambulancia;
grant usage on schema ambulancia to sghu_api;

create table ambulancia.unidad (
  id uuid primary key default gen_random_uuid(),
  placa text not null unique,
  estado text not null default 'disponible' check (estado in ('disponible', 'en_servicio', 'en_mantenimiento')),
  version int not null default 1
);

create table ambulancia.cambio_estado (
  id bigint generated always as identity primary key,
  unidad_id uuid not null references ambulancia.unidad(id),
  desde text not null,
  hacia text not null,
  motivo text,
  por uuid,
  en timestamptz not null default now()
);

create table ambulancia.solicitud (
  id uuid primary key default gen_random_uuid(),
  canal text not null check (canal in ('app_paciente', 'telefono')),
  solicitante_usuario_id uuid,
  paciente_id uuid,
  direccion text not null,
  latitud numeric(9,6),
  longitud numeric(9,6),
  municipio text,
  motivo text not null,
  telefono_contacto text not null,
  estado text not null default 'por_confirmar' check (estado in ('por_confirmar', 'confirmada', 'descartada', 'cancelada')),
  motivo_descarte text,
  creada_en timestamptz not null default now(),
  resuelta_por uuid,
  check (estado <> 'descartada' or motivo_descarte is not null)
);

create table ambulancia.servicio (
  id uuid primary key default gen_random_uuid(),
  unidad_id uuid not null references ambulancia.unidad(id),
  solicitud_id uuid unique references ambulancia.solicitud(id),
  tipo text not null check (tipo in ('emergencia_domicilio', 'traslado_interhospitalario')),
  prioridad text not null check (prioridad in ('roja', 'naranja', 'amarilla', 'verde')),
  paciente_id uuid,
  origen text not null,
  destino text not null,
  municipio text,
  despachado_por uuid not null,
  despachado_en timestamptz not null default now(),
  finalizado_en timestamptz,
  estado_final text check (estado_final in ('completado', 'cancelado', 'sin_traslado', 'rechaza_traslado')),
  motivo_final text,
  clave_idempotencia text unique,
  check ((finalizado_en is null) = (estado_final is null))
);
-- REQ-AMB-05: un solo servicio activo por unidad, aunque dos personas despachen a la vez.
create unique index servicio_activo_unico on ambulancia.servicio (unidad_id) where finalizado_en is null;

create table ambulancia.tripulacion (
  servicio_id uuid not null references ambulancia.servicio(id),
  persona_id uuid not null,
  funcion text not null check (funcion in ('paramedico', 'motorista', 'medico', 'enfermero')),
  primary key (servicio_id, persona_id)
);

create table ambulancia.hito (
  id uuid primary key default gen_random_uuid(),
  servicio_id uuid not null references ambulancia.servicio(id),
  tipo text not null check (tipo in ('salida', 'en_escena', 'trasladando', 'en_hospital', 'finalizado')),
  ocurrido_en timestamptz not null,
  registrado_en timestamptz not null default now(),
  registrado_por uuid not null,
  clave_idempotencia text not null unique,
  unique (servicio_id, tipo)
);

-- RN-32: hitos en orden.
create function ambulancia.validar_hito() returns trigger language plpgsql set search_path = '' as $$
declare
  orden constant text[] := array['salida', 'en_escena', 'trasladando', 'en_hospital', 'finalizado'];
  previo text;
begin
  if new.tipo <> 'salida' and new.tipo <> 'finalizado' then
    previo := orden[array_position(orden, new.tipo) - 1];
    if not exists (select 1 from ambulancia.hito where servicio_id = new.servicio_id and tipo = previo) then
      raise exception 'hito_fuera_de_orden' using errcode = 'P0001';
    end if;
  elsif new.tipo = 'finalizado' and not exists (select 1 from ambulancia.hito where servicio_id = new.servicio_id and tipo = 'salida') then
    raise exception 'hito_fuera_de_orden' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger hito_orden before insert on ambulancia.hito
  for each row execute function ambulancia.validar_hito();

create table ambulancia.reporte_prehospital (
  id uuid primary key default gen_random_uuid(),
  servicio_id uuid not null references ambulancia.servicio(id),
  motivo text not null,
  prioridad text not null check (prioridad in ('roja', 'naranja', 'amarilla', 'verde')),
  signos jsonb not null default '{}'::jsonb,
  llegada_estimada timestamptz,
  enviado_por uuid not null,
  capturado_en timestamptz not null,                     -- hora del teléfono (puede llegar tarde sin señal)
  recibido_en timestamptz not null default now(),
  recibido_por uuid,
  clave_idempotencia text not null unique                -- RN-34: el reenvío no duplica
);

create table ambulancia.ubicacion (
  id bigint generated always as identity primary key,
  servicio_id uuid not null references ambulancia.servicio(id),
  latitud numeric(9,6) not null,
  longitud numeric(9,6) not null,
  capturada_en timestamptz not null
);
create index ubicacion_servicio on ambulancia.ubicacion (servicio_id, capturada_en desc);

grant select, insert, update on ambulancia.unidad, ambulancia.solicitud, ambulancia.servicio, ambulancia.reporte_prehospital to sghu_api;
grant select, insert on ambulancia.cambio_estado, ambulancia.tripulacion, ambulancia.hito, ambulancia.ubicacion to sghu_api;
grant usage on all sequences in schema ambulancia to sghu_api;

-- Bitácora (REQ-AMB-03, D-056). Los datos del paciente se agregan en la API solo con relación de atención.
create view ambulancia.v_bitacora as
  select s.id, s.tipo, s.prioridad, s.origen, s.destino, s.municipio, s.despachado_en, s.finalizado_en, s.estado_final,
         (select min(h.ocurrido_en) from ambulancia.hito h where h.servicio_id = s.id and h.tipo = 'en_escena') - s.despachado_en as tiempo_respuesta,
         s.paciente_id,
         array(select t.persona_id from ambulancia.tripulacion t where t.servicio_id = s.id) as tripulacion
  from ambulancia.servicio s;
grant select on ambulancia.v_bitacora to sghu_api;
