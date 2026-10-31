-- Generado por tools/generar_docs.py desde PERMISOS_POSTERIORES y permisos.csv. No editar a mano.
-- Permisos de atributo: reemplazan decisiones por código de rol en la API (regla 8 de AGENTS.md). Conservan el comportamiento vigente.
-- Idempotente: no duplica permisos ni asignaciones que ya existan.

insert into acceso.permiso (codigo, descripcion) values
  ('pacientes.ver_nacimiento', 'Ver la fecha de nacimiento exacta (rango de edad si el contexto es rango)'),
  ('pacientes.ver_contacto', 'Ver DUI teléfono correo y dirección del paciente'),
  ('personal.ver_datos_personales', 'Ver DUI y teléfono del personal'),
  ('turnos.ver_borradores', 'Ver turnos en borrador antes de publicarlos')
on conflict (codigo) do nothing;

insert into acceso.rol_permiso (rol_codigo, permiso_codigo, contexto) values
  ('REC', 'pacientes.ver_nacimiento', 'x'),
  ('AST', 'pacientes.ver_nacimiento', 'x'),
  ('ENF', 'pacientes.ver_nacimiento', 'x'),
  ('MED', 'pacientes.ver_nacimiento', 'x'),
  ('LAB', 'pacientes.ver_nacimiento', 'rango'),
  ('PAR', 'pacientes.ver_nacimiento', 'x'),
  ('PAC', 'pacientes.ver_nacimiento', 'propio'),
  ('REC', 'pacientes.ver_contacto', 'x'),
  ('MED', 'pacientes.ver_contacto', 'x'),
  ('PAC', 'pacientes.ver_contacto', 'propio'),
  ('ADM', 'personal.ver_datos_personales', 'x'),
  ('ADM', 'turnos.ver_borradores', 'x'),
  ('JOP', 'turnos.ver_borradores', 'x')
on conflict (rol_codigo, permiso_codigo) do nothing;
