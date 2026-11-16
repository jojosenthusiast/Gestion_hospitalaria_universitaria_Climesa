-- Fase 2, flujo D (T08, S11): avisos en su propia área, nivel de criticidad, audiencia por área y "Enterado".
--
-- 1. `publico.aviso.nivel`: informativo, importante o critico. Solo un aviso `critico` dirigido al rol o al área de
--    la cuenta se destaca en el inicio con un aviso persistente hasta que la persona marca "Enterado". Es distinto de
--    `prioridad` (D-071), que sigue siendo la escalera visual de la pantalla pública y de las apps ya publicadas.
-- 2. `publico.aviso.areas`: códigos de espacio (`infra.espacio.codigo`, tipo área o bahía, por ejemplo `P1-EMG`) a cuyo
--    personal va dirigido el aviso. El área de una cuenta es el área de su persona de personal y la de su turno en
--    curso. La API valida que cada código exista.
-- 3. `publico.aviso_enterado`: una fila por aviso y cuenta. `enterado_en` es el acuse de la persona (una sola vez,
--    idempotente); `recordar_en` es hasta cuándo pospuso el recordatorio ("Recordarme después").
-- 4. Política `avisos.recordatorio_horas` (4 horas): tras posponer, un aviso crítico sin "Enterado" vuelve a
--    destacarse. La cambia el dueño cerrando la vigencia de la fila actual e insertando otra (plataforma.politica).
--
-- Datos reales que cambia:
--   * Toda fila existente de publico.aviso queda con nivel = 'informativo' y areas = '{}' (ningún aviso ya publicado
--     pasa a destacarse en el inicio; su prioridad, audiencia y vigencia no cambian).
--   * La restricción aviso_audiencia_valida se reemplaza por una que además acepta un aviso dirigido solo a áreas;
--     toda fila existente la cumple (antes ya exigía público o algún rol).
--   * Se inserta una fila en plataforma.politica: avisos.recordatorio_horas = {"horas": 4}.
--   * Se crea la tabla vacía publico.aviso_enterado con RLS y su política para sghu_api.
-- Pre-comprobación en producción:
--   select count(*), count(*) filter (where prioridad = 'critico') from publico.aviso;  -- filas que quedan informativas
--   select to_regclass('publico.aviso_enterado');                                     -- debe ser null
--   select count(*) from plataforma.politica where clave = 'avisos.recordatorio_horas'; -- debe ser 0
--
-- Reversa:
--   drop table if exists publico.aviso_enterado;
--   delete from plataforma.politica where clave = 'avisos.recordatorio_horas';
--   alter table publico.aviso drop constraint if exists aviso_nivel_valido;
--   -- Antes de restaurar la restricción anterior, un aviso dirigido solo a áreas no la cumple: hazlo público o retíralo.
--   update publico.aviso set publico = true where not publico and cardinality(roles) = 0;
--   alter table publico.aviso drop constraint if exists aviso_audiencia_valida;
--   alter table publico.aviso add constraint aviso_audiencia_valida check (prioridad in ('atencion', 'urgente', 'critico')
--     and roles <@ array['ADM','JOP','REC','AST','ENF','MED','LAB','PAR','DPD','PAC']::text[] and (publico or cardinality(roles) > 0));
--   alter table publico.aviso drop column if exists areas, drop column if exists nivel;

alter table publico.aviso
  add column if not exists nivel text not null default 'informativo',
  add column if not exists areas text[] not null default '{}';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'aviso_nivel_valido') then
    alter table publico.aviso add constraint aviso_nivel_valido check (nivel in ('informativo', 'importante', 'critico'));
  end if;
end $$;

alter table publico.aviso drop constraint if exists aviso_audiencia_valida;
alter table publico.aviso add constraint aviso_audiencia_valida check (
  prioridad in ('atencion', 'urgente', 'critico')
  and roles <@ array['ADM','JOP','REC','AST','ENF','MED','LAB','PAR','DPD','PAC']::text[]
  and (publico or cardinality(roles) > 0 or cardinality(areas) > 0)
);

comment on column publico.aviso.nivel is 'Criticidad para el personal (Fase 2, S11): informativo, importante o critico. Solo critico se destaca en el inicio.';
comment on column publico.aviso.areas is 'Códigos de infra.espacio (área o bahía) a cuyo personal va dirigido; vacío si no se dirige por área.';

create table if not exists publico.aviso_enterado (
  aviso_id uuid not null references publico.aviso(id),
  usuario_id uuid not null references acceso.usuario(id),
  enterado_en timestamptz,
  recordar_en timestamptz,
  actualizado_en timestamptz not null default now(),
  primary key (aviso_id, usuario_id),
  check (enterado_en is not null or recordar_en is not null)
);
create index if not exists aviso_enterado_usuario on publico.aviso_enterado (usuario_id);
comment on table publico.aviso_enterado is 'Acuse "Enterado" y recordatorio pospuesto de cada cuenta sobre un aviso (Fase 2, S11).';

grant select, insert, update on publico.aviso_enterado to sghu_api;
alter table publico.aviso_enterado enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'publico' and tablename = 'aviso_enterado' and policyname = 'api_sghu') then
    create policy api_sghu on publico.aviso_enterado for all to sghu_api using (true) with check (true);
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on publico.aviso_enterado from anon, authenticated;
  end if;
end $$;

insert into plataforma.politica (clave, valor, vigencia, fuente, aprobado_por)
select 'avisos.recordatorio_horas', '{"horas":4}', tstzrange('2026-10-01', null), 'Fase 2, S11', 'equipo SGHU'
where not exists (select 1 from plataforma.politica where clave = 'avisos.recordatorio_horas');
