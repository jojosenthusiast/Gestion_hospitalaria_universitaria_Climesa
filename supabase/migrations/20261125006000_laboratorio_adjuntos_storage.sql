-- T07b (Fase 2, S10; decisión del dueño L13): bucket PRIVADO de Supabase Storage para la foto o el PDF del resultado
-- externo de laboratorio (`laboratorio.adjunto.ruta_almacenamiento`). ADR-0009.
--
-- Qué hace:
--   * Crea el bucket `laboratorio-adjuntos` con public=false, límite de 10 MiB y solo PDF, JPEG, PNG, HEIC y WEBP.
--   * NO crea políticas sobre storage.objects: anon y authenticated no pueden listar, leer ni escribir en él. Solo la API,
--     con la clave de servidor (SUPABASE_SECRET_KEY o SUPABASE_SERVICE_ROLE_KEY), sube archivos y firma enlaces de
--     descarga de 5 minutos, después de revisar el alcance y auditar.
--   * Si ya existe un bucket con ese id y es público, la migración falla en vez de seguir: nunca se acepta un bucket
--     clínico público.
--   * El permiso de sghu_api para registrar la ruta va aparte, en 20261125006100_laboratorio_adjunto_archivo.sql.
--
-- Datos que cambia: ninguno de negocio. En Supabase inserta UNA fila en storage.buckets (si no existe). No toca
-- laboratorio.adjunto ni ninguna otra tabla: los adjuntos ya cargados siguen con ruta_almacenamiento nula (solo la
-- referencia) hasta que alguien del personal suba su archivo.
--
-- Entornos sin el esquema `storage` (PostgreSQL de pruebas y PGlite, que solo simulan auth y realtime): no hace nada.
-- La sentencia vive en un bloque plpgsql que se planifica solo si storage.buckets existe.
--
-- Comprobación:
--   select id, public, file_size_limit, allowed_mime_types from storage.buckets where id = 'laboratorio-adjuntos';
--   select policyname from pg_policies where schemaname = 'storage' and tablename = 'objects'
--     and (qual like '%laboratorio-adjuntos%' or with_check like '%laboratorio-adjuntos%');   -- debe estar vacío
--
-- Reversa (manual; solo si el bucket está vacío):
--   delete from storage.buckets where id = 'laboratorio-adjuntos';

do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'Sin esquema storage: el bucket laboratorio-adjuntos se crea solo en Supabase.';
    return;
  end if;
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('laboratorio-adjuntos', 'laboratorio-adjuntos', false, 10485760,
          array['application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'image/webp'])
  on conflict (id) do nothing;
  if exists (select 1 from storage.buckets where id = 'laboratorio-adjuntos' and public) then
    raise exception 'El bucket laboratorio-adjuntos existe y es público; un bucket clínico debe ser privado.';
  end if;
end $$;
