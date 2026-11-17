-- Fase 2, R7 U1 (hueco A-2 de odd/tasks/fase2-recorridos-auditoria.md; decisión D-8): el paciente cancela su cita con
-- opciones rápidas, sin texto obligatorio; Recepción sigue escribiendo el motivo (10 caracteres o más).
--
-- Hasta ahora el motivo de cancelación solo quedaba en la auditoría. Dos columnas nuevas de `atencion.cita` lo guardan
-- como dato de la cita para que Recepción lo vea en la agenda:
--   * `cancelacion_codigo`: la opción rápida del paciente (`ya_no_lo_necesito`, `no_puedo_a_esa_hora`, `otro`);
--     nula cuando canceló Recepción o un cliente anterior que solo manda texto.
--   * `cancelacion_motivo`: el texto escrito (el de Recepción o el de "Otro"); nulo si el paciente eligió una opción
--     sin escribir.
--
-- Datos reales que cambia: ninguno. Son columnas nuevas, nulas y sin valor por omisión; ninguna cita existente se
-- rellena (las canceladas antes conservan su motivo solo en la auditoría, como hasta ahora). No cambia estados,
-- versiones ni horarios. Permisos: `sghu_api` ya tiene select, insert y update sobre `atencion.cita`
-- (20261017000600_atencion.sql); las columnas los heredan. No cambia RLS.
--
-- Pre-comprobación en producción (debe devolver 0 filas):
--   select column_name from information_schema.columns
--    where table_schema = 'atencion' and table_name = 'cita' and column_name in ('cancelacion_codigo', 'cancelacion_motivo');
set local lock_timeout = '5s';

alter table atencion.cita add column if not exists cancelacion_codigo text
  constraint cita_cancelacion_codigo_valido check (cancelacion_codigo in ('ya_no_lo_necesito', 'no_puedo_a_esa_hora', 'otro'));
alter table atencion.cita add column if not exists cancelacion_motivo text
  constraint cita_cancelacion_motivo_largo check (char_length(cancelacion_motivo) <= 500);

comment on column atencion.cita.cancelacion_codigo is 'Opción rápida con la que el paciente canceló (D-8); nula si canceló Recepción.';
comment on column atencion.cita.cancelacion_motivo is 'Motivo escrito de la cancelación (Recepción o la opción "Otro" del paciente).';

-- Reversión (manual):
-- alter table atencion.cita drop column if exists cancelacion_motivo;
-- alter table atencion.cita drop column if exists cancelacion_codigo;
