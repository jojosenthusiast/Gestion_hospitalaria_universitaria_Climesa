-- Turnos: asistencia real (ASIS-01 a ASIS-03), carga y descansos (CARGA-01, CARGA-05) y estados (MA-TUR-01 a MA-TUR-05).
--
-- 1. Nuevo estado `ausente` en `personal.turno`. Todas las reglas que hoy dicen "de turno" usan
--    `estado in ('publicado', 'en_curso')` (agenda de citas, fila, médicos de turno, contexto de área, RN-30 y la regla
--    del motorista en la API, métricas): un turno ausente deja de contar en todas sin cambiar esas consultas.
--    La entrada (`presente_desde`) la marca la persona o JOP; la ausencia la marca JOP con tipo (justificada o
--    injustificada) y motivo. `alerta_sin_confirmar_en` registra cuándo se avisó a JOP de un turno sin entrada.
-- 2. Transiciones de estado válidas en la base (`transicion_invalida`): nadie vuelve a `borrador` un turno en curso
--    (MA-TUR-02) ni cancela uno iniciado o completado, y un turno iniciado ya no cambia de persona, área, horario ni
--    tipo (`turno_iniciado`, MA-TUR-03).
-- 3. Descanso mínimo entre cualquier par de turnos (`descanso_insuficiente`, RN-13: 8 h; 12 h después de 24 h) y
--    tope de horas en cualquier ventana de 7 días (`carga_semanal_excedida`, política nueva `turnos.carga`). El tope
--    solo se salta con una excepción de emergencia escrita (`excepcion_carga`, 10 caracteres o más) que queda en
--    el turno y en la auditoría. Con el descanso mínimo nadie encadena más de 24 h seguidas (nunca 72 h).
-- 4. Un médico no se queda con citas vivas fuera de turno al cancelar o mover el turno (`turno_con_citas`, MA-TUR-05);
--    no se dan citas en el horario de un médico ausente (`medico_ausente`); una persona ausente no entra en una
--    tripulación (`tripulante_ausente`) y no se marca ausente a quien va en un servicio activo (`tripulante_en_servicio`).
-- 5. Políticas `turnos.carga` y `turnos.asistencia` (versionadas, el ADM las cambia sin tocar código).
--
-- Nada de esto cambia filas existentes. Comprobación previa en producción (informativa; las reglas solo actúan
-- en la próxima escritura de cada turno):
--   select estado, count(*) from personal.turno group by estado;
--   -- pares de turnos de la misma persona con menos de 8 h de descanso entre ellos:
--   select a.persona_id, a.id, b.id from personal.turno a join personal.turno b on b.persona_id = a.persona_id
--    and lower(b.periodo) >= upper(a.periodo) and lower(b.periodo) - upper(a.periodo) < interval '8 hours'
--    where a.estado not in ('cancelado') and b.estado not in ('cancelado');

-- 1. Estado ausente y datos de asistencia.
alter table personal.turno drop constraint turno_estado_check;
alter table personal.turno add constraint turno_estado_check
  check (estado in ('borrador', 'publicado', 'en_curso', 'completado', 'cancelado', 'ausente'));

alter table personal.turno
  add column presente_desde timestamptz,
  add column ausencia_tipo text check (ausencia_tipo in ('justificada', 'injustificada')),
  add column asistencia_motivo text,
  add column asistencia_por uuid,
  add column asistencia_en timestamptz,
  add column alerta_sin_confirmar_en timestamptz,
  add column excepcion_carga text check (excepcion_carga is null or length(btrim(excepcion_carga)) >= 10),
  -- Ausente si y solo si tiene tipo de ausencia; una ausencia lleva motivo y no tiene entrada.
  add constraint turno_asistencia_coherente check (
    (estado = 'ausente') = (ausencia_tipo is not null)
    and (estado <> 'ausente' or (presente_desde is null and length(btrim(coalesce(asistencia_motivo, ''))) >= 10))
    and (presente_desde is null or estado in ('publicado', 'en_curso', 'completado'))),
  -- La entrada cae dentro del turno (se admite marcarla hasta 1 h antes del inicio).
  add constraint turno_entrada_en_periodo check (
    presente_desde is null or (presente_desde >= lower(periodo) - interval '1 hour' and presente_desde < upper(periodo)));

-- 2 a 4. Reglas del turno.
create function personal.validar_turno() returns trigger language plpgsql set search_path = '' as $$
declare
  descanso jsonb;
  carga jsonb;
  tope numeric;
  ventana timestamptz;
  total numeric;
  previo record;
  necesita numeric;
  cuenta boolean;
