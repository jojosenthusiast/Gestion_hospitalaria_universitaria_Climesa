-- Generado por tools/generar_docs.py desde ADICIONES_ROL_RECURSOS, PERMISOS_RETIRADOS y permisos.csv. No editar a mano.
-- Auditoría final, D-05 y D-091 (MA-REQ-01, MA-REQ-02): el "control de recursos" del Administrador es inventario + edificio.
-- El Administrador ve el inventario que ya configura; se retiran los permisos del módulo de equipo médico, que nunca tuvo
-- endpoint ni pantalla. Las tablas infra.equipo e infra.tipo_equipo se conservan sin uso (no se borra estructura en la entrega).
-- Idempotente: no duplica asignaciones y borrar lo que ya no existe no falla.
--
-- Pre-comprobación en producción (la primera no debe devolver filas; la segunda lista lo que se borra):
--   select rol_codigo, permiso_codigo from acceso.rol_permiso where (rol_codigo = 'ADM' and permiso_codigo = 'inventario.ver');
--   select rol_codigo, permiso_codigo from acceso.rol_permiso where permiso_codigo in ('recursos.gestionar', 'recursos.configurar');
--
-- Reversa:
--   delete from acceso.rol_permiso where (rol_codigo = 'ADM' and permiso_codigo = 'inventario.ver');
--   insert into acceso.permiso (codigo, descripcion) values ('recursos.gestionar', 'Equipo médico por espacio y su estado') on conflict do nothing;
--   insert into acceso.rol_permiso (rol_codigo, permiso_codigo, contexto) values ('JOP', 'recursos.gestionar', 'x') on conflict do nothing;
--   insert into acceso.permiso (codigo, descripcion) values ('recursos.configurar', 'Tipos de equipo y catálogos de recursos') on conflict do nothing;
--   insert into acceso.rol_permiso (rol_codigo, permiso_codigo, contexto) values ('ADM', 'recursos.configurar', 'x') on conflict do nothing;

insert into acceso.rol_permiso (rol_codigo, permiso_codigo, contexto) values
  ('ADM', 'inventario.ver', 'x')
on conflict (rol_codigo, permiso_codigo) do nothing;

delete from acceso.rol_permiso where permiso_codigo in ('recursos.gestionar', 'recursos.configurar');
delete from acceso.permiso where codigo in ('recursos.gestionar', 'recursos.configurar');
