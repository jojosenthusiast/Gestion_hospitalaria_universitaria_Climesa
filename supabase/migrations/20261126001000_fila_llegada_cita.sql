-- Fase 2, R7 U1 (mostrador, hueco B-1 de odd/tasks/fase2-recorridos-auditoria.md; decisión D-1): Recepción registra la
-- llegada de un paciente con cita desde la cita, y eso liga la cita con su número de fila.
--
-- `atencion.ticket_fila.cita_id` guarda la cita cuya llegada se registró con ese número. Con el enlace:
--   * la fila muestra la hora y el médico de esa cita aunque la cita cambie de estado (antes se deducía con un JOIN por
--     paciente y día, solo en consulta general);
--   * iniciar la consulta desde la agenda pasa el número a "en atención", e iniciarla desde la fila marca la cita;
--   * firmar la consulta cierra la cita y el número en la misma transacción.
-- Una cita tiene a lo sumo un número vigente ligado (índice parcial `ticket_fila_cita_unica`); un número anulado o
-- cerrado sin atender deja registrar la llegada otra vez.
--
-- Datos reales que cambia: ninguno. Es una columna nueva, nula y sin valor por omisión; ninguna fila existente se
-- rellena, así que los números de hoy y de días pasados siguen sin cita ligada y la fila sigue deduciendo su cita por
-- paciente y día como hasta ahora. El índice parcial solo cubre filas con `cita_id` no nulo: hoy no hay ninguna.
-- Permisos: `sghu_api` ya tiene select, insert y update sobre `atencion.ticket_fila` (20261017000600_atencion.sql); la
-- columna nueva los hereda. No cambia RLS.
--
-- Pre-comprobación en producción (debe devolver 0 filas: la columna todavía no existe):
--   select column_name from information_schema.columns
--    where table_schema = 'atencion' and table_name = 'ticket_fila' and column_name = 'cita_id';
--
-- Agregar una columna nula no reescribe la tabla. Si no obtiene el candado en 5 s, falla en lugar de detener la
-- recepción; vuelve a aplicarla.
set local lock_timeout = '5s';

alter table atencion.ticket_fila add column if not exists cita_id uuid references atencion.cita(id);

comment on column atencion.ticket_fila.cita_id is
  'Cita cuya llegada registró Recepción con este número (D-1). Nula para quien llega sin cita y para los números anteriores.';

create unique index if not exists ticket_fila_cita_unica on atencion.ticket_fila (cita_id)
  where cita_id is not null and estado in ('en_espera', 'llamado', 'en_atencion', 'atendido');

-- Reversión (manual):
-- drop index if exists atencion.ticket_fila_cita_unica;
-- alter table atencion.ticket_fila drop column if exists cita_id;
