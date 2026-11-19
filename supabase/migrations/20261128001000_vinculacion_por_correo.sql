-- Observaciones del dueño 2026-11-18, lote 2: la cuenta de la app se une sola a su expediente por el correo verificado.
-- Ya no hay solicitudes con DUI y fecha de nacimiento ni bandeja de Recepción para aprobarlas.
--
-- La API guarda en `acceso.usuario.correo_verificado` el correo que Supabase Auth confirmó para la cuenta
-- (`email_confirmed_at` no nulo, leído con `auth.getUser` en cada sesión). Solo con ese correo se une la cuenta al único
-- expediente activo que lo tiene en `pacientes.paciente.correo`. La base no lee `auth.users`: el dato llega verificado
-- por Supabase Auth en la sesión de la propia cuenta.
--
-- Efecto en datos existentes: agrega una columna nula a `acceso.usuario` (ninguna fila cambia de valor; se llena la
-- próxima vez que cada cuenta abre sesión) y dos índices no únicos. No une ninguna cuenta por sí misma, no toca
-- `acceso.vinculacion_paciente` (las solicitudes antiguas quedan como historial) ni `pacientes.paciente`.
-- Los correos repetidos entre expedientes activos que ya existan no fallan aquí: la API no une ninguno de ellos y
-- Recepción ve el aviso en el expediente.
--
-- Comprobación previa (solo lectura): expedientes activos que comparten correo.
--   select lower(correo), count(*) from pacientes.paciente where correo is not null and estado in ('activo', 'provisional')
--   group by 1 having count(*) > 1;
--
-- Reversión (manual):
--   drop index if exists pacientes.paciente_correo_activo; drop index if exists acceso.usuario_correo_verificado;
--   alter table acceso.usuario drop column if exists correo_verificado;

alter table acceso.usuario add column if not exists correo_verificado text;
comment on column acceso.usuario.correo_verificado is
  'Correo que Supabase Auth confirmó para la cuenta (minúsculas), o nulo si no está confirmado. Lo escribe la API al abrir sesión; une la cuenta con el expediente que tiene ese correo.';

create index if not exists usuario_correo_verificado on acceso.usuario (lower(correo_verificado)) where correo_verificado is not null;
create index if not exists paciente_correo_activo on pacientes.paciente (lower(correo)) where correo is not null and estado in ('activo', 'provisional');
