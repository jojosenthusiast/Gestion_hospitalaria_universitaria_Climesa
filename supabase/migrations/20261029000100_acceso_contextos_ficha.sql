-- Generado por tools/generar_docs.py desde AJUSTES_CONTEXTO y permisos.csv. No editar a mano.
-- Contextos de rol_permiso que cambiaron después de la semilla de acceso (regla 10: no se edita la semilla).
-- Idempotente: solo actualiza filas que aún tienen el contexto anterior. acceso.rol_permiso.contexto no tiene check.

update acceso.rol_permiso set contexto = 'area' where rol_codigo = 'AST' and permiso_codigo = 'pacientes.ver_ficha' and contexto = 'x';
update acceso.rol_permiso set contexto = 'area' where rol_codigo = 'ENF' and permiso_codigo = 'pacientes.ver_ficha' and contexto = 'x';
update acceso.rol_permiso set contexto = 'orden' where rol_codigo = 'LAB' and permiso_codigo = 'pacientes.ver_ficha' and contexto = 'x';
