-- Fase 2, flujo A (S8): el paciente pide cita por motivo (categoría o especialidad), sin elegir médico.
-- Antes el paciente elegía entre 45 médicos y una franja exacta. Ahora elige una o más categorías con ícono
-- (búsqueda por texto; el médico solo como preferencia opcional), su franja preferida (mañana, tarde o cualquiera) y una
-- nota breve. Recepción la recibe en una bandeja de pendientes y asigna médico y hora: la asignación crea una cita
-- confirmada normal (franja de 20 minutos, jornada del médico, sin traslape), así que las reglas de cita existentes
-- (reprogramar, cancelar, no asistió, barrido de vencidas) siguen aplicando sin cambios. La solicitud con médico y hora
-- (`POST /citas/solicitudes`) sigue existiendo igual.
--
-- 1. `atencion.categoria_cita`: catálogo de motivos con ícono, palabras para la búsqueda y las especialidades
--    (nombres de `personal.especialidad_catalogo`) que sugiere a recepción al asignar.
-- 2. `atencion.solicitud_cita`: la solicitud sin médico. Una solicitud resuelta (asignada, rechazada o cancelada) ya
--    no cambia; lo garantiza el disparador `atencion.validar_solicitud_cita`.
--
-- Datos reales que cambia en producción: ninguno de las tablas existentes. Crea dos tablas nuevas e inserta 14 filas
-- de catálogo en `atencion.categoria_cita`.
--
-- Pre-comprobación en producción (no debe devolver filas):
--   select to_regclass('atencion.categoria_cita'), to_regclass('atencion.solicitud_cita') where to_regclass('atencion.categoria_cita') is not null or to_regclass('atencion.solicitud_cita') is not null;
--
-- Reversa:
--   drop table atencion.solicitud_cita; drop table atencion.categoria_cita; drop function atencion.validar_solicitud_cita();
set local lock_timeout = '5s';

create table if not exists atencion.categoria_cita (
  codigo text primary key check (codigo ~ '^[a-z][a-z0-9_]*$'),
  nombre text not null unique,
  descripcion text not null,
  -- Clave estable del ícono: cada cliente la traduce a su juego de íconos (web, Material, SF Symbols).
  icono text not null check (icono ~ '^[a-z][a-z0-9_]*$'),
  especialidades text[] not null default '{}',
  palabras_clave text not null default '',
  orden int not null default 100,
  activo boolean not null default true
);

create table if not exists atencion.solicitud_cita (
  id uuid primary key default gen_random_uuid(),
  paciente_id uuid not null references pacientes.paciente(id),
  categorias text[] not null check (cardinality(categorias) between 1 and 3),
  medico_preferido_id uuid references personal.persona(id),
  franja text not null check (franja in ('manana', 'tarde', 'cualquiera')),
  nota text check (nota is null or char_length(nota) <= 280),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'asignada', 'rechazada', 'cancelada')),
  cita_id uuid unique references atencion.cita(id),
  motivo_rechazo text,
  creado_por uuid,
  creado_en timestamptz not null default now(),
  resuelta_por uuid,
  resuelta_en timestamptz,
  version int not null default 1,
  check (estado <> 'asignada' or cita_id is not null),
  check (estado <> 'rechazada' or motivo_rechazo is not null),
  check ((estado = 'pendiente') = (resuelta_en is null))
);
create index if not exists solicitud_cita_pendientes on atencion.solicitud_cita (creado_en) where estado = 'pendiente';
create index if not exists solicitud_cita_paciente on atencion.solicitud_cita (paciente_id, creado_en desc);

-- Una solicitud resuelta no se reabre ni se edita; solo una pendiente pasa a asignada, rechazada o cancelada.
create or replace function atencion.validar_solicitud_cita() returns trigger language plpgsql set search_path = '' as $$
begin
  if old.estado <> 'pendiente' then
    raise exception 'transicion_invalida' using errcode = 'P0001';
  end if;
  if new.estado not in ('pendiente', 'asignada', 'rechazada', 'cancelada') then
    raise exception 'transicion_invalida' using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists validar_solicitud_cita on atencion.solicitud_cita;
