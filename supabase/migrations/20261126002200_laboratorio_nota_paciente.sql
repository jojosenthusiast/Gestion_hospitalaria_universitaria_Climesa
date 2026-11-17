-- R7 C1 (verificador A5): al liberar resultados, el médico puede dejar una nota para el paciente («Repetir en ayunas»,
-- «Lo vemos en la cita del lunes»). El paciente la ve junto a los resultados liberados.
--
-- Efecto en datos existentes: ninguna fila cambia. La columna nueva es opcional y queda vacía (null) en todas las órdenes
-- existentes; agregar una columna nula sin valor por defecto no reescribe la tabla.
--
-- Comprobación previa (solo lectura, informativa): la columna no existe todavía.
--   select 1 from information_schema.columns where table_schema = 'laboratorio' and table_name = 'orden' and column_name = 'nota_paciente';  -- esperado: 0 filas
--
-- Reversión (manual):
--   alter table laboratorio.orden drop constraint if exists orden_nota_paciente_largo, drop column if exists nota_paciente;
--
-- Permisos: `sghu_api` ya tiene select, insert y update sobre toda la tabla `laboratorio.orden`; no hace falta otro grant.

set lock_timeout = '5s';

alter table laboratorio.orden add column if not exists nota_paciente text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'orden_nota_paciente_largo' and conrelid = 'laboratorio.orden'::regclass) then
    alter table laboratorio.orden add constraint orden_nota_paciente_largo
      check (nota_paciente is null or length(trim(nota_paciente)) between 1 and 500) not valid;
  end if;
end $$;
