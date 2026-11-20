-- Turno de noche de prueba: una segunda cuenta de prueba por rol de trabajo (REC, ENF, MED, LAB, PAR) que trabaja de
-- 22:00 a 06:00 todos los días. Las cuentas de prueba de día (06:00 a 22:00) y estas cubren las 24 h, así el dueño
-- puede probar cualquier flujo (por ejemplo ambulancia, despacho, admisión y hospitalización) a cualquier hora sin
-- romper el descanso de 8 h (RN-13).
--
-- Idempotente; todo queda con el prefijo de la demo (de300000-...), así `demo.cjs limpiar` lo borra. Tras una recarga
-- de la demo, se vuelve a ejecutar:
--   psql "$DEMO_DATABASE_URL" -1 -v ON_ERROR_STOP=1 -f tools/demo/turno-noche.sql
--
-- Cuentas: prueba.noche.rec@climesa.com, prueba.noche.enf@climesa.com, prueba.noche.med@climesa.com,
-- prueba.noche.lab@climesa.com y prueba.noche.par@climesa.com. Entran con la misma contraseña que la cuenta de prueba
-- de día de su rol (prueba.rec@climesa.com, ...). Este archivo no lleva contraseñas.

create temp table noche (rol text primary key, idx int, nombres text, apellidos text, tipo text, especialidad text, area text)
  on commit drop;
insert into noche values
  ('REC', 961, 'Marta Lidia',     'Orellana Cruz',   'recepcionista', null,               'P1-REC'),
  ('ENF', 962, 'Jonathan Isaac',  'Melara Ventura',  'enfermero',     null,               'P2-HOS'),
  ('MED', 963, 'Patricia Elena',  'Durán Escobar',   'medico',        'Medicina general', 'P1-EMG'),
  ('LAB', 964, 'Óscar Armando',   'Pineda Rauda',    'laboratorista', null,               'P1-LAB'),
  ('PAR', 965, 'Roxana Guadalupe','Ayala Menjívar',  'paramedico',    null,               'P1-AMB');

create temp table actor on commit drop as
select coalesce(
  (select u.id from acceso.usuario u join acceso.asignacion_rol a on a.usuario_id = u.id
    where a.rol_codigo = 'JOP' and u.estado = 'activo' order by (u.correo ilike 'prueba.%') desc, u.creado_en limit 1),
  (select u.id from acceso.usuario u join acceso.asignacion_rol a on a.usuario_id = u.id
    where a.rol_codigo = 'ADM' and u.estado = 'activo' order by u.creado_en limit 1)) as id;

insert into personal.persona (id, nombres, apellidos, tipo, especialidad, area_id, telefono, dui, activo)
select ('de300000-0002-4000-8000-' || lpad(n.idx::text, 12, '0'))::uuid, n.nombres, n.apellidos, n.tipo, n.especialidad,
       (select id from infra.espacio where codigo = n.area), '7100' || lpad(n.idx::text, 4, '0'),
       c.cuerpo || ((10 - (select sum(substr(c.cuerpo, i, 1)::int * (10 - i)) from generate_series(1, 8) i)) % 10)::text, true
from noche n cross join lateral (select '8000' || lpad(n.idx::text, 4, '0') as cuerpo) c
on conflict do nothing;

insert into personal.inscripcion (id, persona_id, junta, numero, vigencia)
select ('de300000-0031-4000-8000-' || lpad(n.idx::text, 12, '0'))::uuid, ('de300000-0002-4000-8000-' || lpad(n.idx::text, 12, '0'))::uuid,
       case n.tipo when 'medico' then 'JVPM' else 'JVPE' end, 'DEMO-NOCHE-' || n.idx, daterange(date '2026-01-01', date '2028-12-31')
from noche n where n.tipo in ('medico', 'enfermero')
on conflict do nothing;

-- Cuentas de acceso de noche: se crean como copia de la cuenta de prueba de día del mismo rol (misma contraseña, que
-- este archivo nunca ve ni escribe). El correo cumple la regla de cuenta de prueba (prueba.*@climesa.com), así
-- `demo.cjs limpiar` borra lo que hagan como con las demás cuentas de prueba, y `invitado` evita el rol PAC automático.
do $$
declare
  r record; src uuid; nuevo uuid; correo text; cols text;
