-- Turnos: el estado sigue al reloj y la entrada se confirma sola (ASIS-01, FR-103-13).
--
-- La API pasa cada minuto (y antes de leer o escribir turnos) los turnos publicados a `en_curso` al empezar y a
-- `completado` al terminar, auditado con el actor SISTEMA. En ese mismo cambio guarda `presente_desde = lower(periodo)`,
-- pero solo en turnos que empiezan desde la entrada automática (política `turnos.entrada_automatica`, fijada a la hora
-- en que se aplica esta migración): nada se confirma hacia atrás. Un turno anterior sin entrada se sigue leyendo
-- "sin registro de entrada" y nunca se rellena. JOP solo marca la ausencia (tipo y motivo), corrige la hora real de
-- entrada o deshace una ausencia. El barrido nunca toca borradores, cancelados ni ausentes.
--
-- 1. Política `turnos.entrada_automatica` con `desde` = la hora de aplicación (now()).
-- 2. `version_previa_reloj`: la versión que el turno tenía antes de los cambios del barrido. Así una marca de JOP cargada
--    antes del inicio (por ejemplo a las 06:55) sigue valiendo a las 07:05 aunque el barrido haya subido la versión.
--    La fija un trigger: el barrido declara `sghu.barrido_turnos = on` en su transacción; cualquier otra escritura la borra.
-- 3. Índice parcial para el barrido: solo los turnos que el reloj todavía puede cambiar.
-- 4. `alerta_sin_confirmar_en` queda sin uso (no hay turnos "sin confirmar"); la columna se conserva por historial.
--
-- No cambia filas de turnos (la columna nueva nace nula). Comprobación previa en producción (informativa: cuántos turnos
-- cambiará de estado el primer barrido; ninguno recibe entrada, porque todos empezaron antes de la política):
--   select estado, count(*) from personal.turno
--    where (estado = 'publicado' and lower(periodo) <= now()) or (estado = 'en_curso' and upper(periodo) <= now())
--    group by estado;

insert into plataforma.politica (clave, valor, vigencia, fuente, aprobado_por) values
 ('turnos.entrada_automatica', jsonb_build_object('desde', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')),
  tstzrange('2026-10-01', null), 'ASIS-01: entrada automática al inicio, sin confirmación retroactiva', 'equipo SGHU')
on conflict do nothing;

alter table personal.turno add column version_previa_reloj integer;
comment on column personal.turno.version_previa_reloj is
  'Versión del turno antes de los cambios del barrido del reloj; una escritura de persona la borra. Permite marcar la asistencia con la versión cargada antes del inicio.';

create function personal.version_previa_reloj() returns trigger language plpgsql set search_path = '' as $$
begin
  if coalesce(current_setting('sghu.barrido_turnos', true), '') = 'on' then
    new.version_previa_reloj := coalesce(old.version_previa_reloj, old.version);
  else
    new.version_previa_reloj := null;
  end if;
  return new;
end $$;
create trigger turno_version_previa_reloj before update on personal.turno
  for each row execute function personal.version_previa_reloj();

create index if not exists turno_por_avanzar on personal.turno (lower(periodo), upper(periodo))
  where estado in ('publicado', 'en_curso');

comment on column personal.turno.presente_desde is
  'Entrada: la hora de inicio, confirmada sola por el reloj (turnos desde turnos.entrada_automatica), o la hora real que registró JOP. Null en ausencias, antes del inicio y en turnos anteriores sin registro.';
comment on column personal.turno.alerta_sin_confirmar_en is
  'Sin uso desde 20261122001000: la entrada se confirma sola y ya no hay turnos sin confirmar. Se conserva por historial.';

-- Reversión (manual): drop trigger turno_version_previa_reloj on personal.turno; drop function
-- personal.version_previa_reloj(); alter table personal.turno drop column version_previa_reloj; drop index
-- personal.turno_por_avanzar; delete from plataforma.politica where clave = 'turnos.entrada_automatica'.
