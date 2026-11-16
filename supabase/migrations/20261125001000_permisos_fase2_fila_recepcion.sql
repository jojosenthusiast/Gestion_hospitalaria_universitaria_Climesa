-- Generado por tools/generar_docs.py desde ADICIONES_ROL_FASE2 y permisos.csv. No editar a mano.
-- Fase 2, flujo B: Recepción llama el siguiente número desde la Web. Antes solo AST y MED (roles sin Web) tenían
-- fila.llamar y, desde FILA-01, un número en espera no se puede atender sin llamarlo: la fila no avanzaba en la Web.
-- Idempotente: no duplica asignaciones que ya existan.
--
-- Pre-comprobación en producción (ninguna fila debe existir todavía):
--   select rol_codigo, permiso_codigo from acceso.rol_permiso where (rol_codigo = 'REC' and permiso_codigo = 'fila.llamar');
--
-- Reversa:
--   delete from acceso.rol_permiso where (rol_codigo = 'REC' and permiso_codigo = 'fila.llamar');

insert into acceso.rol_permiso (rol_codigo, permiso_codigo, contexto) values
  ('REC', 'fila.llamar', 'x')
on conflict (rol_codigo, permiso_codigo) do nothing;
