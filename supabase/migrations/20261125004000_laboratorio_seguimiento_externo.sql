-- Fase 2, flujo C (S10): laboratorio <-> médico <-> externo.
--
-- 1. Observación relevante: el laboratorio puede anotar una observación en un resultado y marcarla como relevante. Se
--    guarda también en el historial cuando el resultado se corrige (nada clínico se borra).
-- 2. Pendiente del médico ("Resultados por revisar"): un resultado con valor crítico o con observación relevante abre un
--    pendiente de seguimiento para el médico que pidió la orden. Hay a lo sumo uno abierto por orden; el médico lo marca
--    revisado. No sustituye la revisión que libera los valores al paciente (D-040).
-- 3. Orden externa: un examen que no está disponible hoy o que se hace en otro sitio (por ejemplo una radiografía). La orden
--    queda marcada externa con el lugar y las instrucciones para el paciente. El resultado entra con los valores clave y
--    la referencia del archivo (foto o PDF) que lo respalda: nombre, tipo, tamaño y huella SHA-256. El Storage clínico no
--    está construido (docs/arquitectura/arquitectura.md); `ruta_almacenamiento` queda nula hasta que exista un bucket
--    privado con sus políticas. No se crea ningún bucket aquí.
-- 4. Propuesta de cita de seguimiento: al completarse una orden de consulta, el sistema propone una cita con el médico
--    que la pidió. Recepción la confirma enlazando la cita que agenda con el comando existente (POST /citas) o la descarta
--    con motivo.
--
-- Datos reales que cambian: ninguno. Agrega columnas con valor por omisión a laboratorio.orden (externa = false para
-- todas las órdenes existentes) y a laboratorio.resultado / resultado_historial (observación nula, relevante = false), y
-- crea tres tablas vacías. No modifica ni borra filas existentes.
--
-- Pre-comprobación en producción (no debe devolver filas; nada de esto existe todavía):
--   select table_name from information_schema.tables where table_schema = 'laboratorio'
--     and table_name in ('adjunto', 'pendiente_medico', 'propuesta_cita');
--   select column_name from information_schema.columns where table_schema = 'laboratorio'
--     and ((table_name = 'orden' and column_name in ('externa', 'lugar_externo', 'instrucciones_externas', 'externa_desde', 'externa_por'))
--       or (table_name in ('resultado', 'resultado_historial') and column_name in ('observacion', 'observacion_relevante')));
--
-- Reversa (manual, en este orden):
--   drop table if exists laboratorio.propuesta_cita;
--   drop table if exists laboratorio.pendiente_medico;
--   drop table if exists laboratorio.adjunto;
--   alter table laboratorio.resultado_historial drop column if exists observacion_relevante, drop column if exists observacion;
--   alter table laboratorio.resultado drop constraint if exists resultado_observacion_relevante,
--     drop column if exists observacion_relevante, drop column if exists observacion;
--   alter table laboratorio.orden drop constraint if exists orden_externa_datos,
--     drop column if exists externa_por, drop column if exists externa_desde, drop column if exists instrucciones_externas,
--     drop column if exists lugar_externo, drop column if exists externa;

alter table laboratorio.orden
  add column externa boolean not null default false,
  add column lugar_externo text,
  add column instrucciones_externas text,
  add column externa_desde timestamptz,
  add column externa_por uuid,
  add constraint orden_externa_datos check (
    not externa or (lugar_externo is not null and length(trim(lugar_externo)) >= 3
      and instrucciones_externas is not null and length(trim(instrucciones_externas)) >= 10));

alter table laboratorio.resultado
  add column observacion text,
  add column observacion_relevante boolean not null default false,
  add constraint resultado_observacion_relevante check (not observacion_relevante or (observacion is not null and length(trim(observacion)) > 0));

alter table laboratorio.resultado_historial
  add column observacion text,
  add column observacion_relevante boolean not null default false;

-- Referencia del archivo que respalda un resultado externo (foto o PDF).
create table laboratorio.adjunto (
  id uuid primary key default gen_random_uuid(),
  orden_id uuid not null references laboratorio.orden(id),
  nombre_archivo text not null check (length(trim(nombre_archivo)) between 1 and 200),
  tipo_mime text not null check (tipo_mime in ('application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'image/webp')),
  tamano_bytes int not null check (tamano_bytes > 0 and tamano_bytes <= 10485760),
  huella_sha256 text check (huella_sha256 ~ '^[0-9a-f]{64}$'),
  -- Nula mientras no exista el Storage clínico privado: solo se conserva la referencia.
  ruta_almacenamiento text,
  nota text,
  subido_por uuid not null,
  subido_en timestamptz not null default now()
);
create index adjunto_orden on laboratorio.adjunto (orden_id);

-- Bandeja "Resultados por revisar" del médico que pidió la orden.
create table laboratorio.pendiente_medico (
  id uuid primary key default gen_random_uuid(),
  orden_id uuid not null references laboratorio.orden(id),
  paciente_id uuid not null,
  medico_id uuid not null,
  motivo text not null check (motivo in ('critico', 'observacion')),
  detalle text not null,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'revisado')),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  revisado_en timestamptz,
  revisado_por uuid,
  version int not null default 1,
  check (estado <> 'revisado' or (revisado_en is not null and revisado_por is not null))
);
create unique index pendiente_medico_abierto on laboratorio.pendiente_medico (orden_id) where estado = 'pendiente';
create index pendiente_medico_bandeja on laboratorio.pendiente_medico (medico_id, estado, creado_en);

-- Propuesta de cita de seguimiento; una por orden.
create table laboratorio.propuesta_cita (
  id uuid primary key default gen_random_uuid(),
  orden_id uuid not null unique references laboratorio.orden(id),
  paciente_id uuid not null,
  medico_id uuid not null,
  estado text not null default 'propuesta' check (estado in ('propuesta', 'confirmada', 'descartada')),
  cita_id uuid references atencion.cita(id),
  motivo_descarte text,
  creada_en timestamptz not null default now(),
  resuelta_en timestamptz,
  resuelta_por uuid,
  version int not null default 1,
  check (estado <> 'confirmada' or cita_id is not null),
  check (estado <> 'descartada' or (motivo_descarte is not null and length(trim(motivo_descarte)) >= 10)),
  check (estado = 'propuesta' or (resuelta_en is not null and resuelta_por is not null))
);
create index propuesta_cita_abierta on laboratorio.propuesta_cita (estado, creada_en);

grant select, insert on laboratorio.adjunto to sghu_api;
grant select, insert, update on laboratorio.pendiente_medico, laboratorio.propuesta_cita to sghu_api;
