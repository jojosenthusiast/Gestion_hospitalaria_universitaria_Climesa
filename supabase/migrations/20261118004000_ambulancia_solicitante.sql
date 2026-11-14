-- Ronda 2, ambulancia: nombre de quien llama en una solicitud telefónica (el despacho necesita saber con quién habla).
--
-- Comprobación previa en producción: ninguna (solo agrega una columna opcional; no cambia filas existentes).
--   select count(*) from ambulancia.solicitud;  -- informativo
--
-- La columna es opcional: la solicitud de la app toma el nombre del paciente; la telefónica sin expediente
-- puede traer el nombre que dio la persona. No es dato clínico y solo lo lee quien despacha.

alter table ambulancia.solicitud add column if not exists solicitante_nombre text;
alter table ambulancia.solicitud drop constraint if exists solicitud_solicitante_nombre_largo;
alter table ambulancia.solicitud add constraint solicitud_solicitante_nombre_largo
  check (solicitante_nombre is null or char_length(btrim(solicitante_nombre)) between 2 and 120);

-- Reversión (manual):
--   alter table ambulancia.solicitud drop constraint if exists solicitud_solicitante_nombre_largo;
--   alter table ambulancia.solicitud drop column if exists solicitante_nombre;
