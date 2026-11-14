-- Fase 1 · contrato de la API (auditoría 2026-11-13).
-- 1. API-09: máquina de estados de la cita en la base, como `atencion.validar_ticket` para la fila.
--    solicitada -> confirmada | rechazada | cancelada; confirmada -> atendida | cancelada | no_asistio.
--    atendida, cancelada, rechazada y no_asistio son finales.
-- 2. DAT-06: el evento delgado del broadcast lleva `seq`, igual que `GET /eventos`, para que el cliente avance su
--    cursor con los eventos en vivo (esquema `EventoDelgado` del contrato).

create function atencion.validar_cita() returns trigger language plpgsql set search_path = '' as $$
begin
  if old.estado <> new.estado and not (
       (old.estado = 'solicitada' and new.estado in ('confirmada', 'rechazada', 'cancelada'))
    or (old.estado = 'confirmada' and new.estado in ('atendida', 'cancelada', 'no_asistio'))) then
    raise exception 'transicion_invalida % -> %', old.estado, new.estado using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger cita_transicion before update of estado on atencion.cita
  for each row execute function atencion.validar_cita();

create or replace function plataforma.publicar_evento() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  canal text;
  carga jsonb := jsonb_build_object(
    'seq', new.seq::text, 'tipo', new.tipo, 'entidad', new.entidad, 'id', new.entidad_id,
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

-- Reversión (manual, en este orden):
-- drop trigger if exists cita_transicion on atencion.cita;
-- drop function if exists atencion.validar_cita();
-- create or replace function plataforma.publicar_evento() ... (la versión de 20261017000100_plataforma.sql, sin 'seq')
