# ADR-0009. Almacenamiento clínico privado de archivos

**Estado:** Aceptada (16-nov-2026). Origen: Fase 2, S10 (flujo C de laboratorio), decisión del dueño L13. Tarea T07b.

## Contexto
El resultado de un examen hecho en otro sitio entra "adjuntando foto/PDF" y "queda en el expediente". Hasta T07b solo se guardaba la referencia del archivo (`laboratorio.adjunto`: nombre, tipo, tamaño, huella) y el archivo quedaba con quien lo cargó.

## Decisión
1. **Bucket privado.** Los archivos van al bucket `laboratorio-adjuntos` de Supabase Storage con `public = false`, límite de 10 MiB y solo PDF, JPEG, PNG, HEIC y WEBP (migración `20261125006000`). No hay políticas sobre `storage.objects` para `anon` ni `authenticated`: ningún cliente lee, lista ni escribe el bucket. Si el bucket ya existiera como público, la migración falla.
2. **Solo la API.** Subir y descargar pasa por la API, que usa la clave de servidor (`SUPABASE_SECRET_KEY` o `SUPABASE_SERVICE_ROLE_KEY`). Los clientes siguen sin hablar con Supabase salvo para sesión y Realtime (ADR-0004).
3. **Subida** (`POST /api/v1/laboratorio/adjuntos/{id}/archivo`, multipart, campo `archivo`): la pueden hacer el laboratorio o un médico que puede revisar la orden. La API lee el tipo de los primeros bytes (no del nombre ni del `Content-Type`), rechaza más de 10 MiB, calcula la huella SHA-256 y guarda el objeto en `<orden_id>/<uuid aleatorio>`: la ruta no lleva nombre del paciente ni se puede adivinar. Un archivo guardado no se reemplaza (disparador `adjunto_archivo_una_vez`; `sghu_api` solo puede actualizar las columnas del archivo, migración `20261125006100`). Si la transacción falla después de subir, la API retira el objeto.
4. **Descarga** (`GET /api/v1/laboratorio/adjuntos/{id}/enlace`): mismo alcance que ver los valores de la orden (laboratorio, médico que la pidió o que puede revisarla). La API escribe primero una fila de auditoría (`laboratorio.adjunto_descargado`) y devuelve un enlace firmado que vence a los **5 minutos**. El paciente nunca lo obtiene: para él el adjunto no existe (404). Un adjunto que solo tiene la referencia responde `409 adjunto_sin_archivo`.
5. **Puerto y adaptador.** La API usa el puerto `ClinicalFileStorage` (`api/src/platform/clinical-storage.ts`); el adaptador de Supabase vive en `supabase-clinical-storage.ts`. Las pruebas usan un doble en memoria: ninguna prueba llama a la red.
6. **Nada sensible en registros.** Ni el contenido del archivo, ni la ruta del objeto, ni el enlace firmado, ni la clave aparecen en registros, respuestas al paciente ni detalles de auditoría.

## Consecuencias
- La web sube el archivo justo después de guardar los valores y permite subirlo después a los adjuntos que solo tienen referencia. Android e iOS siguen guardando solo la referencia y no descargan todavía (pendiente).
- El borrado de la demo (`tools/demo/limpiar-demo.sql`) no puede borrar objetos de Storage; la semilla demo no crea adjuntos.
- El bucket se crea al aplicar las migraciones en Supabase; en PostgreSQL de pruebas y PGlite (sin esquema `storage`) la migración no hace nada.
