-- Supabase Security Advisor, «function_search_path_mutable»: `laboratorio.adjunto_archivo_una_vez()`
-- (20261125006100) se creó sin `search_path` fijo. Todas las demás funciones del esquema ya lo fijan.
--
-- El cuerpo no lee tablas ni llama funciones (solo compara `old`/`new` y lanza excepciones), así que fijarlo vacío no
-- cambia su comportamiento.
--
-- Efecto en datos existentes: ninguno. Solo cambia una opción de la función; no se lee ni se reescribe ninguna fila.
--
-- Comprobación previa (solo lectura): la función existe y todavía no fija `search_path`.
--   select proconfig from pg_proc where oid = 'laboratorio.adjunto_archivo_una_vez'::regproc;  -- esperado: null
--
-- Reversión (manual):
--   alter function laboratorio.adjunto_archivo_una_vez() reset search_path;

alter function laboratorio.adjunto_archivo_una_vez() set search_path = '';
