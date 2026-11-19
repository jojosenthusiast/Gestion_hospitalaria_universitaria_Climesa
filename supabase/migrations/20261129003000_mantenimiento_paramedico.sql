-- Lote 5 S8 (observación del propietario en la app del paramédico: «en este tampoco se puede poner en mantenimiento la
-- ambulancia, cosa que no tiene sentido»): el Paramédico pone y quita mantenimiento, igual que Jefatura de Operaciones.
-- Las reglas siguen: solo sin servicio activo, con motivo, y salir exige paramédico y motorista con turno en curso (RN-30).
-- El cierre administrativo de un servicio (POST /ambulancia/servicios/{id}/cerrar) sigue siendo solo de Jefatura: la API
-- exige además `ambulancia.despachar`, que el paramédico no tiene.
-- Idempotente: no duplica asignaciones que ya existan.
--
-- Pre-comprobación en producción (la primera no debe devolver filas; la segunda cuenta las cuentas PAR activas que ganan el permiso):
--   select rol_codigo, permiso_codigo from acceso.rol_permiso where rol_codigo = 'PAR' and permiso_codigo = 'ambulancia.mantenimiento';
--   select count(distinct a.usuario_id) from acceso.asignacion_rol a join acceso.usuario u on u.id = a.usuario_id
--    where a.rol_codigo = 'PAR' and u.estado = 'activo';
--
-- Reversa:
--   delete from acceso.rol_permiso where rol_codigo = 'PAR' and permiso_codigo = 'ambulancia.mantenimiento';

insert into acceso.rol_permiso (rol_codigo, permiso_codigo, contexto) values
  ('PAR', 'ambulancia.mantenimiento', 'x')
on conflict (rol_codigo, permiso_codigo) do nothing;
