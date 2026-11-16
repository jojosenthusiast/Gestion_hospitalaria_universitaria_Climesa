-- Auditoría final, laboratorio (MA-LAB-02, MA-LAB-03, MA-LAB-06).
--
-- MA-LAB-02: un resultado de una orden completada (y quizá ya liberada) se enmienda con motivo. La orden sigue en
--   'completado' (el trigger validar_orden no admite salir de ese estado), se marca enmendada y vuelve a revisión
--   médica: revisada_en se limpia en la misma transacción (D-040). El valor anterior queda en resultado_historial.
-- MA-LAB-03: laboratorio.puede_revisar decide qué médico (persona tipo 'medico' activa) revisa y libera una orden:
--   el que la pidió, el tratante de la admisión activa del paciente, uno con relación de atención vigente o un
--   suplente: médico de turno ahora (publicado o en_curso) en el área de origen de la orden (área del turno de quien la
--   pidió al crearla o área del consultorio de la consulta), y solo cuando la orden lleva sin revisar el plazo de la
--   política versionada laboratorio.revision_suplente_horas (2 horas por omisión) desde que se completó o enmendó.
-- MA-LAB-06: el examen lleva versión para editarlo desde el catálogo (PUT /catalogo/examenes/{id}).
--
-- Pre-comprobación en producción (no debe devolver filas; las columnas, la función y la política todavía no existen):
--   select column_name from information_schema.columns where table_schema = 'laboratorio'
--     and ((table_name = 'orden' and column_name in ('enmendada_en', 'enmendada_por')) or (table_name = 'examen' and column_name = 'version'));
--   select proname from pg_proc where proname = 'puede_revisar';
--   select clave from plataforma.politica where clave = 'laboratorio.revision_suplente_horas';
--
-- Reversa:
--   drop function if exists laboratorio.puede_revisar(uuid, uuid, timestamptz);
--   delete from plataforma.politica where clave = 'laboratorio.revision_suplente_horas';
--   alter table laboratorio.orden drop constraint if exists orden_enmienda_completada, drop column if exists enmendada_en, drop column if exists enmendada_por;
--   alter table laboratorio.examen drop column if exists version;

alter table laboratorio.orden
  add column enmendada_en timestamptz,
  add column enmendada_por uuid,
  add constraint orden_enmienda_completada check (enmendada_en is null or estado = 'completado');

alter table laboratorio.examen add column version int not null default 1;

insert into plataforma.politica (clave, valor, vigencia, fuente, aprobado_por)
select 'laboratorio.revision_suplente_horas', '{"horas":2}'::jsonb, tstzrange('2026-10-01', null), 'Auditoría final MA-LAB-03', 'equipo SGHU'
where not exists (select 1 from plataforma.politica where clave = 'laboratorio.revision_suplente_horas');

create function laboratorio.puede_revisar(p_orden uuid, p_medico uuid, p_en timestamptz) returns boolean
language sql stable set search_path = '' as $$
  select exists (
    select 1 from laboratorio.orden o
    join personal.persona d on d.id = p_medico and d.tipo = 'medico' and d.activo
    where o.id = p_orden and (
      o.medico_id = p_medico
      or exists (select 1 from hospitalizacion.admision a
                 where a.paciente_id = o.paciente_id and a.medico_tratante_id = p_medico
                   and a.estado in ('pendiente_cama', 'hospitalizado', 'alta_firmada'))
      or exists (select 1 from atencion.relacion_atencion r
                 where r.paciente_id = o.paciente_id and r.profesional_id = p_medico and r.vigencia @> p_en)
      or (o.estado = 'completado' and o.revisada_en is null
          and greatest(o.completada_en, o.enmendada_en)
              + coalesce((plataforma.politica_vigente('laboratorio.revision_suplente_horas', p_en) ->> 'horas')::numeric, 2) * interval '1 hour' <= p_en
          and exists (
            select 1 from personal.turno t
            where t.persona_id = p_medico and t.estado in ('publicado', 'en_curso') and t.periodo @> p_en
              and t.area_id in (
                select tr.area_id from personal.turno tr
                where tr.persona_id = o.medico_id and tr.estado in ('publicado', 'en_curso', 'completado') and tr.periodo @> o.creada_en
                union
                select up.id from atencion.consulta c
                cross join lateral (
                  with recursive sube(id, padre_id, tipo) as (
                    select e.id, e.padre_id, e.tipo from infra.espacio e where e.id = c.consultorio_id
                    union all
                    select e.id, e.padre_id, e.tipo from infra.espacio e join sube s on e.id = s.padre_id)
                  select id, tipo from sube) up
                where c.id = o.consulta_id and up.tipo = 'area')))))
$$;
grant execute on function laboratorio.puede_revisar(uuid, uuid, timestamptz) to sghu_api;