create trigger validar_solicitud_cita before update on atencion.solicitud_cita
  for each row execute function atencion.validar_solicitud_cita();

grant select on atencion.categoria_cita to sghu_api;
grant select, insert, update on atencion.solicitud_cita to sghu_api;
alter table atencion.categoria_cita enable row level security;
alter table atencion.solicitud_cita enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'atencion' and tablename = 'categoria_cita' and policyname = 'api_sghu') then
    create policy api_sghu on atencion.categoria_cita for all to sghu_api using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'atencion' and tablename = 'solicitud_cita' and policyname = 'api_sghu') then
    create policy api_sghu on atencion.solicitud_cita for all to sghu_api using (true) with check (true);
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on atencion.categoria_cita from anon, authenticated;
    revoke all on atencion.solicitud_cita from anon, authenticated;
  end if;
end $$;

insert into atencion.categoria_cita (codigo, nombre, descripcion, icono, especialidades, palabras_clave, orden) values
  ('consulta_general', 'Consulta general', 'Malestar, fiebre, gripe, control o no sabes a quién acudir', 'general',
    array['Medicina general', 'Medicina interna'], 'fiebre gripe tos dolor malestar chequeo control presion diabetes', 10),
  ('ninos', 'Niños y niñas', 'Control y enfermedades de menores de 18 años', 'nino',
    array['Pediatría'], 'pediatra bebe nino nina hijo vacuna crecimiento', 20),
  ('mujer_embarazo', 'Salud de la mujer y embarazo', 'Control ginecológico, embarazo y planificación', 'mujer',
    array['Ginecología y obstetricia'], 'ginecologo embarazo prenatal menstruacion planificacion citologia', 30),
  ('corazon', 'Corazón y presión', 'Palpitaciones, dolor de pecho leve o presión alta', 'corazon',
    array['Cardiología', 'Medicina interna'], 'cardiologo presion arterial hipertension palpitaciones pecho', 40),
  ('huesos', 'Huesos, músculos y lesiones', 'Golpes, torceduras, dolor de espalda o articulaciones', 'hueso',
    array['Traumatología y ortopedia'], 'traumatologo fractura esguince espalda rodilla columna lesion', 50),
  ('piel', 'Piel', 'Manchas, granos, alergias en la piel, uñas o cabello', 'piel',
    array['Dermatología'], 'dermatologo acne mancha lunar sarpullido cabello unas', 60),
  ('ojos', 'Ojos y visión', 'Visión borrosa, ardor u ojo rojo', 'ojo',
    array['Oftalmología'], 'oftalmologo vista lentes ojo rojo vision', 70),
  ('oido_garganta', 'Oído, nariz y garganta', 'Dolor de oído, sinusitis o garganta', 'oido',
    array['Otorrinolaringología'], 'otorrino oido nariz garganta sinusitis amigdalas', 80),
  ('salud_mental', 'Salud mental', 'Ansiedad, tristeza, sueño o estrés', 'mente',
    array['Psiquiatría'], 'psiquiatra psicologo ansiedad depresion estres insomnio', 90),
  ('cabeza_nervios', 'Cabeza y nervios', 'Dolor de cabeza frecuente, mareos u hormigueo', 'neuro',
    array['Neurología'], 'neurologo migrana dolor de cabeza mareo convulsion hormigueo', 100),
  ('digestivo', 'Estómago y digestión', 'Dolor de estómago, acidez o diarrea', 'digestivo',
    array['Gastroenterología', 'Medicina interna'], 'gastro estomago gastritis colitis diarrea acidez', 110),
  ('rinon_urinario', 'Riñón y vías urinarias', 'Ardor al orinar, cálculos o próstata', 'rinon',
    array['Urología'], 'urologo orina rinon prostata calculos', 120),
  ('alergias', 'Alergias', 'Estornudos, asma o reacciones a alimentos o medicinas', 'alergia',
    array['Alergología'], 'alergologo asma rinitis estornudos reaccion', 130),
  ('cirugia', 'Valoración quirúrgica', 'Hernias, bultos o evaluación antes de una operación', 'cirugia',
    array['Cirugía general'], 'cirujano hernia operacion vesicula bulto', 140)
on conflict (codigo) do nothing;
