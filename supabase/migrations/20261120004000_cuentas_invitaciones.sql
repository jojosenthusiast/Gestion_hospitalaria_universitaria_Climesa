-- Fase 0/1, cuentas (MA-CTA-01 y MA-CTA-02).
-- 1. Qué roles se pueden invitar sale del catálogo, no de un código de rol en la API (regla 8 de AGENTS.md).
--    El paciente crea su propia cuenta en la app móvil (BL-06, D-04); nunca llega por invitación.
alter table acceso.rol add column if not exists invitable boolean not null default true;
update acceso.rol set invitable = false where codigo = 'PAC';
comment on column acceso.rol.invitable is
  'El administrador puede invitar cuentas con este rol. Falso para PAC: el paciente se registra en la app Android o iOS.';

-- 2. Una invitación se puede cancelar; aceptada_en guarda cuándo la persona entró por primera vez.
alter table acceso.invitacion drop constraint if exists invitacion_estado_check;
alter table acceso.invitacion add constraint invitacion_estado_check
  check (estado in ('enviada', 'aceptada', 'rechazada', 'expirada', 'cancelada'));
alter table acceso.invitacion add column if not exists aceptada_en timestamptz;
alter table acceso.invitacion add column if not exists reenviada_en timestamptz;

-- 3. Comentario corregido del alta automática: el proveedor de invitaciones de Supabase no marca
--    raw_app_meta_data.invitado, así que la cuenta invitada también nace con PAC; la API lo retira en la
--    misma transacción de la invitación y deja solo los roles de personal elegidos.
comment on function acceso.alta_usuario() is
  'Alta en acceso.usuario al crearse una cuenta de Supabase Auth. Asigna PAC salvo que raw_app_meta_data.invitado sea true. '
  'Las invitaciones de personal llegan sin esa marca: POST /usuarios/invitaciones reemplaza PAC por los roles invitados.';