begin
  if tg_op = 'UPDATE' and new.estado is distinct from old.estado then
    if not (
         (old.estado = 'borrador' and new.estado in ('publicado', 'cancelado'))
      or (old.estado = 'publicado' and new.estado in ('borrador', 'en_curso', 'completado', 'cancelado', 'ausente')
          and (new.estado <> 'borrador' or new.presente_desde is null))
      or (old.estado = 'en_curso' and new.estado in ('completado', 'ausente'))
      or (old.estado = 'completado' and new.estado = 'ausente')
      or (old.estado = 'ausente' and new.estado in ('publicado', 'en_curso', 'completado'))) then
      raise exception 'transicion_invalida' using errcode = 'P0001',
        detail = format('Un turno %s no puede pasar a %s.', old.estado, new.estado);
    end if;
  end if;

  if tg_op = 'UPDATE' and old.estado in ('en_curso', 'completado', 'ausente')
     and (new.periodo <> old.periodo or new.persona_id <> old.persona_id or new.area_id <> old.area_id or new.tipo <> old.tipo) then
    raise exception 'turno_iniciado' using errcode = 'P0001',
      detail = 'MA-TUR-03: un turno que ya empezó no cambia de persona, área, horario ni tipo.';
  end if;

  -- MA-TUR-05: cancelar o mover el turno de un médico no deja citas vivas fuera de su jornada.
  if tg_op = 'UPDATE' and old.estado not in ('cancelado', 'ausente')
     and ((new.estado = 'cancelado') or new.periodo <> old.periodo or new.persona_id <> old.persona_id)
     and exists (
       select 1 from atencion.cita c
       where c.medico_id = old.persona_id and c.estado in ('solicitada', 'confirmada') and c.horario && old.periodo
         and not (new.estado <> 'cancelado' and new.persona_id = old.persona_id and new.periodo @> c.horario)) then
    raise exception 'turno_con_citas' using errcode = 'P0001',
      detail = 'El médico tiene citas en ese horario; reprográmalas o cancélalas antes de cambiar el turno.';
  end if;

  -- RN-30: quien va en un servicio de ambulancia activo no se marca ausente.
  if new.estado = 'ausente' and (tg_op = 'INSERT' or old.estado <> 'ausente') and exists (
       select 1 from ambulancia.tripulacion t join ambulancia.servicio s on s.id = t.servicio_id
       where t.persona_id = new.persona_id and s.finalizado_en is null and new.periodo @> s.despachado_en) then
    raise exception 'tripulante_en_servicio' using errcode = 'P0001',
      detail = 'La persona va en un servicio de ambulancia activo; no puede quedar ausente.';
  end if;

  -- CARGA-01: descanso y tope semanal para los turnos que cuentan como trabajo.
  cuenta := new.estado not in ('cancelado', 'ausente');
  if cuenta and (tg_op = 'INSERT' or new.periodo <> old.periodo or new.persona_id <> old.persona_id
                 or old.estado in ('cancelado', 'ausente') or new.excepcion_carga is distinct from old.excepcion_carga) then
    descanso := plataforma.politica_vigente('turnos.descanso', lower(new.periodo));
    -- La excepción de carga (emergencia auditada, 10+ caracteres) también cubre el descanso en la base; la API sigue
    -- exigiendo RN-13 a la planificación normal.
    if descanso is not null and new.excepcion_carga is null then
      for previo in
        select lower(periodo) as ini, upper(periodo) as fin from personal.turno
        where persona_id = new.persona_id and id <> new.id and estado not in ('cancelado', 'ausente')
          and periodo && tstzrange(lower(new.periodo) - interval '2 days', upper(new.periodo) + interval '2 days')
      loop
        if previo.fin <= lower(new.periodo) then
          necesita := case when previo.fin - previo.ini >= interval '24 hours'
                           then (descanso->>'tras_guardia_24h')::numeric else (descanso->>'min_horas')::numeric end;
          if lower(new.periodo) - previo.fin < make_interval(secs => necesita * 3600) then
            raise exception 'descanso_insuficiente' using errcode = 'P0001',
              detail = format('RN-13: necesita %s h de descanso después del turno anterior.', necesita);
          end if;
        elsif previo.ini >= upper(new.periodo) then
          necesita := case when upper(new.periodo) - lower(new.periodo) >= interval '24 hours'
                           then (descanso->>'tras_guardia_24h')::numeric else (descanso->>'min_horas')::numeric end;
          if previo.ini - upper(new.periodo) < make_interval(secs => necesita * 3600) then
            raise exception 'descanso_insuficiente' using errcode = 'P0001',
              detail = format('RN-13: necesita %s h de descanso antes del turno siguiente.', necesita);
          end if;
        end if;
      end loop;
    end if;

    carga := plataforma.politica_vigente('turnos.carga', lower(new.periodo));
    tope := (carga->>'max_horas_7_dias')::numeric;
    if tope is not null and new.excepcion_carga is null then
      -- El máximo de una ventana deslizante de 7 días se alcanza cuando la ventana empieza en el inicio de un turno
      -- o termina en el fin de uno; basta revisar esas ventanas.
      for ventana in
        select lower(periodo) from personal.turno
         where persona_id = new.persona_id and id <> new.id and estado not in ('cancelado', 'ausente')
           and periodo && tstzrange(lower(new.periodo) - interval '7 days', upper(new.periodo) + interval '7 days')
        union select upper(periodo) - interval '7 days' from personal.turno
         where persona_id = new.persona_id and id <> new.id and estado not in ('cancelado', 'ausente')
           and periodo && tstzrange(lower(new.periodo) - interval '7 days', upper(new.periodo) + interval '7 days')
        union select lower(new.periodo) union select upper(new.periodo) - interval '7 days'
      loop
        select coalesce(sum(extract(epoch from (least(upper(p), ventana + interval '7 days') - greatest(lower(p), ventana))) / 3600), 0)
          into total
          from (select periodo as p from personal.turno
                 where persona_id = new.persona_id and id <> new.id and estado not in ('cancelado', 'ausente')
                   and periodo && tstzrange(ventana, ventana + interval '7 days')
                union all select new.periodo where new.periodo && tstzrange(ventana, ventana + interval '7 days')) s;
        if total > tope then
          raise exception 'carga_semanal_excedida' using errcode = 'P0001',
            detail = format('CARGA-01: suma %s h en 7 días; el tope es %s h.', round(total, 2), tope);
        end if;
      end loop;
    end if;
  end if;
  return new;
