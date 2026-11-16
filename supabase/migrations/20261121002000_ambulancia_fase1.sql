-- Fase 1, ambulancia (auditoría final MA-AMB-02 a MA-AMB-05).
--
-- MA-AMB-02 (sin cambio de esquema): el despachador elige la tripulación entre el personal de turno; la API solo
-- inserta en `ambulancia.tripulacion` a quien se eligió y la relación de atención sigue saliendo de esa tabla. Los
-- disparadores de 20261119002000 (tripulación completa) y de 20261120003000 (tripulante ausente) siguen igual.
--
-- 1. MA-AMB-03: estados finales `fallecido` (el paciente falleció antes de llegar al hospital) y `desviado` (el
--    traslado terminó en otro centro). Desde `trasladando` se puede finalizar sin registrar una llegada falsa.
--    Cuando la tripulación finaliza (hito `finalizado`), la base valida el estado final contra los hitos registrados
--    (`estado_final_invalido`): `completado` solo con llegada al hospital; con llegada solo `completado`; `desviado`
--    solo durante el traslado; `sin_traslado` y `rechaza_traslado` solo antes de salir con el paciente. El cierre
--    administrativo de Jefatura (BL-05, `cerrado_por`) no cambia.
-- 2. MA-AMB-04: entrega al hospital. `servicio.recibido_por` y `recibido_en` registran quién recibió al paciente
--    (personal clínico con `ambulancia.recibir_prehospital`); solo después del hito `en_hospital` y una sola vez
--    (`entrega_registrada`). Los reportes prehospital del servicio quedan con el mismo `recibido_por`.
-- 3. MA-AMB-05: el paciente cancela su solicitud por confirmar; `motivo_cancelacion` guarda su motivo opcional.
--
-- Comprobación previa en producción (solo lectura, informativa; la migración no cambia filas y las reglas actúan en la
-- próxima escritura): servicios abiertos que finalizarán con las reglas nuevas.
--   select id, estado_final from ambulancia.servicio where finalizado_en is null;
--
-- Reversión (manual, en este orden):
--   drop trigger if exists servicio_cierre on ambulancia.servicio; drop function if exists ambulancia.validar_cierre_servicio();
--   alter table ambulancia.servicio drop constraint if exists servicio_recepcion_completa;
--   alter table ambulancia.servicio drop column if exists recibido_por, drop column if exists recibido_en;
--   alter table ambulancia.solicitud drop column if exists motivo_cancelacion;
--   (estado final: pasar `fallecido` y `desviado` a `cancelado` y volver al check original de 20261017000900_ambulancia.sql.)

-- MA-AMB-03: estados finales sin llegada falsa.
alter table ambulancia.servicio drop constraint if exists servicio_estado_final_check;
alter table ambulancia.servicio add constraint servicio_estado_final_check
  check (estado_final in ('completado', 'cancelado', 'sin_traslado', 'rechaza_traslado', 'fallecido', 'desviado'));

-- MA-AMB-04: entrega al hospital.
alter table ambulancia.servicio add column if not exists recibido_por uuid;
alter table ambulancia.servicio add column if not exists recibido_en timestamptz;
alter table ambulancia.servicio drop constraint if exists servicio_recepcion_completa;
alter table ambulancia.servicio add constraint servicio_recepcion_completa check ((recibido_por is null) = (recibido_en is null));

create or replace function ambulancia.validar_cierre_servicio() returns trigger language plpgsql set search_path = '' as $$
declare
  llego boolean := exists (select 1 from ambulancia.hito where servicio_id = new.id and tipo = 'en_hospital');
  traslada boolean := exists (select 1 from ambulancia.hito where servicio_id = new.id and tipo = 'trasladando');
begin
  if new.estado_final is not null and old.estado_final is null and new.cerrado_por is null
     and exists (select 1 from ambulancia.hito where servicio_id = new.id and tipo = 'finalizado') then
    if (llego and new.estado_final <> 'completado')
       or (not llego and new.estado_final = 'completado')
       or (new.estado_final = 'desviado' and not traslada)
       or (new.estado_final in ('sin_traslado', 'rechaza_traslado') and traslada) then
      raise exception 'estado_final_invalido' using errcode = 'P0001',
        detail = 'MA-AMB-03: el estado final no corresponde a los hitos registrados del servicio.';
    end if;
  end if;
  if old.recibido_por is not null and new.recibido_por is distinct from old.recibido_por then
    raise exception 'entrega_registrada' using errcode = 'P0001', detail = 'MA-AMB-04: la entrega al hospital ya fue registrada.';
  end if;
  if new.recibido_por is not null and old.recibido_por is null and not llego then
    raise exception 'sin_llegada_hospital' using errcode = 'P0001', detail = 'MA-AMB-04: la entrega se registra después del hito en_hospital.';
  end if;
  return new;
end $$;
drop trigger if exists servicio_cierre on ambulancia.servicio;
create trigger servicio_cierre before update of estado_final, recibido_por on ambulancia.servicio
  for each row execute function ambulancia.validar_cierre_servicio();

-- MA-AMB-05: cancelación por quien pidió.
alter table ambulancia.solicitud add column if not exists motivo_cancelacion text;
