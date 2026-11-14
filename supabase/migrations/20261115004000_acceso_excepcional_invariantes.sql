-- Spec 110 (T03, T04, T08). Invariantes del acceso excepcional (RN-38, RN-40, D-031) y búsqueda de auditoría.
--  * `version` para concurrencia optimista al aprobar o negar (FR-100-12).
--  * La vigencia nunca dura más que las horas pedidas y siempre tiene inicio y fin (RN-40: vence sola).
--  * Toda resolución tiene autor; solo el acceso de urgencia ("romper el vidrio", FR-110-09) puede estar
--    aprobado sin autor mientras espera la revisión posterior del delegado.
--  * Una sola solicitud pendiente por persona y paciente.
--  * El paciente del acceso existe en el expediente.
--  * Índice de auditoría por acción y fecha para los filtros del delegado (FR-110-07).
--
-- Pre-chequeo en producción: cada consulta debe devolver 0 filas antes de aplicar.
--   select id from acceso.acceso_excepcional where vigencia is not null and not isempty(vigencia)
--     and (lower_inf(vigencia) or upper_inf(vigencia) or upper(vigencia) - lower(vigencia) > make_interval(hours => horas));
--   select id from acceso.acceso_excepcional where (estado = 'pendiente' and resuelto_por is not null)
--     or (estado <> 'pendiente' and resuelto_por is null and not (estado = 'aprobado' and urgencia));
--   select solicitante_id, paciente_id from acceso.acceso_excepcional where estado = 'pendiente' group by 1, 2 having count(*) > 1;
--   select a.id from acceso.acceso_excepcional a left join pacientes.paciente p on p.id = a.paciente_id where p.id is null;

alter table acceso.acceso_excepcional add column if not exists version int not null default 1;

do $$ begin
  if exists (select 1 from acceso.acceso_excepcional where vigencia is not null and not isempty(vigencia)
      and (lower_inf(vigencia) or upper_inf(vigencia) or upper(vigencia) - lower(vigencia) > make_interval(hours => horas))) then
    raise exception 'Hay accesos excepcionales con una vigencia abierta o más larga que las horas pedidas; corrígelos antes de aplicar esta migración.';
  end if;
  if exists (select 1 from acceso.acceso_excepcional where (estado = 'pendiente' and resuelto_por is not null)
      or (estado <> 'pendiente' and resuelto_por is null and not (estado = 'aprobado' and urgencia))) then
    raise exception 'Hay accesos excepcionales resueltos sin autor (o pendientes con autor); corrígelos antes de aplicar esta migración.';
  end if;
  if exists (select 1 from acceso.acceso_excepcional where estado = 'pendiente' group by solicitante_id, paciente_id having count(*) > 1) then
    raise exception 'Hay más de una solicitud pendiente de acceso excepcional para la misma persona y paciente; niega las sobrantes antes de aplicar esta migración.';
  end if;
  if exists (select 1 from acceso.acceso_excepcional a left join pacientes.paciente p on p.id = a.paciente_id where p.id is null) then
    raise exception 'Hay accesos excepcionales de pacientes que no existen; corrígelos antes de aplicar esta migración.';
  end if;

  if not exists (select 1 from pg_constraint where conname = 'acceso_excepcional_vigencia_horas') then
    alter table acceso.acceso_excepcional add constraint acceso_excepcional_vigencia_horas check (
      vigencia is null or isempty(vigencia)
      or (not lower_inf(vigencia) and not upper_inf(vigencia) and upper(vigencia) - lower(vigencia) <= make_interval(hours => horas)));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'acceso_excepcional_resolucion_con_autor') then
    alter table acceso.acceso_excepcional add constraint acceso_excepcional_resolucion_con_autor check (
      (estado = 'pendiente' and resuelto_por is null)
      or (estado <> 'pendiente' and (resuelto_por is not null or (estado = 'aprobado' and urgencia))));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'acceso_excepcional_paciente_fk') then
    alter table acceso.acceso_excepcional add constraint acceso_excepcional_paciente_fk foreign key (paciente_id) references pacientes.paciente(id);
  end if;
end $$;

create unique index if not exists acceso_excepcional_pendiente_unico on acceso.acceso_excepcional (solicitante_id, paciente_id) where estado = 'pendiente';
create index if not exists auditoria_accion on plataforma.auditoria (accion, registrado_en);

-- Rollback (manual):
--   drop index if exists plataforma.auditoria_accion;
--   drop index if exists acceso.acceso_excepcional_pendiente_unico;
--   alter table acceso.acceso_excepcional drop constraint if exists acceso_excepcional_paciente_fk;
--   alter table acceso.acceso_excepcional drop constraint if exists acceso_excepcional_resolucion_con_autor;
--   alter table acceso.acceso_excepcional drop constraint if exists acceso_excepcional_vigencia_horas;
--   alter table acceso.acceso_excepcional drop column if exists version;
