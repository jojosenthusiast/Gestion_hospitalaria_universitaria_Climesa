-- Turnos: el estado sigue al reloj y la entrada se confirma sola (ASIS-01, FR-103-13).
--
-- La API pasa cada minuto (y antes de leer o escribir turnos) los turnos publicados a `en_curso` al empezar y a
-- `completado` al terminar, y guarda `presente_desde = lower(periodo)` en el mismo cambio, auditado con el actor SISTEMA.
-- Ya nadie marca la entrada a mano (se quitó `POST /turnos/{id}/entrada`); JOP solo marca la ausencia (tipo y motivo),
-- corrige la hora real de entrada o deshace una ausencia. Nunca toca borradores, cancelados ni ausentes.
--
-- 1. Índice parcial para ese barrido: solo los turnos que el reloj todavía puede cambiar.
-- 2. `alerta_sin_confirmar_en` queda sin uso (no hay turnos "sin confirmar"); la columna se conserva por historial.
--
-- No cambia filas. Comprobación previa en producción (informativa: cuántos turnos cambiará el primer barrido):
--   select estado, count(*) from personal.turno
--    where (estado = 'publicado' and lower(periodo) <= now()) or (estado = 'en_curso' and upper(periodo) <= now())
--    group by estado;

create index if not exists turno_por_avanzar on personal.turno (lower(periodo), upper(periodo))
  where estado in ('publicado', 'en_curso');

comment on column personal.turno.presente_desde is
  'Entrada: la hora de inicio, confirmada sola por el reloj al empezar el turno, o la hora real que corrigió JOP. Null en ausencias y antes del inicio.';
comment on column personal.turno.alerta_sin_confirmar_en is
  'Sin uso desde 20261122001000: la entrada se confirma sola y ya no hay turnos sin confirmar. Se conserva por historial.';

-- Reversión (manual): drop index personal.turno_por_avanzar; comment on column personal.turno.presente_desde is null;
-- comment on column personal.turno.alerta_sin_confirmar_en is null.