begin
  for r in select * from noche loop
    correo := 'prueba.noche.' || lower(r.rol) || '@climesa.com';
    continue when exists (select 1 from auth.users where lower(email) = correo);
    select u.id into src from acceso.usuario u join acceso.asignacion_rol a on a.usuario_id = u.id
     where a.rol_codigo = r.rol and u.estado = 'activo' and u.correo ilike 'prueba.%@climesa.com' and u.correo not ilike 'prueba.noche.%'
     order by (lower(u.correo) = 'prueba.' || lower(r.rol) || '@climesa.com') desc, u.creado_en limit 1;
    if src is null then raise notice 'Sin cuenta de prueba de día para %; no se crea %', r.rol, correo; continue; end if;
    nuevo := gen_random_uuid();

    select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into cols
      from information_schema.columns where table_schema = 'auth' and table_name = 'users' and is_generated = 'NEVER';
    execute format('insert into auth.users (%1$s) select %1$s from jsonb_populate_record(null::auth.users, (select to_jsonb(s) || $1 from auth.users s where s.id = $2))', cols)
      using jsonb_build_object('id', nuevo, 'email', correo, 'phone', null, 'confirmation_token', '', 'recovery_token', '', 'email_change_token_new', '',
              'email_change_token_current', '', 'email_change', '', 'phone_change_token', '', 'phone_change', '', 'reauthentication_token', '',
              'confirmation_sent_at', null, 'recovery_sent_at', null, 'email_change_sent_at', null, 'reauthentication_sent_at', null, 'created_at', now(), 'updated_at', now(), 'last_sign_in_at', null,
              'raw_user_meta_data', jsonb_build_object('nombre', '[DEMO] ' || r.nombres || ' ' || r.apellidos),
              'raw_app_meta_data', (select coalesce(raw_app_meta_data, '{}'::jsonb) from auth.users where id = src) || '{"invitado": "true"}'::jsonb), src;

    select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into cols
      from information_schema.columns where table_schema = 'auth' and table_name = 'identities' and is_generated = 'NEVER';
    execute format('insert into auth.identities (%1$s) select %1$s from jsonb_populate_record(null::auth.identities, (select to_jsonb(i) || $1 from auth.identities i where i.user_id = $2 and i.provider = ''email'' limit 1))', cols)
      using jsonb_build_object('id', gen_random_uuid(), 'user_id', nuevo, 'provider_id', nuevo::text, 'created_at', now(), 'updated_at', now(), 'last_sign_in_at', null,
              'identity_data', jsonb_build_object('sub', nuevo::text, 'email', correo, 'email_verified', true, 'phone_verified', false)), src;

    update acceso.usuario set nombre_mostrar = '[DEMO] ' || r.nombres || ' ' || r.apellidos where id = nuevo;
  end loop;
end $$;

-- Cuentas de noche: persona y rol.
update acceso.usuario u set persona_personal_id = ('de300000-0002-4000-8000-' || lpad(n.idx::text, 12, '0'))::uuid
from noche n
where lower(u.correo) = 'prueba.noche.' || lower(n.rol) || '@climesa.com' and u.persona_personal_id is null;

insert into acceso.asignacion_rol (usuario_id, rol_codigo, asignado_por)
select u.id, n.rol, (select id from actor)
from noche n join acceso.usuario u on lower(u.correo) = 'prueba.noche.' || lower(n.rol) || '@climesa.com'
on conflict do nothing;

-- Turnos: el de esta noche desde ahora (si ya pasó las 22:00 y no son las 06:00) y luego 22:00 a 06:00 por 14 noches.
with dias as (
  select d, ((now() at time zone 'America/El_Salvador')::date + d) as fecha from generate_series(-1, 13) d
), periodos as (
  select n.idx, n.area, d.d,
         greatest(((d.fecha::timestamp + interval '22 hours') at time zone 'America/El_Salvador'), case when d.d = -1 then now() - interval '1 minute' else '-infinity'::timestamptz end) as ini,
         ((d.fecha::timestamp + interval '30 hours') at time zone 'America/El_Salvador') as fin
  from noche n cross join dias d
)
insert into personal.turno (id, persona_id, area_id, periodo, tipo, estado, justificacion, publicado_por, publicado_en, creado_por, excepcion_carga)
select ('de300000-0003-4000-8000-' || lpad((p.idx * 100 + p.d + 2)::text, 12, '0'))::uuid,
       ('de300000-0002-4000-8000-' || lpad(p.idx::text, 12, '0'))::uuid, (select id from infra.espacio where codigo = p.area),
       tstzrange(p.ini, p.fin, '[)'), 'nocturno',
       case when p.ini <= now() then 'en_curso' else 'publicado' end,
       '[DEMO] Cuenta de prueba de noche: 22:00 a 06:00 para probar a cualquier hora',
       (select id from actor), now(), (select id from actor),
       '[DEMO] Cuenta de prueba de noche: cobertura diaria documentada como excepción a los días consecutivos'
from periodos p
where p.fin > now() and p.ini < p.fin
on conflict do nothing;

select n.rol, p.nombres || ' ' || p.apellidos as persona,
       (select u.correo is not null from acceso.usuario u where u.persona_personal_id = p.id limit 1) as con_cuenta,
       (select count(*) from personal.turno t where t.persona_id = p.id and upper(t.periodo) > now()) as turnos,
       (select lower(t.periodo) <= now() from personal.turno t where t.persona_id = p.id and t.periodo @> now()) as de_turno_ahora
from noche n join personal.persona p on p.id = ('de300000-0002-4000-8000-' || lpad(n.idx::text, 12, '0'))::uuid
order by n.idx;
