-- Generado por tools/generar_docs.py desde PERMISOS_RONDA3, ADICIONES_ROL y permisos.csv. No editar a mano.
-- Ronda 3: permisos que exige el PDF del curso (paciente edita su contacto; médico consulta la bitácora de ambulancia).
-- Idempotente: no duplica permisos ni asignaciones que ya existan.
--
-- Pre-comprobación en producción (ninguna fila debe existir todavía):
--   select codigo from acceso.permiso where codigo = 'pacientes.editar_propios';
--   select rol_codigo, permiso_codigo from acceso.rol_permiso where rol_codigo = 'MED' and permiso_codigo = 'ambulancia.ver_bitacora';
--
-- Reversa:
--   delete from acceso.rol_permiso where permiso_codigo = 'pacientes.editar_propios' or (rol_codigo = 'MED' and permiso_codigo = 'ambulancia.ver_bitacora');
--   delete from acceso.permiso where codigo = 'pacientes.editar_propios';

insert into acceso.permiso (codigo, descripcion) values
  ('pacientes.editar_propios', 'Editar su propio teléfono correo y dirección')
on conflict (codigo) do nothing;

insert into acceso.rol_permiso (rol_codigo, permiso_codigo, contexto) values
  ('PAC', 'pacientes.editar_propios', 'propio'),
  ('MED', 'ambulancia.ver_bitacora', 'x')
on conflict (rol_codigo, permiso_codigo) do nothing;
