-- T07b (Fase 2, S10): la API registra el archivo de un adjunto de laboratorio una sola vez. ADR-0009.
--
-- laboratorio.adjunto era solo select/insert para sghu_api. Esta migración:
--   * da a sghu_api UPDATE solo sobre las columnas del archivo (ruta_almacenamiento, tipo_mime, tamano_bytes,
--     huella_sha256); el resto de la fila (orden, nombre, nota, quién y cuándo) sigue sin poder cambiar;
--   * agrega un disparador: la única actualización válida va de ruta nula a ruta guardada, con huella. Un adjunto con
--     archivo ya no cambia (nada clínico se reemplaza).
--
-- Datos que cambia: ninguno. No actualiza filas existentes; solo permisos y un disparador.
--
-- Reversa (manual):
--   drop trigger if exists adjunto_archivo_una_vez on laboratorio.adjunto;
--   drop function if exists laboratorio.adjunto_archivo_una_vez();
--   revoke update (ruta_almacenamiento, tipo_mime, tamano_bytes, huella_sha256) on laboratorio.adjunto from sghu_api;

-- El archivo se registra una sola vez: de ruta nula a ruta guardada, y con huella. Después la fila no cambia.
create or replace function laboratorio.adjunto_archivo_una_vez() returns trigger
language plpgsql as $$
begin
  if old.ruta_almacenamiento is not null then
    raise exception 'adjunto_ya_almacenado';
  end if;
  if new.ruta_almacenamiento is null or new.huella_sha256 is null then
    raise exception 'adjunto_sin_archivo';
  end if;
  return new;
end $$;

drop trigger if exists adjunto_archivo_una_vez on laboratorio.adjunto;
create trigger adjunto_archivo_una_vez before update on laboratorio.adjunto
  for each row execute function laboratorio.adjunto_archivo_una_vez();

grant update (ruta_almacenamiento, tipo_mime, tamano_bytes, huella_sha256) on laboratorio.adjunto to sghu_api;
