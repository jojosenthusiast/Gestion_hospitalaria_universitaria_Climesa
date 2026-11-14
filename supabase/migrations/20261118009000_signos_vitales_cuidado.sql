-- Ronda 3: signos vitales fuera de una consulta (cuidado de enfermería y asistentes). Agrega dolor, glucemia y nota a
-- la toma de signos y un índice para el historial por paciente. Cada toma sigue siendo una fila nueva (nada se borra).
--
-- Pre-comprobación en producción (ninguna de las tres columnas debe existir todavía):
--   select column_name from information_schema.columns
--    where table_schema = 'atencion' and table_name = 'signos_vitales' and column_name in ('dolor', 'glucemia_mg_dl', 'nota');
--
-- Reversa (manual, en este orden):
--   drop index if exists atencion.signos_vitales_paciente_tomado_idx;
--   alter table atencion.signos_vitales drop column if exists nota, drop column if exists glucemia_mg_dl, drop column if exists dolor;

alter table atencion.signos_vitales
  add column if not exists dolor smallint check (dolor between 0 and 10),
  add column if not exists glucemia_mg_dl int check (glucemia_mg_dl between 20 and 800),
  add column if not exists nota text check (char_length(nota) <= 500);

create index if not exists signos_vitales_paciente_tomado_idx on atencion.signos_vitales (paciente_id, tomado_en desc);
