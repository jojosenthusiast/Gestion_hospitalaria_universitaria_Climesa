-- Observación 9 (ronda 1): la especialidad deja de ser texto libre. Catálogo por categoría alineada con el tipo de
-- personal: `medico` = especialidades médicas (por defecto "Medicina general"); `enfermero` = áreas de enfermería; el
-- resto de tipos no lleva especialidad. La columna `personal.persona.especialidad` sigue siendo texto (no se reescribe
-- el historial); la API valida contra este catálogo por nombre. Idempotente.

create table if not exists personal.especialidad_catalogo (
  codigo text primary key check (codigo ~ '^[a-z][a-z0-9_]*$'),
  nombre text not null,
  categoria text not null check (categoria in ('medico', 'enfermero')),
  orden int not null default 100,
  activo boolean not null default true,
  unique (categoria, nombre)
);

grant select on personal.especialidad_catalogo to sghu_api;
alter table personal.especialidad_catalogo enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'personal' and tablename = 'especialidad_catalogo' and policyname = 'api_sghu') then
    create policy api_sghu on personal.especialidad_catalogo for all to sghu_api using (true) with check (true);
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on personal.especialidad_catalogo from anon, authenticated;
  end if;
end $$;

insert into personal.especialidad_catalogo (codigo, nombre, categoria, orden) values
  ('medicina_general', 'Medicina general', 'medico', 10),
  ('medicina_interna', 'Medicina interna', 'medico', 20),
  ('pediatria', 'Pediatría', 'medico', 30),
  ('ginecologia_obstetricia', 'Ginecología y obstetricia', 'medico', 40),
  ('cirugia_general', 'Cirugía general', 'medico', 50),
  ('emergencias', 'Emergencias', 'medico', 60),
  ('traumatologia_ortopedia', 'Traumatología y ortopedia', 'medico', 70),
  ('cardiologia', 'Cardiología', 'medico', 80),
  ('neurologia', 'Neurología', 'medico', 90),
  ('dermatologia', 'Dermatología', 'medico', 100),
  ('oftalmologia', 'Oftalmología', 'medico', 110),
  ('otorrinolaringologia', 'Otorrinolaringología', 'medico', 120),
  ('psiquiatria', 'Psiquiatría', 'medico', 130),
  ('anestesiologia', 'Anestesiología', 'medico', 140),
  ('urologia', 'Urología', 'medico', 150),
  ('gastroenterologia', 'Gastroenterología', 'medico', 160),
  ('alergologia', 'Alergología', 'medico', 170),
  ('radiologia', 'Radiología e imagen', 'medico', 180),
  ('patologia_clinica', 'Patología clínica', 'medico', 190),
  ('enfermeria_general', 'Enfermería general', 'enfermero', 10),
  ('enfermeria_emergencias', 'Emergencias', 'enfermero', 20),
  ('enfermeria_hospitalizacion', 'Hospitalización', 'enfermero', 30),
  ('enfermeria_consulta_externa', 'Consulta externa', 'enfermero', 40),
  ('enfermeria_pediatria', 'Pediatría', 'enfermero', 50),
  ('enfermeria_cuidados_intensivos', 'Cuidados intensivos', 'enfermero', 60),
  ('enfermeria_quirofano', 'Quirófano', 'enfermero', 70),
  ('enfermeria_obstetricia', 'Obstetricia', 'enfermero', 80)
on conflict (codigo) do nothing;
