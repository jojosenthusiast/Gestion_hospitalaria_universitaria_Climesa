-- Ingreso guiado de pacientes (observación 11): motivo y origen obligatorios, requisitos clínicos y visitas.
-- Las filas existentes quedan marcadas como `legado` y no se validan; toda fila nueva cumple las reglas.
-- Comprobación previa en producción (solo lectura, no bloquea la migración):
--   select count(*) from hospitalizacion.admision;   -- cuántas filas quedarán como legado
--   select origen, count(*) from hospitalizacion.admision group by 1;

alter table hospitalizacion.admision
  add column legado boolean not null default false,
  add column motivo text,
  add column tipo_aislamiento text check (tipo_aislamiento in ('contacto', 'gotitas', 'aerea', 'protector')),
  add column inestable boolean not null default false,
  add column postquirurgico boolean not null default false,
  add column visitas_permitidas boolean not null default true,
  add column visitantes_max int not null default 1 check (visitantes_max between 0 and 4);

-- Todo lo anterior a esta migración es legado: se conserva tal cual.
update hospitalizacion.admision set legado = true;

-- Nuevo origen `cita`; `programada` solo sobrevive en filas legado.
alter table hospitalizacion.admision drop constraint admision_origen_check;
alter table hospitalizacion.admision add constraint admision_origen_check
  check (origen in ('cita', 'consulta', 'emergencia', 'ambulancia', 'programada'));

alter table hospitalizacion.admision add constraint admision_motivo_obligatorio
  check (legado or (motivo is not null and length(btrim(motivo)) >= 10));
alter table hospitalizacion.admision add constraint admision_origen_vinculado
  check (legado or (origen <> 'programada' and origen_id is not null));
alter table hospitalizacion.admision add constraint admision_aislamiento_tipo
  check (tipo_aislamiento is null or aislamiento);
alter table hospitalizacion.admision add constraint admision_visitas_coherentes
  check ((visitas_permitidas and visitantes_max >= 1) or (not visitas_permitidas and visitantes_max = 0));
