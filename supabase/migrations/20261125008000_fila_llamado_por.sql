-- Fase 2, flujo G (T10f, S13): quién llamó cada número de la fila.
--
-- `GET /fila` lista los números llamados de todos los consultorios y la tabla no guardaba quién los llamó, así que la
-- web ofrecía "Iniciar consulta" en números que llamó un colega. `atencion.ticket_fila.llamado_por` guarda la persona de
-- personal (`personal.persona`, igual que `atencion.consulta.medico_id`) que hizo el último llamado. La API lo escribe en
-- cada llamado y lo limpia cuando deshacer el llamado devuelve el número a la espera. La API solo expone si quien lee
-- es quien llamó (`calledByMe`); nunca el id del colega.
--
-- Datos reales que cambia: ninguno. Es una columna nueva, nula y sin valor por defecto; no se rellena ninguna fila
-- existente. Los números ya llamados quedan con llamado_por nulo (ningún médico los ve como propios hasta un nuevo
-- llamado). No cambia RLS: la tabla ya tiene su política para sghu_api y la columna la hereda.
-- Pre-comprobación en producción:
--   select count(*) from information_schema.columns
--    where table_schema = 'atencion' and table_name = 'ticket_fila' and column_name = 'llamado_por';  -- debe ser 0
--
-- Reversa:
--   alter table atencion.ticket_fila drop column if exists llamado_por;

alter table atencion.ticket_fila add column if not exists llamado_por uuid;  -- personal.persona

comment on column atencion.ticket_fila.llamado_por is 'Persona de personal que hizo el último llamado del número (T10f); null si nadie lo ha llamado o se deshizo el llamado.';
