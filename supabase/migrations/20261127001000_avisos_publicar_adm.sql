-- Generado por tools/generar_docs.py desde ADICIONES_ROL_AVISOS_ADM y permisos.csv. No editar a mano.
-- Observación 11 del propietario: Administración publica avisos generales igual que Jefatura de Operaciones.
-- Idempotente: no duplica asignaciones que ya existan.
--
-- Pre-comprobación en producción (ninguna fila debe existir todavía):
--   select rol_codigo, permiso_codigo from acceso.rol_permiso where (rol_codigo = 'ADM' and permiso_codigo = 'avisos.publicar');
--
-- Reversa:
--   delete from acceso.rol_permiso where (rol_codigo = 'ADM' and permiso_codigo = 'avisos.publicar');

insert into acceso.rol_permiso (rol_codigo, permiso_codigo, contexto) values
  ('ADM', 'avisos.publicar', 'x')
on conflict (rol_codigo, permiso_codigo) do nothing;
