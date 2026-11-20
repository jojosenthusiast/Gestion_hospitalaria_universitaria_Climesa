-- Auditoría de flujos 2026-11-20, D48: hora del primer llamado de cada número de la fila.
--
-- La web medía la espera de un número llamado o en atención hasta "ahora", porque la tabla no guardaba cuándo se llamó.
-- `atencion.ticket_fila.primer_llamado_en` guarda el instante del primer llamado. La API lo escribe en el primer llamado
-- (los siguientes no lo cambian) y lo limpia cuando deshacer el llamado devuelve el número a la espera. `GET /fila` lo
-- expone como `calledAt`, para medir la espera desde la emisión hasta el llamado.
--
-- Datos reales que cambia: ninguno. Es una columna nueva, nula y sin valor por defecto; no se rellena ninguna fila
-- existente. Los números ya llamados quedan con primer_llamado_en nulo (el cliente sigue midiendo como antes).
-- No cambia RLS: la tabla ya tiene su política para sghu_api y la columna la hereda.
-- Pre-comprobación en producción:
--   select count(*) from information_schema.columns
--    where table_schema = 'atencion' and table_name = 'ticket_fila' and column_name = 'primer_llamado_en';  -- debe ser 0
--
-- Reversa:
--   alter table atencion.ticket_fila drop column if exists primer_llamado_en;

alter table atencion.ticket_fila add column if not exists primer_llamado_en timestamptz;

comment on column atencion.ticket_fila.primer_llamado_en is 'Instante del primer llamado del número (auditoría D48); null si nadie lo ha llamado o se deshizo el llamado.';
