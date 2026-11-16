-- Fase 2, flujo B (S9): prioridad del número de fila (emergencia, urgente, rutina) para la regla de "quién pasa
-- después" (docs/arquitectura/reglas-negocio.md, RN-FILA-SIGUIENTE).
--
-- La numeración por área ya existe y no cambia: `atencion.emitir_numero(servicio, fecha)` cuenta por servicio y día
-- desde 1 (el servicio es el área: consulta_general = CON, emergencia = EMG, laboratorio = LAB, admisiones = REC).
--
-- Datos reales que cambia: agrega la columna `prioridad` a `atencion.ticket_fila`; todos los números existentes
-- (de hoy y de días pasados) quedan con 'rutina', que es como se atendían hasta ahora (orden de llegada). No cambia
-- estados, números, llamados ni versiones.
--
-- Pre-comprobación en producción (debe devolver 0 filas: la columna todavía no existe):
--   select column_name from information_schema.columns where table_schema = 'atencion' and table_name = 'ticket_fila' and column_name = 'prioridad';
--
-- Agregar una columna con valor por omisión constante no reescribe la tabla (PostgreSQL 11+). Si no obtiene el
-- candado en 5 s, falla en lugar de detener la recepción; vuelve a aplicarla.
set local lock_timeout = '5s';

alter table atencion.ticket_fila
  add column if not exists prioridad text not null default 'rutina'
  constraint ticket_fila_prioridad_valida check (prioridad in ('emergencia', 'urgente', 'rutina'));

comment on column atencion.ticket_fila.prioridad is
  'Prioridad clínica del número: emergencia, urgente o rutina. Ordena la propuesta de quién pasa después (RN-FILA-SIGUIENTE).';

-- Reversión (manual):
-- alter table atencion.ticket_fila drop column if exists prioridad;
