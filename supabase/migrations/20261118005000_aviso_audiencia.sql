-- Ronda 2, observación 14: a quién va dirigido cada aviso y con qué prioridad.
--
-- Antes todo aviso era público. Ahora un aviso puede ser público (pantalla pública y apps sin sesión) y/o
-- dirigido a roles del personal (tablero de inicio de web y Android). Un aviso solo para roles no sale en
-- la pantalla pública (minimización, FR-112-05).
--
-- Pre-comprobación en producción (no cambia filas existentes; todo aviso previo queda público con prioridad "atencion"):
--   select count(*) from publico.aviso;
--
-- Reversa:
--   alter table publico.aviso drop constraint if exists aviso_audiencia_valida;
--   alter table publico.aviso drop column if exists roles, drop column if exists publico, drop column if exists prioridad;

alter table publico.aviso
  add column if not exists prioridad text not null default 'atencion',
  add column if not exists publico boolean not null default true,
  add column if not exists roles text[] not null default '{}';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'aviso_audiencia_valida') then
    alter table publico.aviso add constraint aviso_audiencia_valida check (
      prioridad in ('atencion', 'urgente', 'critico')
      and roles <@ array['ADM','JOP','REC','AST','ENF','MED','LAB','PAR','DPD','PAC']::text[]
      and (publico or cardinality(roles) > 0)
    );
  end if;
end $$;

comment on column publico.aviso.prioridad is 'Escalera de avisos de la spec 114 (D-071): atencion, urgente, critico.';
comment on column publico.aviso.publico is 'true: visible en la pantalla pública y en las apps sin sesión.';
comment on column publico.aviso.roles is 'Códigos de rol que ven el aviso en su tablero de inicio; vacío si solo es público.';
