-- Lote 5 (decisión del propietario 2026-11-19, «Sí, habilitar web»): el rol Paciente también usa la Web, además de Android e iOS.
-- Las plataformas son del rol (acceso.rol.plataformas); GET /auth/me las entrega en `platforms` y cada cliente decide si la
-- cuenta entra. Ninguna cuenta cambia: todas las cuentas con rol PAC ganan la Web a través del rol. Idempotente.
--
-- Pre-comprobación en producción (valor esperado antes: {Android,iOS}; la segunda cuenta las cuentas que ganan la Web):
--   select codigo, plataformas from acceso.rol where codigo = 'PAC';
--   select count(distinct a.usuario_id) from acceso.asignacion_rol a join acceso.usuario u on u.id = a.usuario_id
--    where a.rol_codigo = 'PAC' and u.estado = 'activo';
--
-- Reversa:
--   update acceso.rol set plataformas = array['Android', 'iOS'] where codigo = 'PAC';

update acceso.rol set plataformas = array['Android', 'iOS', 'Web']
where codigo = 'PAC' and plataformas is distinct from array['Android', 'iOS', 'Web'];
