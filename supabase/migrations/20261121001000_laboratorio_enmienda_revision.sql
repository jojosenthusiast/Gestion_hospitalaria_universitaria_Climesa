-- Auditoría final, laboratorio (MA-LAB-02, MA-LAB-03, MA-LAB-06).
--
-- MA-LAB-02: un resultado de una orden completada (y quizá ya liberada) se enmienda con motivo. La orden sigue en
--   'completado' (el trigger validar_orden no admite salir de ese estado), se marca enmendada y vuelve a revisión
--   médica: revisada_en se limpia en la misma transacción (D-040). El valor anterior queda en resultado_historial.
-- MA-LAB-03: laboratorio.puede_revisar decide quién revisa y libera una orden: el médico que la pidió, el tratante de la
--   admisión activa del paciente, un médico con relación de atención vigente o, si quien la pidió no tiene turno
--   ahora, cualquier médico de turno (estado publicado o en_curso que cubre el instante).
-- MA-LAB-06: el examen lleva versión para editarlo desde el catálogo (PUT /catalogo/examenes/{id}).
--
-- Pre-comprobación en producción (no debe devolver filas; las columnas y la función todavía no existen):
--   select column_name from information_schema.columns where table_schema = 'laboratorio'
--     and ((table_name = 'orden' and column_name in ('enmendada_en', 'enmendada_por')) or (table_name = 'examen' and column_name = 'version'));
--   select proname from pg_proc where proname = 'puede_revisar';
--
-- Reversa:
--   drop function if exists laboratorio.puede_revisar(uuid, uuid, timestamptz);
--   alter table laboratorio.orden drop constraint if exists orden_enmienda_completada, drop column if exists enmendada_en, drop column if exists enmendada_por;
--   alter table laboratorio.examen drop column if exists version;

alter table laboratorio.orden
  add column enmendada_en timestamptz,
  add column enmendada_por uuid,
  add constraint orden_enmienda_completada check (enmendada_en is null or estado = 'completado');

alter table laboratorio.examen add column version int not null default 1;

create function laboratorio.puede_revisar(p_orden uuid, p_medico uuid, p_en timestamptz) returns boolean
language sql stable set search_path = '' as $$
  select exists (
    select 1 from laboratorio.orden o
    where o.id = p_orden and (
      o.medico_id = p_medico
      or exists (select 1 from hospitalizacion.admision a
                 where a.paciente_id = o.paciente_id and a.medico_tratante_id = p_medico
                   and a.estado in ('pendiente_cama', 'hospitalizado', 'alta_firmada'))
      or exists (select 1 from atencion.relacion_atencion r
                 where r.paciente_id = o.paciente_id and r.profesional_id = p_medico and r.vigencia @> p_en)
      or (exists (select 1 from personal.turno t join personal.persona p on p.id = t.persona_id
                  where t.persona_id = p_medico and p.tipo = 'medico' and p.activo
                    and t.estado in ('publicado', 'en_curso') and t.periodo @> p_en)
          and not exists (select 1 from personal.turno t
                          where t.persona_id = o.medico_id and t.estado in ('publicado', 'en_curso') and t.periodo @> p_en))))
$$;
grant execute on function laboratorio.puede_revisar(uuid, uuid, timestamptz) to sghu_api;
