-- Fase 2, auditoría T15: un aviso editado (texto nuevo o nivel más alto) vuelve a pedir "Enterado".
--
-- `publico.aviso_enterado` exige `enterado_en` o `recordar_en`, y sghu_api no podía borrar filas, así que la API dejaba
-- `recordar_en` = hora de la edición para quitar el acuse. Las tres aplicaciones muestran "Te lo recordamos …" cuando hay
-- `recordarEn` sin `enteradoEn`, y aparecía un recordatorio que nadie pidió. Con DELETE la API borra el acuse de ese
-- aviso y la persona lo ve como nuevo, sin recordatorio.
--
-- Datos reales que cambia: ninguno. Solo concede DELETE a sghu_api sobre esta tabla; la política api_sghu ya es
-- `for all`. anon y authenticated siguen sin acceso.
-- Pre-comprobación en producción:
--   select has_table_privilege('sghu_api', 'publico.aviso_enterado', 'DELETE');  -- debe ser false
--
-- Reversa:
--   revoke delete on publico.aviso_enterado from sghu_api;

grant delete on publico.aviso_enterado to sghu_api;
