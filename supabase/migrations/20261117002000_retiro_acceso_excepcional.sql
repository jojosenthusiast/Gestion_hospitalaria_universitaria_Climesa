-- Observación 12 (ronda 1): se retira el módulo de acceso excepcional (spec 110: solicitar, aprobar, negar y urgencia).
-- La API deja de leer y escribir `acceso.acceso_excepcional`; las lecturas clínicas exigen la relación de atención normal.
-- Se conservan "quién vio mi expediente" (auditoria.mis_accesos), la búsqueda de auditoría (auditoria.ver) y la verificación de la cadena.
--
-- NO se elimina la tabla `acceso.acceso_excepcional` ni sus restricciones: guarda las solicitudes históricas
-- (evidencia de quién pidió y quién resolvió) y las filas de auditoría `acceso_excepcional.*` hacen referencia a ellas.
-- Sin permiso de la API nadie puede ya leerla ni escribirla; las restricciones (vigencia, autor, paciente) siguen
-- protegiendo esas filas y no estorban a nadie. Si en el futuro se decide purgarla, será una migración propia.
--
-- Esta migración:
--   1. Quita a `sghu_api` los permisos sobre la tabla.
--   2. Borra las asignaciones a roles y los dos permisos `privacidad.solicitar_acceso` y `privacidad.aprobar_acceso`.
--   3. Borra la política `privacidad.acceso_excepcional_max_horas`.
--   4. Actualiza la descripción del rol DPD (ya no aprueba accesos).
-- La semilla 20261017000210 (aplicada) no se edita: `tools/generar_docs.py` la sigue emitiendo con PERMISOS_RETIRADOS.
--
-- Pre-chequeo en producción (informativo; la migración no depende de ellos):
--   select count(*) from acceso.acceso_excepcional;                                   -- filas históricas que se conservan
--   select rol_codigo, permiso_codigo from acceso.rol_permiso where permiso_codigo in ('privacidad.solicitar_acceso','privacidad.aprobar_acceso');
--   select clave, vigencia from plataforma.politica where clave = 'privacidad.acceso_excepcional_max_horas';

revoke all on acceso.acceso_excepcional from sghu_api;

delete from acceso.rol_permiso where permiso_codigo in ('privacidad.solicitar_acceso', 'privacidad.aprobar_acceso');
delete from acceso.permiso where codigo in ('privacidad.solicitar_acceso', 'privacidad.aprobar_acceso');
delete from plataforma.politica where clave = 'privacidad.acceso_excepcional_max_horas';

update acceso.rol set descripcion = 'Revisa la auditoría y verifica su integridad.'
  where codigo = 'DPD' and descripcion = 'Aprueba accesos excepcionales a datos clínicos, revisa auditoría y verifica su integridad.';

-- Rollback (manual; restaura el catálogo y los permisos tal como los dejó la semilla):
--   grant select, insert, update on acceso.acceso_excepcional to sghu_api;
--   insert into acceso.permiso (codigo, descripcion) values
--     ('privacidad.solicitar_acceso', 'Pedir acceso excepcional a datos clínicos'),
--     ('privacidad.aprobar_acceso', 'Aprobar o negar accesos excepcionales') on conflict (codigo) do nothing;
--   insert into acceso.rol_permiso (rol_codigo, permiso_codigo, contexto) values
--     ('ADM', 'privacidad.solicitar_acceso', 'x'), ('JOP', 'privacidad.solicitar_acceso', 'x'),
--     ('MED', 'privacidad.solicitar_acceso', 'x'), ('DPD', 'privacidad.aprobar_acceso', 'x') on conflict do nothing;
--   insert into plataforma.politica (clave, valor, vigencia, fuente, aprobado_por) values
--     ('privacidad.acceso_excepcional_max_horas', '{"horas":24}', tstzrange('2026-10-01', null), 'RN-40', 'equipo SGHU');
--   update acceso.rol set descripcion = 'Aprueba accesos excepcionales a datos clínicos, revisa auditoría y verifica su integridad.' where codigo = 'DPD';
--   (el código de la API del módulo se recupera del historial de git)
