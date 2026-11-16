-- Auditoría final, revisión del PR #119 (MA-AVI-02): la vista publico.v_avisos_vigentes (20261017001100) no filtra
-- `publico` ni `retirado_en`, así que expondría avisos dirigidos solo a roles y avisos retirados. Ningún código la usa
-- (la API lee publico.aviso con sus filtros; sin referencias en api, web, Android, iOS, supabase/pruebas ni tools):
-- se elimina en lugar de mantener una segunda definición de "aviso vigente".
--
-- Pre-comprobación en producción (no debe haber objetos que dependan de la vista):
--   select classid::regclass, objid from pg_depend where refobjid = 'publico.v_avisos_vigentes'::regclass and deptype = 'n';
--
-- Reversa (con los filtros actuales):
--   create view publico.v_avisos_vigentes as
--     select id, titulo, cuerpo, lower(vigencia) as desde, upper(vigencia) as hasta
--     from publico.aviso where publico and retirado_en is null and vigencia @> now();
--   grant select on publico.v_avisos_vigentes to sghu_api;

drop view if exists publico.v_avisos_vigentes;