end $$;

create trigger turno_reglas before insert or update on personal.turno
  for each row execute function personal.validar_turno();

-- 4. No hay citas vivas en el horario de un médico ausente.
create function atencion.validar_cita_medico_presente() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.estado in ('solicitada', 'confirmada') and exists (
       select 1 from personal.turno t
       where t.persona_id = new.medico_id and t.estado = 'ausente' and t.periodo && new.horario) then
    raise exception 'medico_ausente' using errcode = 'P0001',
      detail = 'ASIS-01: el médico está marcado ausente en ese horario.';
  end if;
  return new;
end $$;
create trigger cita_medico_presente before insert or update of estado, horario, medico_id on atencion.cita
  for each row execute function atencion.validar_cita_medico_presente();

-- 4. Una persona ausente no entra en la tripulación de un servicio despachado durante su turno.
create function ambulancia.validar_tripulante_presente() returns trigger language plpgsql set search_path = '' as $$
begin
  if exists (
       select 1 from personal.turno t join ambulancia.servicio s on s.id = new.servicio_id
       where t.persona_id = new.persona_id and t.estado = 'ausente' and t.periodo @> s.despachado_en) then
    raise exception 'tripulante_ausente' using errcode = 'P0001',
      detail = 'ASIS-01 / RN-30: la persona está marcada ausente en su turno.';
  end if;
  return new;
end $$;
create trigger tripulacion_presente before insert on ambulancia.tripulacion
  for each row execute function ambulancia.validar_tripulante_presente();

-- 5. Políticas nuevas (valores a confirmar por el responsable; ver docs/preguntas-abiertas.md).
--    turnos.carga: 72 h en 7 días = 44 h ordinarias (Código de Trabajo Art. 161) + una guardia de 24 h + 4 h;
--    6 días seguidos como máximo (un día de descanso semanal, Art. 171).
--    turnos.asistencia: margen de 15 min para marcar la entrada antes de "sin confirmar" y entrada desde 30 min antes.
--    turnos.horario_servicios: horario de atención de Recepción y Laboratorio para la cobertura mínima (RN-15).
insert into plataforma.politica (clave, valor, vigencia, fuente, aprobado_por) values
 ('turnos.carga', '{"max_horas_7_dias":72,"max_dias_seguidos":6}', tstzrange('2026-10-01', null), 'CARGA-01, Código de Trabajo Art. 161 y 171', 'equipo SGHU'),
 ('turnos.asistencia', '{"margen_minutos":15,"entrada_anticipada_minutos":30}', tstzrange('2026-10-01', null), 'ASIS-01', 'equipo SGHU'),
 ('turnos.horario_servicios', '{"P1-REC":{"desde":7,"hasta":19},"P1-LAB":{"desde":7,"hasta":17}}', tstzrange('2026-10-01', null), 'RN-15, CARGA-03', 'equipo SGHU')
on conflict do nothing;

-- Reversión (manual): drop trigger turno_reglas on personal.turno; drop trigger cita_medico_presente on atencion.cita;
-- drop trigger tripulacion_presente on ambulancia.tripulacion; drop function personal.validar_turno(),
-- atencion.validar_cita_medico_presente(), ambulancia.validar_tripulante_presente(); pasar los turnos `ausente` a
-- `completado`; quitar las columnas nuevas y volver al check de estado original; borrar las tres políticas.
