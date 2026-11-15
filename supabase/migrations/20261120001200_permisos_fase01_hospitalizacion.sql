-- Generado por tools/generar_docs.py desde ADICIONES_ROL_FASE01 y permisos.csv. No editar a mano.
-- Auditoría final, D-03 (MA-HOS-04): Jefatura registra la limpieza de camas desde la Web; la verificación sigue exigiendo
-- a otra persona (camas.verificar_limpieza). Idempotente: no duplica asignaciones que ya existan.
--
-- Pre-comprobación en producción (ninguna fila debe existir todavía):
--   select rol_codigo, permiso_codigo from acceso.rol_permiso where rol_codigo = 'JOP' and permiso_codigo = 'camas.registrar_limpieza';
--
-- Reversa:
--   delete from acceso.rol_permiso where rol_codigo = 'JOP' and permiso_codigo = 'camas.registrar_limpieza';

insert into acceso.rol_permiso (rol_codigo, permiso_codigo, contexto) values
  ('JOP', 'camas.registrar_limpieza', 'x')
on conflict (rol_codigo, permiso_codigo) do nothing;
