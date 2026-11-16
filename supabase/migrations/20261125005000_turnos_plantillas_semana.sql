-- Fase 2, flujo F (T09, S12): plantillas de semana por área para planificar turnos.
--
-- Jefatura de Operaciones guarda la semana de un área como plantilla (quién trabaja qué día y a qué hora) y la aplica
-- a otra semana. Aplicarla no escribe turnos aquí: la Web arma los turnos de la semana elegida y los crea como borrador
-- con `POST /api/v1/turnos/lote`, que pasa por las mismas validaciones de un turno suelto (descanso, tope de 7 días,
-- traslape, inscripción). Los borradores ya existían en `personal.turno` (estado `borrador`, 20261017000500 y
-- 20261120003000); esta migración no toca esa tabla.
--
-- Cada elemento de `turnos` es {"dia": 0-6 (0 = lunes), "inicio": "HH:MM" (hora local), "horas": 4-24,
-- "tipo": "diurno" | "nocturno" | "guardia", "staffId": uuid}. La API valida la forma al guardar.
--
-- Datos reales que cambia: ninguno. Crea una tabla vacía, su índice y su política de acceso para `sghu_api`.
-- Pre-comprobación en producción (debe devolver una fila con `null`: la tabla todavía no existe):
--   select to_regclass('personal.plantilla_semana');
--
-- Reversa: drop table personal.plantilla_semana;

create table if not exists personal.plantilla_semana (
  id uuid primary key default gen_random_uuid(),
  area_id uuid not null references infra.espacio(id),
  nombre text not null check (length(btrim(nombre)) between 3 and 80),
  turnos jsonb not null check (jsonb_typeof(turnos) = 'array' and jsonb_array_length(turnos) between 1 and 400),
  activa boolean not null default true,
  creado_por uuid not null,
  creado_en timestamptz not null default now(),
  version int not null default 1
);
-- Un nombre por área entre las plantillas vigentes; una retirada libera el nombre.
create unique index if not exists plantilla_semana_nombre on personal.plantilla_semana (area_id, lower(btrim(nombre))) where activa;

grant select, insert, update on personal.plantilla_semana to sghu_api;
alter table personal.plantilla_semana enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'personal' and tablename = 'plantilla_semana' and policyname = 'api_sghu') then
    create policy api_sghu on personal.plantilla_semana for all to sghu_api using (true) with check (true);
  end if;
end $$;
