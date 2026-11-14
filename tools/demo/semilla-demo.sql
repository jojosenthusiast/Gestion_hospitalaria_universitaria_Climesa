-- ============================================================================================================
-- CLIMESA · Datos de demostración (ficticios, anotados y removibles)                         tools/demo/
--
-- NO es una migración: no vive en supabase/migrations y no cambia el esquema. Se ejecuta a mano, una vez por
-- entorno de curso, con el rol dueño de las tablas (postgres en Supabase), NUNCA con sghu_api ni en producción
-- real. Todos los datos son inventados (AGENTS.md regla 2). Lo que cada registro muestra está en README.md.
--
-- Garantías:
--   * Idempotente: se puede ejecutar varias veces; lo que ya existe no se duplica ni se pisa.
--   * Una sola transacción: si algo falla, no queda nada a medias.
--   * Respeta las restricciones y disparadores de supabase/migrations (traslapes de citas, un número activo por
--     paciente, consulta firmada, cama/aislamiento, ambulancia única, turnos de 4 a 24 h, etc.).
--   * No crea ni modifica usuarios de Supabase Auth. Las cuentas de prueba (prueba.<rol>@example.test) se
--     buscan en acceso.usuario al ejecutar; si una no tiene persona de personal se le crea una demo y se vincula
--     (solo si no tenía). No se toca ninguna contraseña.
--
-- Cómo se reconoce lo sembrado (marca de borrado):
--   * Todos los ids empiezan con  de300000-  (UUID fijo).
--   * Pacientes: expediente 99000nn-d (rango 9900001 a 9900199) y DUI 9000nnnn-d (los menores no llevan DUI).
--   * Texto libre: empieza con "[DEMO]" donde la columna existe.
--   * Lo que no tiene id propio (ambulancia.cambio_estado) lleva "[DEMO]" en el motivo.
-- Para quitar todo: tools/demo/limpiar-demo.sql
-- Para refrescar fechas (turnos, citas y fila se siembran respecto de hoy): limpiar y volver a sembrar.
-- ============================================================================================================

begin;

-- ---------------------------------------------------------------------------------------------------------
-- 0. Ayudas temporales (desaparecen al terminar la sesión)
-- ---------------------------------------------------------------------------------------------------------
create or replace function pg_temp.did(t text, n int) returns uuid language sql immutable as
$$ select ('de300000-' || t || '-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;

-- Dígito verificador del DUI: (10 - suma(d_i * (9 - i)) % 10) % 10, con i = 0..7.
create or replace function pg_temp.dui(cuerpo text) returns text language sql immutable as
$$ select cuerpo || ((10 - sum(substr(cuerpo, i, 1)::int * (10 - i)) % 10) % 10)::text from generate_series(1, 8) i $$;

-- Número de expediente con el dígito de la API (recordNumber en api/src/patients/patient.rules.ts).
create or replace function pg_temp.expediente(seq int) returns text language plpgsql immutable as $$
declare
  cuerpo text := lpad(seq::text, 7, '0');
  n int := 0;
  c int;
begin
  for i in 1..7 loop n := ((n + substr(cuerpo, i, 1)::int) * 2) % 11; end loop;
  c := (12 - n % 11) % 11;
  return cuerpo || '-' || case when c = 10 then 'X' else c::text end;
end $$;

create or replace function pg_temp.norm(s text) returns text language sql stable as
$$ select trim(regexp_replace(translate(lower(coalesce(s, '')), 'áéíóúüñàèìòù', 'aeiouunaeiou'), '[^a-z0-9]+', ' ', 'g')) $$;

-- Misma fonética que phonetic() de la API.
create or replace function pg_temp.fon(s text) returns text language sql stable as
$$ select regexp_replace(regexp_replace(replace(replace(replace(replace(replace(replace(pg_temp.norm(s),
   'qu', 'k'), 'll', 'y'), 'ch', 'x'), 'h', ''), 'v', 'b'), 'z', 's'), 'c(?=[ei])', 's', 'g'), 'c', 'k', 'g') $$;

create or replace function pg_temp.hoy() returns date language sql stable as
$$ select (now() at time zone 'America/El_Salvador')::date $$;

-- Hora local (decimal: 8.5 = 08:30) de un día local, como instante.
create or replace function pg_temp.ts(d date, h numeric) returns timestamptz language sql stable as
$$ select (d::timestamp + h * interval '1 hour') at time zone 'America/El_Salvador' $$;

-- Hora local de reloj (time) de un día local.
create or replace function pg_temp.tl(d date, t time) returns timestamptz language sql stable as
$$ select (d + t) at time zone 'America/El_Salvador' $$;

create or replace function pg_temp.espacio(cod text) returns uuid language sql stable as
$$ select id from infra.espacio where codigo = cod $$;

-- Instante en que terminó el origen de un ingreso (consulta, cita, número de emergencia o servicio de ambulancia): el ingreso nunca es anterior.
create or replace function pg_temp.origen_ts(o text, id uuid) returns timestamptz language sql stable as $$
  select case o
    when 'consulta' then (select coalesce(firmada_en, iniciada_en) from atencion.consulta where atencion.consulta.id = $2)
    when 'cita' then (select upper(horario) from atencion.cita where atencion.cita.id = $2)
    when 'emergencia' then (select emitido_en from atencion.ticket_fila where atencion.ticket_fila.id = $2)
    when 'ambulancia' then (select finalizado_en from ambulancia.servicio where ambulancia.servicio.id = $2) end $$;

-- ---------------------------------------------------------------------------------------------------------
-- 1. Cuentas de prueba existentes -> personal (sin tocar Supabase Auth)
-- ---------------------------------------------------------------------------------------------------------
create temp table cuentas (rol text primary key, usuario_id uuid, persona_id uuid) on commit drop;

insert into cuentas (rol, usuario_id, persona_id)
select r.rol, u.id, u.persona_personal_id
from (values ('ADM'), ('JOP'), ('DPD'), ('REC'), ('AST'), ('ENF'), ('MED'), ('LAB'), ('PAR'), ('PAC')) r(rol)
left join lateral (
  select x.id, x.persona_personal_id
  from acceso.usuario x
  join acceso.asignacion_rol a on a.usuario_id = x.id and a.rol_codigo = r.rol
  where x.estado = 'activo' and x.id::text not like 'de300000-%'
    and lower(x.correo) ~ ('(^|[._-])' || lower(r.rol) || '@example\.test$')
  order by x.creado_en limit 1) u on true;

-- Persona de personal para los roles de trabajo cuya cuenta aún no tiene una (o si no hay cuenta, una suelta).
create temp table persona_cuenta (rol text primary key, idx int, nombres text, apellidos text, tipo text, especialidad text, area text)
  on commit drop;
insert into persona_cuenta values
  ('REC', 20, 'Karina Beatriz',      'Alfaro Quijada',    'recepcionista', null,               'P1-REC'),
  ('AST', 21, 'Josefina del Carmen', 'Mena Alvarado',     'asistente',     null,               'P1-CON'),
  ('ENF', 22, 'Daniel Alejandro',    'Rivas Cañas',       'enfermero',     null,               'P2-HOS'),
  ('MED', 23, 'Carlos Alfredo',      'Henríquez Soto',    'medico',        'Medicina general', 'P1-CON'),
  ('LAB', 24, 'Silvia Margarita',    'Navarrete Ortiz',   'laboratorista', null,               'P1-LAB'),
  ('PAR', 25, 'Edwin Ricardo',       'Tobar Lemus',       'paramedico',    null,               'P1-AMB');

insert into personal.persona (id, nombres, apellidos, tipo, especialidad, area_id, telefono, dui)
select pg_temp.did('0002', p.idx), p.nombres, p.apellidos, p.tipo, p.especialidad, pg_temp.espacio(p.area),
       '7100' || lpad(p.idx::text, 4, '0'), pg_temp.dui('8000' || lpad(p.idx::text, 4, '0'))
from persona_cuenta p join cuentas c on c.rol = p.rol
where c.persona_id is null
on conflict do nothing;

update cuentas c set persona_id = pg_temp.did('0002', p.idx)
from persona_cuenta p where p.rol = c.rol and c.persona_id is null;

-- Vincular la cuenta existente a la persona demo solo si no tenía ninguna.
update acceso.usuario u set persona_personal_id = c.persona_id
from cuentas c
where u.id = c.usuario_id and u.persona_personal_id is null and c.persona_id::text like 'de300000-%';

create or replace function pg_temp.actor(r text) returns uuid language sql stable as
$$ select coalesce((select usuario_id from pg_temp.cuentas where rol = r),
   pg_temp.did('0099', array_position(array['ADM', 'JOP', 'DPD', 'REC', 'AST', 'ENF', 'MED', 'LAB', 'PAR', 'PAC'], r))) $$;
create or replace function pg_temp.persona(r text) returns uuid language sql stable as
$$ select persona_id from pg_temp.cuentas where rol = r $$;

-- ---------------------------------------------------------------------------------------------------------
-- 2. Edificio: Planta 4 con camas en todos los estados (las plantas 1 a 3 vienen de seed.sql)
--    Las camas demo son las únicas que se ocupan, así nunca chocan con ocupaciones reales.
-- ---------------------------------------------------------------------------------------------------------
insert into infra.espacio (id, padre_id, tipo, codigo, nombre, nivel) values
  (pg_temp.did('0020', 1), pg_temp.espacio('HOSP'), 'planta', 'P4', 'Planta 4', 4)
on conflict do nothing;
insert into infra.espacio (id, padre_id, tipo, codigo, nombre, nivel) values
  (pg_temp.did('0020', 2), pg_temp.espacio('P4'), 'area', 'P4-HOS', 'Hospitalización ala norte', 4)
on conflict do nothing;
insert into infra.espacio (id, padre_id, tipo, codigo, nombre, nivel) values
  (pg_temp.did('0020', 3), pg_temp.espacio('P1'), 'bodega', 'BOD-URG', 'Bodega de urgencias', 1),
  (pg_temp.did('0020', 4), pg_temp.espacio('P1'), 'bodega', 'BOD-FAR', 'Farmacia hospitalaria', 1)
on conflict do nothing;

insert into infra.espacio (id, padre_id, tipo, codigo, nombre, categoria, capacidad, nivel)
select pg_temp.did('0020', 10 + h.n), pg_temp.espacio('P4-HOS'), 'habitacion', h.cod, h.cod, h.cat, h.cap, 4
from (values (1, 'HAB-401', 'semiprivada', 2), (2, 'HAB-402', 'semiprivada', 2), (3, 'HAB-403', 'semiprivada', 2),
             (4, 'HAB-404', 'semiprivada', 2), (5, 'VIP-401', 'vip', 1), (6, 'VIP-402', 'vip', 1),
             (7, 'HAB-405', 'semiprivada', 2), (8, 'HAB-406', 'semiprivada', 2), (9, 'HAB-407', 'semiprivada', 2),
             (10, 'HAB-408', 'semiprivada', 2), (11, 'HAB-409', 'semiprivada', 2), (12, 'HAB-410', 'semiprivada', 2),
             (13, 'VIP-403', 'vip', 1), (14, 'VIP-404', 'vip', 1), (15, 'VIP-405', 'vip', 1)) h(n, cod, cat, cap)
on conflict do nothing;

insert into infra.espacio (id, padre_id, tipo, codigo, nombre, nivel)
select pg_temp.did('0020', 100 + (h.n - 1) * 2 + l.o), pg_temp.did('0020', 10 + h.n), 'cama', h.cod || '-' || l.letra, 'Cama ' || l.letra, 4
from (values (1, 'HAB-401', 2), (2, 'HAB-402', 2), (3, 'HAB-403', 2), (4, 'HAB-404', 2), (5, 'VIP-401', 1), (6, 'VIP-402', 1),
             (7, 'HAB-405', 2), (8, 'HAB-406', 2), (9, 'HAB-407', 2), (10, 'HAB-408', 2), (11, 'HAB-409', 2), (12, 'HAB-410', 2),
             (13, 'VIP-403', 1), (14, 'VIP-404', 1), (15, 'VIP-405', 1)) h(n, cod, cap)
join (values (1, 'A'), (2, 'B')) l(o, letra) on l.o <= h.cap
on conflict do nothing;

insert into infra.equipo (id, tipo, serie, espacio_id, estado) values
  (pg_temp.did('0021', 1), 'monitor',  'DEMO-MON-401', pg_temp.did('0020', 11), 'operativo'),
  (pg_temp.did('0021', 2), 'bomba',    'DEMO-BOM-402', pg_temp.did('0020', 12), 'mantenimiento'),
  (pg_temp.did('0021', 3), 'oxigeno',  'DEMO-OXI-404', pg_temp.did('0020', 14), 'baja'),
  (pg_temp.did('0021', 4), 'monitor',  'DEMO-MON-VIP', pg_temp.did('0020', 15), 'operativo')
on conflict do nothing;

-- ---------------------------------------------------------------------------------------------------------
-- 3. Personal demo, inscripciones y turnos de los próximos 14 días
-- ---------------------------------------------------------------------------------------------------------
insert into personal.persona (id, nombres, apellidos, tipo, especialidad, area_id, telefono, dui, activo)
select pg_temp.did('0002', v.idx), v.nombres, v.apellidos, v.tipo, v.especialidad, pg_temp.espacio(v.area),
       '7100' || lpad(v.idx::text, 4, '0'), pg_temp.dui('8000' || lpad(v.idx::text, 4, '0')), true
from (values
  (1,  'Wilfredo Antonio',     'Chávez Portillo',    'medico',        'Medicina general',           'P1-CON'),
  (2,  'Gabriela Michelle',    'Zelaya Funes',       'medico',        'Pediatría',                  'P1-CON'),
  (3,  'Rodrigo Ernesto',      'Peña Barahona',      'medico',        'Emergencias',                'P1-EMG'),
  (4,  'Verónica del Carmen',  'Salazar Magaña',     'medico',        'Cardiología',                'P1-CON'),
  (5,  'Héctor Mauricio',      'Villalta Cruz',      'medico',        'Ginecología y obstetricia',  'P1-CON'),
  (6,  'Yesenia Carolina',     'Mendoza Argueta',    'enfermero',     null,                         'P2-HOS'),
  (7,  'Mario Alexis',         'Bonilla Reyes',      'enfermero',     null,                         'P1-EMG'),
  (8,  'Karen Stefany',        'Orellana Pacheco',   'enfermero',     null,                         'P3-VIP'),
  (9,  'Delmy Elizabeth',      'Guardado Rauda',     'asistente',     null,                         'P1-CON'),
  (10, 'Ernesto Josué',        'Lazo Cañas',         'recepcionista', null,                         'P1-REC'),
  (11, 'Cecilia Noemí',        'Rosales Aguirre',    'laboratorista', null,                         'P1-LAB'),
  (12, 'Alfredo José',         'Menjívar Coto',      'paramedico',    null,                         'P1-AMB'),
  (13, 'Nelson Orlando',       'Escobar Hércules',   'motorista',     null,                         'P1-AMB'),
  (14, 'Blanca Estela',        'Cortez Palacios',    'limpieza',      null,                         'P2-HOS'),
  (15, 'Mirna Yamileth',       'Sandoval Reyes',     'administrativo',null,                         'P1-REC'),
  (16, 'Nahún Gerardo',        'Argueta Linares',    'medico',        'Emergencias',                'P1-EMG'),
  (17, 'Rina Marisol',         'Castañeda Iraheta',  'enfermero',     null,                         'P1-EMG'),
  (30, 'Lissette Marina',      'Cruz Alvarado',      'medico',        'Medicina general',           'P1-CON'),
  (31, 'Ricardo Ernesto',      'Aparicio Landaverde','medico',        'Medicina interna',           'P2-HOS'),
  (32, 'Johana Beatriz',       'Hernández Ventura',  'enfermero',     null,                         'P2-HOS'),
  (33, 'Wilmer Ovidio',        'Sorto Benítez',      'enfermero',     null,                         'P2-HOS'),
  (34, 'Cindy Mariela',        'Rauda Serrano',      'enfermero',     null,                         'P3-VIP'),
  (35, 'Óscar Armando',        'Linares Pineda',     'enfermero',     null,                         'P3-VIP'),
  (36, 'Ingrid Carolina',      'Meléndez Arévalo',   'enfermero',     null,                         'P4-HOS'),
  (37, 'Jaime Alberto',        'Guevara Cáceres',    'enfermero',     null,                         'P4-HOS'),
  (38, 'Luz Marina',           'Barrientos Amaya',   'enfermero',     null,                         'P4-HOS'),
  (39, 'Ever Antonio',         'Recinos Magaña',     'enfermero',     null,                         'P4-HOS'),
  (40, 'Marlon Josué',         'Iraheta Villalobos', 'laboratorista', null,                         'P1-LAB'),
  (41, 'Evelyn Margarita',     'Palacios Mancía',    'paramedico',    null,                         'P1-AMB'),
  (42, 'Josué Daniel',         'Amaya Orellana',     'paramedico',    null,                         'P1-AMB'),
  (43, 'Santos Ismael',        'Henríquez Cortez',   'motorista',     null,                         'P1-AMB'),
  (44, 'Rosa Delmy',           'Ayala Escobar',      'limpieza',      null,                         'P3-VIP'),
  (45, 'Jeovany Alexander',    'Argueta Rosales',    'limpieza',      null,                         'P4-HOS'),
  (46, 'Dina Marisela',        'Flores Aguirre',     'asistente',     null,                         'BOD-CEN'),
  (47, 'Gustavo Adolfo',       'Reyes Chávez',       'recepcionista', null,                         'P1-REC')
) v(idx, nombres, apellidos, tipo, especialidad, area)
on conflict do nothing;

-- Inscripción profesional vigente (D-012) para todo el personal médico y de enfermería, sembrado o de cuenta.
insert into personal.inscripcion (id, persona_id, junta, numero, vigencia)
select pg_temp.did('0030', row_number() over (order by p.id)::int), p.id,
       case p.tipo when 'medico' then 'JVPM' else 'JVPE' end,
       'DEMO-' || substr(p.id::text, 25, 12), daterange(date '2026-01-01', date '2028-12-31')
from personal.persona p
where p.tipo in ('medico', 'enfermero')
  and (p.id::text like 'de300000-%' or p.id in (select persona_id from cuentas where persona_id is not null))
  and not personal.inscrito(p.id, pg_temp.hoy())
on conflict do nothing;

-- Plan de turnos: patrón por persona. D7 todos los días 07-14, D5 lunes a viernes 07-14, T5 lunes a viernes 13-20,
-- T7 todos los días 13-20, N2 nocturno 19-07 en días pares y N2B en días impares (dos personas cubren todas las noches),
-- G4 guardia de 24 h cada cuatro días, A2 diurno en días alternos.
create temp table plan_turno (idx int primary key, persona uuid, area text, patron text) on commit drop;
insert into plan_turno values
  (1,  pg_temp.persona('MED'),  'P1-CON', 'D7'),
  (2,  pg_temp.did('0002', 1),  'P1-CON', 'D7'),
  (3,  pg_temp.did('0002', 2),  'P1-CON', 'T5'),
  (4,  pg_temp.did('0002', 5),  'P1-CON', 'A2'),
  (5,  pg_temp.did('0002', 3),  'P1-EMG', 'G4'),
  (6,  pg_temp.did('0002', 16), 'P1-EMG', 'N2'),
  (7,  pg_temp.did('0002', 7),  'P1-EMG', 'D5'),
  (8,  pg_temp.did('0002', 17), 'P1-EMG', 'N2'),
  (9,  pg_temp.persona('ENF'),  'P2-HOS', 'D7'),
  (10, pg_temp.did('0002', 6),  'P2-HOS', 'T7'),
  (11, pg_temp.did('0002', 8),  'P3-VIP', 'D7'),
  (12, pg_temp.persona('AST'),  'P1-CON', 'D5'),
  (13, pg_temp.did('0002', 9),  'P1-CON', 'T5'),
  (14, pg_temp.persona('REC'),  'P1-REC', 'D5'),
  (15, pg_temp.did('0002', 10), 'P1-REC', 'T5'),
  (16, pg_temp.persona('LAB'),  'P1-LAB', 'D5'),
  (17, pg_temp.did('0002', 11), 'P1-LAB', 'T7'),
  (18, pg_temp.persona('PAR'),  'P1-AMB', 'D7'),
  (19, pg_temp.did('0002', 12), 'P1-AMB', 'T5'),
  (20, pg_temp.did('0002', 13), 'P1-AMB', 'D5'),
  (21, pg_temp.did('0002', 14), 'P2-HOS', 'D5'),
  (22, pg_temp.did('0002', 15), 'P1-REC', 'D5'),
  -- Medicina general adicional, hospitalización por planta con noches cubiertas por dos personas alternas,
  -- laboratorio y ambulancia de noche, limpieza, bodega y recepción de fin de semana.
  (23, pg_temp.did('0002', 30), 'P1-CON', 'D5'),
  (24, pg_temp.did('0002', 31), 'P2-HOS', 'A2'),
  (25, pg_temp.did('0002', 32), 'P2-HOS', 'N2'),
  (26, pg_temp.did('0002', 33), 'P2-HOS', 'N2B'),
  (27, pg_temp.did('0002', 34), 'P3-VIP', 'N2'),
  (28, pg_temp.did('0002', 35), 'P3-VIP', 'N2B'),
  (29, pg_temp.did('0002', 36), 'P4-HOS', 'D7'),
  (30, pg_temp.did('0002', 37), 'P4-HOS', 'T7'),
  (31, pg_temp.did('0002', 38), 'P4-HOS', 'N2'),
  (32, pg_temp.did('0002', 39), 'P4-HOS', 'N2B'),
  (33, pg_temp.did('0002', 40), 'P1-LAB', 'N2'),
  (34, pg_temp.did('0002', 41), 'P1-AMB', 'N2'),
  (35, pg_temp.did('0002', 42), 'P1-AMB', 'N2B'),
  (36, pg_temp.did('0002', 43), 'P1-AMB', 'T5'),
  (37, pg_temp.did('0002', 44), 'P3-VIP', 'D5'),
  (38, pg_temp.did('0002', 45), 'P4-HOS', 'T5'),
  (39, pg_temp.did('0002', 46), 'BOD-CEN', 'D5'),
  (40, pg_temp.did('0002', 47), 'P1-REC', 'T7');
-- La cardióloga (persona demo 4) no tiene plan a propósito: en la agenda aparece como "Sin turno".

insert into personal.turno (id, persona_id, area_id, periodo, tipo, estado, justificacion, publicado_por, publicado_en, creado_por)
select pg_temp.did('0003', b.idx * 100 + b.d + 2), b.persona, pg_temp.espacio(b.area),
       tstzrange(b.ini, b.fin, '[)'), b.tipo,
       case when (b.idx = 2 and b.d = 3) or (b.idx = 29 and b.d = 6) then 'cancelado'
            when b.fin <= now() then 'completado'
            when b.ini <= now() then 'en_curso'
            when b.d >= 11 and b.idx in (13, 15, 17, 30, 38) then 'borrador'
            when b.idx = 29 and b.d = 6 then 'cancelado'
            else 'publicado' end,
       case when (b.idx = 2 and b.d = 3) or (b.idx = 29 and b.d = 6) then '[DEMO] Turno cancelado: aparece tachado en la planificación y no cuenta como cobertura'
            when b.d >= 11 and b.idx in (13, 15, 17, 30, 38) then '[DEMO] Borrador: solo ADM y JOP lo ven hasta que lo publican'
            when b.idx = 1 and b.d = 0 then '[DEMO] Turno de la cuenta MED de prueba: sin turno no hay citas disponibles en la agenda'
            when b.idx = 5 and b.d = 0 then '[DEMO] Guardia médica de 24 h, el máximo que permite la política de turnos'
            when b.idx = 6 and b.d = 0 then '[DEMO] Turno nocturno de 12 h que termina al día siguiente'
            end,
       pg_temp.actor('JOP'), now() - interval '1 day', pg_temp.actor('JOP')
from (
  select p.idx, p.persona, p.area, d.d,
         case when p.patron = 'D7' or (p.patron = 'D5' and extract(isodow from pg_temp.hoy() + d.d) <= 5)
                   or (p.patron = 'A2' and mod(mod(d.d, 2) + 2, 2) = 0) then pg_temp.ts(pg_temp.hoy() + d.d, 7)
              when (p.patron = 'T5' and extract(isodow from pg_temp.hoy() + d.d) <= 5) or p.patron = 'T7' then pg_temp.ts(pg_temp.hoy() + d.d, 13)
              when (p.patron = 'N2' and mod(mod(d.d, 2) + 2, 2) = 0) or (p.patron = 'N2B' and mod(mod(d.d, 2) + 2, 2) = 1) then pg_temp.ts(pg_temp.hoy() + d.d, 19)
              when p.patron = 'G4' and mod(mod(d.d, 4) + 4, 4) = 0 then pg_temp.ts(pg_temp.hoy() + d.d, 7) end as ini,
         case when p.patron in ('D7', 'D5', 'A2') then pg_temp.ts(pg_temp.hoy() + d.d, 14)
              when p.patron in ('T5', 'T7') then pg_temp.ts(pg_temp.hoy() + d.d, 20)
              when p.patron in ('N2', 'N2B', 'G4') then pg_temp.ts(pg_temp.hoy() + d.d + 1, 7) end as fin,
         case when p.patron in ('N2', 'N2B') then 'nocturno' when p.patron = 'G4' then 'guardia' else 'diurno' end as tipo
  from plan_turno p cross join generate_series(-1, 13) d(d)
) b
where b.ini is not null and b.persona is not null
on conflict do nothing;

-- ---------------------------------------------------------------------------------------------------------
-- 4. Pacientes ficticios (27), identificadores, historial y caso de duplicado
-- ---------------------------------------------------------------------------------------------------------
create temp table pdemo (n int primary key, nombres text, ap1 text, ap2 text, sexo text, nac date, municipio text,
  calle text, nota text, estado text, ident text, correo boolean) on commit drop;
insert into pdemo values
  (1,  'María Alejandra',   'Rivera',     'Campos',    'femenino',  '1988-03-14', 'San Salvador',   'Col. Escalón, Pje. 3 #12',        'Cita confirmada hoy: REC la ve en Citas y MED en Mi día',                  'activo',   'dui', true),
  (2,  'María Valeria',     'Cornejo',    'Alas',      'femenino',  '1995-07-02', 'Santa Tecla',    'Res. Jardines de la Sabana, Blq 2', 'Casi homónima de la ficha 1: prueba la búsqueda "maria" sin tilde',        'activo',   'dui', true),
  (3,  'José Roberto',      'Quintanilla','Mena',      'masculino', '1975-11-30', 'Soyapango',      'Col. Santa Lucía, Cl. Principal #8','Consulta firmada hoy con hemograma ya revisado por el médico',            'activo',   'dui', false),
  (4,  'Ana Cecilia',       'Portillo',   'Mejía',     'femenino',  '2001-01-22', 'Mejicanos',      'Col. Zacamil, Edif. 7',            'En espera en la fila de consulta general; tiene una cita también',         'activo',   'dui', true),
  (5,  'Carlos Eduardo',    'Mejía',      'Rivas',     'masculino', '1990-09-09', 'Ilopango',       'Col. San Felipe #44',              'Consulta abierta (borrador) con hemograma urgente pendiente',               'activo',   'dui', false),
  (6,  'Carlos Eduardo',    'Mejía',      'Rivas',     'masculino', '1990-09-09', 'Ilopango',       'Col. San Felipe #44',              'Posible duplicado de la ficha 5 (mismo nombre y fecha): ver Duplicados',   'activo',   null,  false),
  (7,  'Lucía Fernanda',    'Guardado',   'Pineda',    'femenino',  '1982-05-18', 'Apopa',          'Col. Las Margaritas, Cl. 2 #5',    'Hospitalizada en semiprivada HAB-401, cama A',                              'activo',   'dui', true),
  (8,  'Rosa Elena',        'Martínez',   'Orellana',  'femenino',  '1957-12-03', 'Ayutuxtepeque',  'Col. Sierra Morena III',           'Comparte HAB-401 con la ficha 7 (mismo sexo); fue trasladada de cama',      'activo',   'dui', false),
  (9,  'Jorge Alberto',     'Cañas',      'Flores',    'masculino', '1969-08-21', 'Cuscatancingo',  'Col. Cuscatancingo, Pje. 6 #19',   'Hospitalizado con aislamiento en HAB-402; su cama B queda bloqueada',       'activo',   'dui', false),
  (10, 'Mercedes del Carmen','Aguilar',   'Vásquez',   'femenino',  '1944-02-27', 'San Salvador',   'Col. Médica, Av. Dr. Emilio Álvarez','Alta firmada en VIP-401: la cama sigue ocupada hasta la salida física',    'activo',   'dui', false),
  (11, 'Daniela Michelle',  'Ramos',      'Alfaro',    'femenino',  '1993-10-05', 'Antiguo Cuscatlán','Res. Madre Selva, Casa 21',      'Admisión programada en espera de cama VIP; la VIP-402 está reservada',      'activo',   'dui', true),
  (12, 'Mauricio Antonio',  'Solís',      'Barrera',   'masculino', '1979-04-16', 'Soyapango',      'Col. Montes de San Bartolo',       'Egresado hoy: su cama HAB-403 A espera limpieza y verificación',            'activo',   'dui', false),
  (13, 'Karla Patricia',    'Menéndez',   'Lara',      'femenino',  '1999-06-11', 'San Marcos',     'Col. Jardín, Cl. 4 #7',            'Pidió una cita desde la app: queda solicitada hasta que REC la confirme',   'activo',   'dui', true),
  (14, 'Óscar Armando',     'Villatoro',  'Peña',      'masculino', '1986-12-25', 'Santa Tecla',    'Col. Utila, Pje. 1 #3',            'Cita cancelada; su cuenta ya está vinculada (vinculación aprobada)',        'activo',   'dui', true),
  (15, 'Sandra Yanira',     'Escobar',    'Rauda',     'femenino',  '1971-09-14', 'Soyapango',      'Col. Cima II, Blq F',              'Cita rechazada con motivo; su solicitud de vinculación fue rechazada',      'activo',   'dui', false),
  (16, 'Fernando José',     'Alvarado',   'Gómez',     'masculino', '1964-03-08', 'Mejicanos',      'Col. Montserrat #31',              'No asistió a su cita de hoy: queda en el historial',                        'activo',   'dui', false),
  (17, 'Wendy Carolina',    'Flores',     'Argueta',   'femenino',  '2016-05-30', 'Apopa',          'Col. Popotlán, Cl. Principal #2',  'Menor de edad: identificada con partida de nacimiento, no con DUI',         'activo',   'partida', false),
  (18, 'Pedro Ernesto',     'Lemus',      'Cartagena', 'masculino', '1952-07-07', 'San Salvador',   'Col. Layco, Cl. Sisimiles',        'Hipertenso con tres consultas firmadas y un addendum: mira su historial',   'activo',   'dui', false),
  (19, 'Gloria Beatriz',    'Tobar',      'Navarro',   'femenino',  '1980-01-29', 'Nejapa',         'Col. Quezaltepeque, Pje. 9',       'Química básica en proceso en laboratorio; llamada a consulta (fila)',       'activo',   'dui', false),
  (20, 'Ricardo Estuardo',  'Funes',      'Molina',    'masculino', '1997-11-11', 'Soyapango',      'Col. Los Santos #66',              'Examen de orina completado, pendiente de revisión médica',                  'activo',   'dui', false),
  (21, 'Evelyn Johana',     'Chicas',     'Mancía',    'femenino',  '1989-04-04', 'Ilopango',       'Col. Santa Eduviges',              'Orden de laboratorio cancelada con motivo; no se presentó a la fila',       'activo',   'dui', false),
  (22, 'Salvador Humberto', 'Bonilla',    'Ayala',     'masculino', '1960-06-06', 'San Salvador',   'Col. Centroamérica',               'En emergencia con glucosa crítica sin revisar; atendido antes por ambulancia','activo', 'dui', false),
  (23, 'Nora Isabel',       'Cruz',       'Palacios',  'femenino',  '1975-08-19', 'Soyapango',      'Col. Guadalupe #12',               'Pidió una ambulancia desde la app: la solicitud espera confirmación',       'activo',   'dui', true),
  (24, 'Isaías David',      'Pérez',      'Zelaya',    'masculino', '2003-02-12', 'Apopa',          'Col. El Cañaveral',                'Servicio de ambulancia en curso (la unidad sale en En Servicio)',           'activo',   'dui', false),
  (25, null,                null,         null,        'masculino', null,         null,            null,                               'Identidad provisional sin datos inventados: NN con edad estimada y señas','provisional', null, false),
  (26, 'Teresa de Jesús',   'Alvarenga',  'Hernández', 'femenino',  '1938-10-10', 'Santa Tecla',    'Col. Las Delicias',                'Ficha inactiva: no aparece al buscar pacientes activos',                    'inactivo', 'dui', false),
  (27, 'Sophie Marie',      'Dubois',     null,        'femenino',  '1985-12-12', 'San Salvador',   'Hotel Escalón, Hab. 214',          'Extranjera identificada con pasaporte (identificador exclusivo)',           'activo',   'pasaporte', true);

insert into pacientes.paciente (id, expediente, estado, nombres, primer_apellido, segundo_apellido, alias_provisional, sexo, nacimiento,
  precision_nacimiento, edad_estimada, edad_estimada_en, telefono, correo, direccion, municipio, contacto_emergencia, senas,
  busqueda_normalizada, fon_apellido, fon_nombres, creado_por, version)
select pg_temp.did('0001', p.n), pg_temp.expediente(9900000 + p.n), p.estado, p.nombres, p.ap1, p.ap2,
       case when p.estado = 'provisional' then 'NN-DEMO-001' end, p.sexo, p.nac,
       case when p.estado = 'provisional' then 'estimada' when p.nac is null then 'desconocida' else 'exacta' end,
       case when p.estado = 'provisional' then 35 end, case when p.estado = 'provisional' then pg_temp.hoy() end,
       '7000' || lpad(p.n::text, 4, '0'),
       case when p.correo then lower(replace(pg_temp.norm(p.nombres || ' ' || p.ap1), ' ', '.')) || '.demo@example.test' end,
       case when p.calle is not null then p.calle || '. [DEMO] ' || p.nota end, p.municipio,
       case when p.estado <> 'provisional' then jsonb_build_object('nombre', 'Familiar de ' || p.nombres, 'telefono', '7001' || lpad(p.n::text, 4, '0'), 'parentesco', 'familiar') end,
       case when p.estado = 'provisional' then '[DEMO] ' || p.nota || '. Hombre adulto, camisa azul, sin documentos, llegó en ambulancia.' end,
       case when p.estado = 'provisional' then 'nn demo 001'
            else pg_temp.norm(concat_ws(' ', p.nombres, concat_ws(' ', p.ap1, p.ap2),
                   case when p.ident = 'dui' then pg_temp.dui('9000' || lpad(p.n::text, 4, '0')) end, p.nac::text)) end,
       case when p.estado = 'provisional' then '' else pg_temp.fon(concat_ws(' ', p.ap1, p.ap2)) end,
       case when p.estado = 'provisional' then '' else pg_temp.fon(p.nombres) end,
       pg_temp.actor('REC'), case when p.n in (1, 2, 18) then 2 else 1 end
from pdemo p
on conflict do nothing;

insert into pacientes.identificador (id, paciente_id, tipo, emisor, valor_original, valor_normalizado, estado, exclusivo)
select pg_temp.did('0013', p.n), pg_temp.did('0001', p.n),
       case p.ident when 'dui' then 'dui' when 'partida' then 'partida_nacimiento' else 'pasaporte' end,
       case p.ident when 'dui' then 'RNPN' when 'partida' then 'municipio' else 'país' end,
       case p.ident when 'dui' then substr(pg_temp.dui('9000' || lpad(p.n::text, 4, '0')), 1, 8) || '-' || right(pg_temp.dui('9000' || lpad(p.n::text, 4, '0')), 1)
                    when 'partida' then 'PN-DEMO-' || lpad(p.n::text, 4, '0') else 'PAS-DEMO-' || lpad(p.n::text, 4, '0') end,
       case p.ident when 'dui' then pg_temp.dui('9000' || lpad(p.n::text, 4, '0'))
                    when 'partida' then 'PN-DEMO-' || lpad(p.n::text, 4, '0') else 'PAS-DEMO-' || lpad(p.n::text, 4, '0') end,
       case when p.n % 2 = 0 then 'verificado' else 'sin_verificar' end, p.ident <> 'partida'
from pdemo p where p.ident is not null
on conflict do nothing;

-- Pacientes con ficha editada: el historial demográfico solo se inserta y explica el cambio.
insert into pacientes.historial_demografico (paciente_id, version, cambiado_en, actor_id, motivo, cambios) values
  (pg_temp.did('0001', 1), 2, now() - interval '5 days', pg_temp.actor('REC'),
     '[DEMO] Corrección de teléfono pedida por la paciente: así queda quién cambió qué y por qué',
     '{"telefono": {"before": "70000099", "after": "70000001"}}'::jsonb),
  (pg_temp.did('0001', 2), 2, now() - interval '4 days', pg_temp.actor('REC'),
     '[DEMO] Se completó el correo; la versión sube y el historial no se borra',
     '{"correo": {"before": null, "after": "maria.cornejo.demo@example.test"}}'::jsonb),
  (pg_temp.did('0001', 18), 2, now() - interval '3 days', pg_temp.actor('REC'),
     '[DEMO] Cambio de dirección del paciente crónico',
     '{"direccion": {"before": "Col. Layco", "after": "Col. Layco, Cl. Sisimiles"}}'::jsonb)
on conflict do nothing;

-- Caso de duplicado abierto (fichas 5 y 6) y uno descartado (1 y 2). Siempre en orden canónico.
insert into pacientes.caso_duplicado (id, pacientes_ids, estado, motivo, abierto_por, abierto_en) values
  (pg_temp.did('0091', 1), array[pg_temp.did('0001', 5), pg_temp.did('0001', 6)], 'sospechado',
     '[DEMO] Mismo nombre y misma fecha de nacimiento: revisa y descarta o confirma el duplicado', pg_temp.actor('REC'), now() - interval '1 day'),
  (pg_temp.did('0091', 2), array[pg_temp.did('0001', 1), pg_temp.did('0001', 2)], 'descartado',
     '[DEMO] Descartado: dos personas distintas con nombres parecidos', pg_temp.actor('REC'), now() - interval '6 days')
on conflict do nothing;

-- ---------------------------------------------------------------------------------------------------------
-- 4b. Volumen: 93 pacientes más (fichas 28 a 120), con nombres salvadoreños ficticios, edades y contactos coherentes.
--     La tabla temporal vol guía el resto de la siembra: cada paciente tiene una historia (cohorte) según su número k:
--       k  1-45  historial clínico (consulta firmada pasada con signos, diagnósticos, receta y a veces laboratorio)
--       k 46-60  citas futuras en todos los estados (y alguna pasada que no se cumplió)
--       k 61-70  consulta externa de hoy (fila, citas, consultas abiertas y firmadas)
--       k 71-74  emergencia de hoy
--       k 75-90  hospitalización (hospitalizados, alta firmada, pendientes de cama, egresos y una admisión cancelada)
--       k 91-93  fichas sin actividad (una inactiva)
-- ---------------------------------------------------------------------------------------------------------
create or replace function pg_temp.pick(a text[], i int) returns text language sql immutable as
$$ select a[1 + mod(mod(i, cardinality(a)) + cardinality(a), cardinality(a))] $$;

create temp table vol (k int primary key, n int, cohorte text, sexo text, edad int, nac date, nombres text, ap1 text, ap2 text, municipio text,
  calle text, nota text, estado text, ident text, correo boolean) on commit drop;
insert into vol
select k, 27 + k,
       case when k <= 45 then 'historial' when k <= 60 then 'citas' when k <= 70 then 'hoy' when k <= 74 then 'emergencia'
            when k <= 90 then 'hospital' else 'sin_actividad' end,
       case when k % 2 = 1 then 'femenino' else 'masculino' end,
       e.edad,
       (pg_temp.hoy() - (e.edad || ' years')::interval - (mod(k * 53, 330) || ' days')::interval)::date,
       case when k % 2 = 1
            then pg_temp.pick(array['María del Carmen','Ana Patricia','Carmen Elena','Rosa Isabel','Claudia Marcela','Sonia Yolanda','Jessica Lorena',
              'Patricia Guadalupe','Marta Alicia','Lilian Beatriz','Silvia Carolina','Gladis Esperanza','Dora Alicia','Vilma Concepción','Zoila Marina',
              'Ingrid Johana','Alejandra Nicole','Daysi Maribel','Fátima Gabriela','Brenda Lisseth','Miriam Odette','Rebeca Noemí','Xiomara Ivette',
              'Abigail Sofía','Mayra Cecilia','Irma Leticia','Reina Isabel','Julia Margarita','Estela Concepción','Lorena Abigail','Marisol Andrea',
              'Yaneth Cristina','Amparo del Rosario','Paola Estefany','Jazmín Alexandra','Nidia Esmeralda','Olga Marina','Hilda Yolanda','Berta Alicia',
              'Elsa Noemy'], k * 7)
            else pg_temp.pick(array['Juan Carlos','Luis Alberto','José Miguel','Francisco Javier','Manuel Antonio','Pedro Ernesto','Miguel Ángel',
              'Rafael Eduardo','Santos Armando','Ángel Gabriel','Víctor Manuel','Marvin Alexander','Henry Josué','Kevin Orlando','Walter Ernesto',
              'Edgardo Ismael','César Augusto','Douglas Rolando','Jonathan Isaac','Bryan Stanley','Elmer Ovidio','Rubén Darío','Néstor Humberto',
              'Tomás Aquino','Gilberto Antonio','Samuel Elías','Adán Rigoberto','Lisandro Gustavo','Mauricio Ariel','Noé Francisco','Wilber Alfonso',
              'Josué Mateo','Iván Alexis','Oswaldo René','Saúl Benjamín','Efraín Josué','Cristian Daniel','Alexis Fabricio','Dagoberto Ulises',
              'Santiago Matías'], k * 7) end,
       pg_temp.pick(array['Hernández','Martínez','López','García','González','Pérez','Rodríguez','Ramírez','Flores','Gómez','Sánchez','Morales','Castillo',
         'Reyes','Cruz','Ortiz','Rivas','Torres','Vásquez','Mejía','Alvarenga','Meléndez','Guevara','Cáceres','Rosales','Aguirre','Henríquez','Cortez',
         'Orellana','Pineda','Escobar','Benítez','Ventura','Zelaya','Arévalo','Barrientos','Palacios','Linares','Magaña','Iraheta','Chávez','Argueta',
         'Sorto','Hércules','Recinos','Amaya','Mancía','Villalobos','Serrano','Ayala'], k * 7 + 3),
       pg_temp.pick(array['Campos','Alas','Mena','Flores','Pineda','Quijada','Alvarado','Cañas','Lara','Rauda','Molina','Navarro','Cartagena','Funes',
         'Palacios','Zelaya','Barrera','Gómez','Vásquez','Lemus','Mejía','Portillo','Alfaro','Solís','Cornejo','Peña','Argueta','Hernández','Coto',
         'Menjívar','Rivera','Quintanilla','Guardado','Martínez','Ramos','Bonilla','Tobar','Cruz','Escobar','Aguilar'], k * 11 + 17),
       pg_temp.pick(array['San Salvador','Soyapango','Santa Tecla','Mejicanos','Apopa','Ilopango','Ciudad Delgado','San Marcos','Cuscatancingo',
         'Antiguo Cuscatlán','Nejapa','Ayutuxtepeque','San Martín','Tonacatepeque','Zaragoza','Colón'], k * 5),
       pg_temp.pick(array['Col. Escalón','Col. Miramonte','Res. Altos de la Cima','Col. San Luis','Col. Layco','Col. Flor Blanca','Col. Santa Marta',
         'Col. Zacamil','Col. Montes de San Bartolo','Res. Villas del Sol','Col. Las Brisas','Col. La Rábida','Col. Jardines de Cuscatlán',
         'Col. Monserrat','Col. Iberia','Col. Atlacatl','Col. Quiñónez','Col. El Roble','Col. Costa Rica','Col. Vista Hermosa'], k * 3)
         || ', Pje. ' || (1 + k % 12) || ' #' || (1 + (k * 7) % 90),
       case when k <= 45 then 'Historial clínico: consulta firmada hace ' || (2 + mod(k * 7, 58)) || ' días con diagnóstico, signos vitales y receta'
            when k <= 60 then 'Tiene citas próximas (o una que no se cumplió): mira Citas'
            when k <= 70 then 'Atención de consulta externa hoy: fila, cita o consulta abierta'
            when k <= 74 then 'En emergencia hoy: ticket de emergencia y consulta de urgencia'
            when k <= 90 then 'Hospitalización: ver estado de la admisión y la cama'
            else 'Ficha sin actividad clínica' end,
       case when k = 93 then 'inactivo' else 'activo' end,
       case when e.edad < 18 then 'partida' else 'dui' end,
       k % 3 = 0
from generate_series(1, 93) k
cross join lateral (select case when k in (50, 54, 58) then 3 + mod(k, 9)
                                when k between 46 and 90 then 20 + mod(k * 37, 60)
                                else 1 + mod(k * 37 + 11, 86) end as edad) e;

insert into pacientes.paciente (id, expediente, estado, nombres, primer_apellido, segundo_apellido, sexo, nacimiento, precision_nacimiento,
  telefono, correo, direccion, municipio, contacto_emergencia, busqueda_normalizada, fon_apellido, fon_nombres, creado_por, version)
select pg_temp.did('0001', v.n), pg_temp.expediente(9900000 + v.n), v.estado, v.nombres, v.ap1, v.ap2, v.sexo, v.nac, 'exacta',
       '7000' || lpad(v.n::text, 4, '0'),
       case when v.correo then lower(replace(pg_temp.norm(v.nombres || ' ' || v.ap1), ' ', '.')) || '.' || v.n || '.demo@example.test' end,
       v.calle || '. [DEMO] ' || v.nota, v.municipio,
       jsonb_build_object('nombre', pg_temp.pick(case when v.sexo = 'femenino' then array['Carlos','Mario','José','Roberto'] else array['María','Ana','Rosa','Carmen'] end, v.k)
                                    || ' ' || v.ap1,
                          'telefono', '7001' || lpad(v.n::text, 4, '0'),
                          'parentesco', case when v.edad < 18 then case when v.k % 2 = 1 then 'madre' else 'padre' end
                                             else pg_temp.pick(array['esposo/a','hijo/a','hermano/a','madre'], v.k) end),
       pg_temp.norm(concat_ws(' ', v.nombres, concat_ws(' ', v.ap1, v.ap2),
         case when v.ident = 'dui' then pg_temp.dui('9000' || lpad(v.n::text, 4, '0')) end, v.nac::text)),
       pg_temp.fon(concat_ws(' ', v.ap1, v.ap2)), pg_temp.fon(v.nombres), pg_temp.actor('REC'), 1
from vol v
on conflict do nothing;

insert into pacientes.identificador (id, paciente_id, tipo, emisor, valor_original, valor_normalizado, estado, exclusivo)
select pg_temp.did('0013', v.n), pg_temp.did('0001', v.n),
       case v.ident when 'dui' then 'dui' else 'partida_nacimiento' end,
       case v.ident when 'dui' then 'RNPN' else 'municipio' end,
       case v.ident when 'dui' then substr(pg_temp.dui('9000' || lpad(v.n::text, 4, '0')), 1, 8) || '-' || right(pg_temp.dui('9000' || lpad(v.n::text, 4, '0')), 1)
                    else 'PN-DEMO-' || lpad(v.n::text, 4, '0') end,
       case v.ident when 'dui' then pg_temp.dui('9000' || lpad(v.n::text, 4, '0')) else 'PN-DEMO-' || lpad(v.n::text, 4, '0') end,
       case when v.n % 2 = 0 then 'verificado' else 'sin_verificar' end, v.ident = 'dui'
from vol v
on conflict do nothing;

-- Algunas fichas editadas con su historial (versión 2): quién cambió qué y por qué.
update pacientes.paciente set version = 2
where id in (select pg_temp.did('0001', n) from vol where k % 17 = 0) and version = 1;
insert into pacientes.historial_demografico (paciente_id, version, cambiado_en, actor_id, motivo, cambios)
select pg_temp.did('0001', v.n), 2, now() - (v.k || ' days')::interval, pg_temp.actor('REC'),
       '[DEMO] Actualización de contacto pedida por el paciente en recepción',
       jsonb_build_object('telefono', jsonb_build_object('before', '7099' || lpad(v.n::text, 4, '0'), 'after', '7000' || lpad(v.n::text, 4, '0')))
from vol v where v.k % 17 = 0
on conflict do nothing;

-- Un caso de duplicado en revisión (los dos primeros números de las fichas sin actividad).
insert into pacientes.caso_duplicado (id, pacientes_ids, estado, motivo, abierto_por, abierto_en) values
  (pg_temp.did('0091', 3), array[pg_temp.did('0001', 118), pg_temp.did('0001', 119)], 'en_revision',
     '[DEMO] En revisión: mismo domicilio y apellido parecido; se comparan documentos antes de decidir si es la misma persona', pg_temp.actor('REC'), now() - interval '2 days')
on conflict do nothing;

-- ---------------------------------------------------------------------------------------------------------
-- 4c. Volumen: viñetas clínicas, médico y citas de cada paciente. Las citas, la fila y las consultas de los
--     pacientes k 1 a 90 salen de aquí y entran a las mismas tablas de trabajo que las hechas a mano.
-- ---------------------------------------------------------------------------------------------------------
create temp table vin (v int primary key, motivo text, examen text, plan text, cie1 text, nota1 text, cie2 text, nota2 text,
  med1 text, dosis1 text, via1 text, frec1 text, dur1 text, med2 text, dosis2 text, via2 text, frec2 text, dur2 text,
  lab text, ps int, pd int, fc int, fr int, tt numeric, sat int) on commit drop;
insert into vin values
  (1,  'Dolor de garganta y fiebre de tres días', 'Faringe eritematosa, amígdalas con hipertrofia leve, sin exudado.', 'Reposo, líquidos abundantes y antipirético. Regresar si la fiebre pasa de 72 horas.',
       'J02.9', 'Faringitis aguda', 'R50.9', 'Fiebre asociada', 'Acetaminofén 500 mg tabletas', '1 tableta', 'oral', 'cada 8 horas', '3 días', null, null, null, null, null, null, 118, 76, 88, 18, 38.1, 97),
  (2,  'Control de hipertensión arterial', 'Ruidos cardíacos rítmicos, sin edema periférico.', 'Continuar antihipertensivo, dieta baja en sal y ejercicio. Control en tres meses con perfil lipídico.',
       'I10', 'Hipertensión esencial en control', 'E78.5', 'Colesterol por vigilar', 'Losartán 50 mg tabletas', '1 tableta', 'oral', 'cada 24 horas', '90 días',
       'Hidroclorotiazida 25 mg tabletas', 'media tableta', 'oral', 'cada 24 horas', '90 días', 'LIP', 146, 92, 76, 16, 36.6, 97),
  (3,  'Control de diabetes tipo 2', 'Pulsos pedios presentes, sensibilidad conservada, sin lesiones en los pies.', 'Continuar metformina, dieta y actividad física. Glucosa y creatinina de control.',
       'E11.9', 'Diabetes tipo 2 en seguimiento', 'E78.5', 'Colesterol por vigilar', 'Metformina 850 mg tabletas', '1 tableta', 'oral', 'cada 12 horas', '90 días', null, null, null, null, null, 'QB', 134, 84, 82, 17, 36.7, 97),
  (4,  'Dolor en la boca del estómago después de comer', 'Abdomen blando, dolor leve a la palpación en epigastrio.', 'Evitar café, picante y antiinflamatorios. Omeprazol en ayunas por cuatro semanas.',
       'K29.7', 'Gastritis', null, null, 'Omeprazol 20 mg cápsulas', '1 cápsula', 'oral', 'cada 24 horas en ayunas', '28 días', null, null, null, null, null, null, 122, 78, 78, 16, 36.6, 98),
  (5,  'Ardor al orinar y orina frecuente', 'Dolor suprapúbico leve, puñopercusión negativa.', 'Examen general de orina y líquidos abundantes; antibiótico según resultado.',
       'N39.0', 'Infección urinaria probable', null, null, 'Nitrofurantoína 100 mg cápsulas', '1 cápsula', 'oral', 'cada 12 horas', '5 días', null, null, null, null, null, 'EGO', 120, 78, 86, 18, 37.4, 98),
  (6,  'Dolor lumbar tras cargar peso', 'Contractura paravertebral, sin déficit neurológico.', 'Antiinflamatorio por cinco días, calor local y evitar cargar peso. Fisioterapia si no mejora.',
       'M54.5', 'Lumbago mecánico', 'M79.1', 'Mialgia asociada', 'Ibuprofeno 400 mg tabletas', '1 tableta', 'oral', 'cada 8 horas con alimento', '5 días', null, null, null, null, null, null, 126, 82, 80, 16, 36.5, 98),
  (7,  'Congestión nasal, tos y malestar general', 'Mucosa nasal congestiva, pulmones limpios.', 'Líquidos, reposo y lavado nasal. Antihistamínico por cinco días.',
       'J06.9', 'Infección respiratoria alta', 'R05', 'Tos', 'Loratadina 10 mg tabletas', '1 tableta', 'oral', 'cada 24 horas', '5 días', 'Acetaminofén 500 mg tabletas', '1 tableta', 'oral', 'cada 8 horas si hay fiebre', '3 días', null, 116, 74, 84, 18, 37.6, 97),
  (8,  'Dolor de cabeza frecuente', 'Sin signos meníngeos ni déficit neurológico; presión arterial normal.', 'Analgésico, hidratación y registro de los episodios. Valoración visual.',
       'R51', 'Cefalea', null, null, 'Acetaminofén 500 mg tabletas', '1 tableta', 'oral', 'cada 8 horas', '3 días', null, null, null, null, null, null, 118, 76, 74, 16, 36.5, 99),
  (9,  'Control de asma con tos nocturna', 'Sibilancias espiratorias leves bilaterales.', 'Salbutamol de rescate, evitar desencadenantes y control en un mes.',
       'J45.9', 'Asma en control parcial', 'J30.4', 'Rinitis alérgica asociada', 'Salbutamol inhalador 100 mcg', '2 inhalaciones', 'inhalada', 'cada 6 horas si hay síntomas', '30 días', null, null, null, null, null, null, 120, 78, 90, 20, 36.6, 95),
  (10, 'Resultado de colesterol elevado', 'Sin xantomas; índice de masa corporal elevado.', 'Dieta baja en grasas, ejercicio y estatina. Perfil lipídico en tres meses.',
       'E78.5', 'Hiperlipidemia', null, null, 'Atorvastatina 20 mg tabletas', '1 tableta', 'oral', 'cada 24 horas en la noche', '90 días', null, null, null, null, null, 'LIP', 128, 82, 78, 16, 36.6, 98),
  (11, 'Estornudos y picazón nasal por la mañana', 'Mucosa pálida, cornetes edematosos.', 'Evitar polvo y humedad; antihistamínico diario por dos semanas.',
       'J30.4', 'Rinitis alérgica', null, null, 'Loratadina 10 mg tabletas', '1 tableta', 'oral', 'cada 24 horas', '14 días', null, null, null, null, null, null, 114, 72, 76, 16, 36.5, 98),
  (12, 'Acidez y ardor detrás del esternón', 'Abdomen sin dolor, sin signos de alarma.', 'Elevar la cabecera, comidas pequeñas y omeprazol por un mes.',
       'K21.9', 'Reflujo gastroesofágico', null, null, 'Omeprazol 20 mg cápsulas', '1 cápsula', 'oral', 'cada 24 horas en ayunas', '30 días', null, null, null, null, null, null, 124, 80, 74, 16, 36.5, 98),
  (13, 'Fiebre alta, dolor de cuerpo y detrás de los ojos', 'Exantema leve; prueba del torniquete negativa.', 'Hidratación oral, acetaminofén (no aspirina ni ibuprofeno) y hemograma de control en 48 horas.',
       'A90', 'Dengue sin signos de alarma', 'R50.9', 'Fiebre', 'Acetaminofén 500 mg tabletas', '1 tableta', 'oral', 'cada 6 horas', '5 días', null, null, null, null, null, 'HEMO', 108, 68, 98, 20, 38.9, 97),
  (14, 'Erupción con picazón en los antebrazos', 'Eritema y pápulas en antebrazos, sin vesículas.', 'Evitar el contacto con el irritante y usar corticoide tópico por siete días.',
       'L23.9', 'Dermatitis de contacto', 'L50.9', 'Urticaria leve', 'Hidrocortisona 1% crema', 'capa fina', 'tópica', 'cada 12 horas', '7 días', null, null, null, null, null, null, 116, 74, 72, 16, 36.5, 99),
  (15, 'Tos y mocos desde hace dos días', 'Faringe congestiva, pulmones limpios, buena hidratación.', 'Líquidos, lavado nasal y control de la fiebre; se explicaron los signos de alarma a la madre o el padre.',
       'J06.9', 'Infección respiratoria alta', 'R05', 'Tos', 'Acetaminofén 160 mg/5 ml jarabe', '5 ml', 'oral', 'cada 8 horas', '3 días', null, null, null, null, null, null, 98, 62, 110, 24, 37.8, 98),
  (16, 'Diarrea y vómito desde ayer', 'Mucosas húmedas, abdomen blando, sin deshidratación.', 'Suero oral después de cada evacuación y dieta habitual.',
       'A09', 'Gastroenteritis aguda', null, null, 'Suero oral en sobres', '1 sobre en un litro de agua', 'oral', 'después de cada evacuación', '3 días', null, null, null, null, null, null, 96, 60, 112, 24, 37.5, 98),
  (17, 'Tos con silbidos en el pecho', 'Sibilancias espiratorias, sin tiraje.', 'Salbutamol de rescate y control en 48 horas.',
       'J20.9', 'Bronquitis aguda', 'R05', 'Tos', 'Salbutamol inhalador 100 mcg', '1 inhalación con espaciador', 'inhalada', 'cada 6 horas', '5 días', null, null, null, null, null, null, 98, 62, 118, 28, 37.2, 96),
  (18, 'Resfriado con fiebre leve', 'Faringe congestiva leve.', 'Líquidos y reposo; control si la fiebre dura más de tres días.',
       'J00', 'Resfriado común', null, null, 'Acetaminofén 160 mg/5 ml jarabe', '5 ml', 'oral', 'cada 8 horas', '3 días', null, null, null, null, null, null, 100, 64, 108, 22, 37.6, 98),
  (19, 'Control prenatal', 'Altura uterina acorde a la edad gestacional, latidos fetales presentes.', 'Ácido fólico y hierro, control mensual y ultrasonido según edad gestacional.',
       'Z34.9', 'Embarazo normal en control', null, null, 'Ácido fólico 5 mg tabletas', '1 tableta', 'oral', 'cada 24 horas', '30 días', 'Sulfato ferroso 300 mg tabletas', '1 tableta', 'oral', 'cada 24 horas', '30 días', 'PRENATAL', 112, 70, 84, 18, 36.6, 98),
  -- Motivos de emergencia (solo los usan los pacientes de emergencia de hoy).
  (20, 'Fiebre alta, tos y dificultad para respirar', 'Taquipnea, crepitantes en la base derecha.', 'Observación, radiografía de tórax y antibiótico.',
       'J18.9', 'Neumonía probable', 'R50.9', 'Fiebre', 'Amoxicilina 500 mg cápsulas', '1 cápsula', 'oral', 'cada 8 horas', '7 días', null, null, null, null, null, null, 104, 66, 118, 26, 38.9, 91),
  (21, 'Dolor abdominal intenso desde la madrugada', 'Abdomen doloroso en fosa ilíaca derecha, sin rebote.', 'Analgesia, laboratorio y valoración quirúrgica si persiste.',
       'R10.4', 'Dolor abdominal en estudio', null, null, 'Acetaminofén 500 mg tabletas', '1 tableta', 'oral', 'cada 8 horas', '2 días', null, null, null, null, null, null, 128, 82, 96, 20, 37.4, 98),
  (22, 'Dolor de cabeza intenso con presión alta', 'Presión arterial elevada, sin déficit neurológico.', 'Control de la presión en observación e ingreso para ajustar el tratamiento.',
       'I10', 'Crisis hipertensiva sin daño de órgano', 'R51', 'Cefalea asociada', 'Captopril 25 mg tabletas', '1 tableta', 'oral', 'cada 8 horas', '7 días', null, null, null, null, null, null, 182, 108, 92, 18, 36.7, 97);

-- Médico (0 = cuenta MED, 1 y 30 medicina general, 2 pediatría, 5 ginecología) y viñeta de cada paciente.
create temp table vcl (k int primary key, n int, med int, v int, cronico boolean, edad int, sexo text) on commit drop;
insert into vcl
select x.k, x.n, x.med, x.v, x.cron, x.edad, x.sexo
from (
  select v.k, v.n, v.edad, v.sexo,
         (v.cohorte = 'historial' and v.k % 4 = 2 and v.edad >= 35) as cron,
         (v.sexo = 'femenino' and v.edad between 18 and 45 and v.k % 3 = 0 and v.cohorte in ('historial', 'citas')) as gin,
         case when v.edad < 15 then 2
              when v.sexo = 'femenino' and v.edad between 18 and 45 and v.k % 3 = 0 and v.cohorte in ('historial', 'citas') then 5
              else (array[0, 1, 30])[1 + mod(v.k, 3)] end as med,
         case when v.edad < 15 then 15 + mod(v.k, 4)
              when v.sexo = 'femenino' and v.edad between 18 and 45 and v.k % 3 = 0 and v.cohorte in ('historial', 'citas') then 19
              when v.cohorte = 'historial' and v.k % 4 = 2 and v.edad >= 35 then case when v.k % 8 = 2 then 2 else 3 end
              else (array[1, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14])[1 + mod(v.k * 5, 12)] end as v
  from vol v where v.k <= 90
) x;

-- Citas del volumen. tipo: hist (consulta firmada pasada), cron1/cron2 (controles anteriores de un crónico), fut (próximos 14 días),
-- nocump (pasada que no se cumplió), hoy (consulta externa de hoy), orig (origen de una hospitalización).
create temp table vcita (n int primary key, k int, pac int, med int, dd int, hora time, estado text, origen text, motivo text, rechazo text, tipo text)
  on commit drop;
insert into vcita
-- consulta firmada pasada (historial clínico)
select 100 + c.k, c.k, c.n, c.med, -(2 + mod(c.k * 7, 58)), time '08:00' + mod(c.k, 9) * 20 * interval '1 minute', 'atendida',
       case when c.k % 4 = 1 then 'paciente' else 'recepcion' end,
       '[DEMO] Cita atendida con consulta firmada: ' || lower(vin.motivo), null, 'hist'
from vcl c join vin on vin.v = c.v where c.k <= 45
union all
-- controles anteriores de los crónicos (hace 4 y 8 semanas más que su consulta principal)
select 200 + c.k, c.k, c.n, c.med, -(2 + mod(c.k * 7, 58)) - 28, time '09:00' + mod(c.k, 5) * 20 * interval '1 minute', 'atendida', 'recepcion',
       '[DEMO] Control anterior del paciente crónico: ' || lower(vin.motivo), null, 'cron1'
from vcl c join vin on vin.v = c.v where c.cronico
union all
select 300 + c.k, c.k, c.n, c.med, -(2 + mod(c.k * 7, 58)) - 56, time '09:00' + mod(c.k, 5) * 20 * interval '1 minute', 'atendida', 'recepcion',
       '[DEMO] Primer control del paciente crónico: ' || lower(vin.motivo), null, 'cron2'
from vcl c join vin on vin.v = c.v where c.cronico
union all
-- próximos 14 días: control de algunos del historial y todo el grupo de citas. El día respeta el turno del médico
-- (pediatría solo entre semana, ginecología en días pares) y la hora se asigna sin choques más abajo.
select (case when c.k <= 45 then 400 else 500 end) + c.k, c.k, c.n, c.med,
       coalesce((select min(d) from generate_series(1, 14) d where d >= 1 + mod(c.k, 8)
                   and (c.med <> 2 or extract(isodow from pg_temp.hoy() + d) <= 5) and (c.med <> 5 or mod(d, 2) = 0)),
                (select min(d) from generate_series(1, 14) d where (c.med <> 2 or extract(isodow from pg_temp.hoy() + d) <= 5) and (c.med <> 5 or mod(d, 2) = 0))),
       null,
       case mod(c.k, 6) when 0 then 'solicitada' when 4 then 'cancelada' when 5 then 'rechazada' else 'confirmada' end,
       case when mod(c.k, 6) in (0, 5) then 'paciente' when c.k % 2 = 0 then 'recepcion' else 'paciente' end,
       case mod(c.k, 6) when 0 then '[DEMO] Solicitud de cita desde la app: REC la confirma o la rechaza'
                        when 4 then '[DEMO] Cancelada con anticipación por el paciente'
                        when 5 then '[DEMO] Solicitud rechazada: se propuso otro horario'
                        else '[DEMO] Cita confirmada para ' || lower(vin.motivo) end,
       case when mod(c.k, 6) = 5 then '[DEMO] Sin disponibilidad ese día; se ofreció otro horario' end, 'fut'
from vcl c join vin on vin.v = c.v where (c.k <= 45 and c.k % 4 = 0) or c.k between 46 and 60
union all
-- citas pasadas que no se cumplieron (no asistió o canceladas)
select 600 + c.k, c.k, c.n, c.med, -(3 + mod(c.k, 10)), time '10:00' + mod(c.k, 5) * 20 * interval '1 minute',
       case when c.k % 4 = 1 then 'no_asistio' else 'cancelada' end, 'recepcion',
       case when c.k % 4 = 1 then '[DEMO] El paciente no llegó: queda como no asistió' else '[DEMO] Cancelada por el paciente el mismo día' end, null, 'nocump'
from vcl c where c.k between 46 and 60 and c.k % 4 in (1, 3)
union all
-- consulta externa de hoy: cuatro confirmadas con fila, una con consulta abierta, dos atendidas y un no asistió
select 100 + h.k, h.k, 27 + h.k, h.med, 0, h.hora, h.estado, 'recepcion', h.motivo, null, 'hoy'
from (values
  (61, 0,  time '11:00', 'confirmada', '[DEMO] Cita de hoy: el paciente ya tiene número en la fila'),
  (62, 1,  time '11:00', 'confirmada', '[DEMO] Cita de hoy: el paciente ya tiene número en la fila'),
  (63, 30, time '11:00', 'confirmada', '[DEMO] Cita de hoy: el paciente ya tiene número en la fila'),
  (64, 0,  time '11:20', 'confirmada', '[DEMO] Cita de hoy: lo llamaron a consulta y no ha entrado'),
  (65, 1,  time '11:20', 'confirmada', '[DEMO] Cita de hoy: la consulta ya está abierta'),
  (66, 30, time '07:30', 'atendida',   '[DEMO] Cita de hoy ya atendida con consulta firmada'),
  (67, 30, time '07:50', 'atendida',   '[DEMO] Cita de hoy ya atendida con consulta firmada'),
  (68, 0,  time '07:30', 'no_asistio', '[DEMO] El paciente no llegó a su cita de hoy y su número de fila venció')
) h(k, med, hora, estado, motivo)
union all
-- cita que originó una hospitalización (consulta firmada previa) y consulta de ayer con laboratorio pendiente
select 100 + o.k, o.k, 27 + o.k, o.med, o.dd, o.hora, 'atendida', 'recepcion', o.motivo, null, 'orig'
from (values
  (69, 1,  -1, time '09:00', '[DEMO] Consulta de ayer: pidió un hemograma que aún no se toma'),
  (75, 1,  -1, time '09:20', '[DEMO] Consulta externa que terminó en ingreso hospitalario por observación'),
  (77, 30, -2, time '09:00', '[DEMO] Cita atendida: se programó la cirugía y el ingreso'),
  (83, 30, -1, time '09:40', '[DEMO] Cita atendida: se programó el ingreso para observación'),
  (84, 1,  -1, time '10:00', '[DEMO] Cita atendida: se programó el ingreso en habitación VIP')
) o(k, med, dd, hora, motivo)
union all
-- citas que originaron ingresos más antiguos (sin consulta firmada propia en la demo)
select 100 + o.k, o.k, 27 + o.k, o.med, o.dd, time '08:00' + mod(o.k, 6) * 20 * interval '1 minute', 'atendida', 'recepcion',
       '[DEMO] Cita atendida que terminó en ingreso hospitalario', null, 'orig2'
from (values (79, 30, -3), (80, 1, -2), (81, 30, -4), (82, 1, -5), (85, 30, -8), (86, 1, -1), (87, 30, -6), (88, 1, -12), (89, 30, -14), (90, 1, -11)) o(k, med, dd);

-- Hora sin choques para las citas futuras de cada médico: cuadros de 20 minutos desde las 11:20 (15:00 en pediatría).
update vcita c set hora = time '11:00' + (case when c.med = 2 then 240 else 20 end + 20 * s.slot) * interval '1 minute'
from (select n, row_number() over (partition by med, dd order by k) - 1 as slot from vcita where tipo = 'fut') s
where c.n = s.n and c.tipo = 'fut';

-- ---------------------------------------------------------------------------------------------------------
-- 5. Citas en todos los estados (la hora es local; "dd" son días desde hoy)
-- ---------------------------------------------------------------------------------------------------------
create temp table cdemo (n int primary key, pac int, med int, dd int, hora time, estado text, origen text, motivo text, rechazo text)
  on commit drop;
-- med 0 = cuenta MED de prueba; resto = personal demo (1 general, 2 pediatría, 5 ginecología).
insert into cdemo values
  (1,  1,  0, 0, '09:00',    'confirmada', 'recepcion', '[DEMO] Cita confirmada: el médico la ve en Mi día; REC puede cancelarla o marcarla como no asistió', null),
  (2,  2,  0, 0, '09:20',  'confirmada', 'paciente',  '[DEMO] Cita pedida por la paciente en su app y confirmada por recepción', null),
  (3,  3,  0, 0, '08:00',    'atendida',   'recepcion', '[DEMO] Cita atendida: tiene consulta firmada y un hemograma revisado', null),
  (4,  18, 0, 0, '08:20',  'atendida',   'recepcion', '[DEMO] Cita atendida del paciente crónico: su consulta ya está firmada', null),
  (5,  16, 0, 0, '08:40',  'no_asistio', 'recepcion', '[DEMO] El paciente no llegó: la cita queda como no asistió', null),
  (6,  4,  1, 0, '10:00',   'confirmada', 'recepcion', '[DEMO] Cita confirmada con el médico general', null),
  (7,  5,  0, 0, '09:40',  'confirmada', 'recepcion', '[DEMO] Cita confirmada: el paciente ya llegó y su consulta está abierta', null),
  (8,  17, 2, 1, '14:00',   'confirmada', 'recepcion', '[DEMO] Control pediátrico de una menor: el médico es pediatra', null),
  (9,  13, 0, 1, '10:00',   'solicitada', 'paciente',  '[DEMO] Solicitud de la paciente por confirmar: REC la confirma o la rechaza en Citas', null),
  (10, 14, 0, 1, '11:00',   'cancelada',  'recepcion', '[DEMO] Cancelada por el paciente con más de 2 horas de anticipación', null),
  (11, 15, 1, 1, '09:20',  'rechazada',  'paciente',  '[DEMO] Solicitud rechazada: se explicó el motivo al paciente', '[DEMO] Sin disponibilidad ese día; se propuso otro horario'),
  (12, 19, 0, 2, '08:00',    'confirmada', 'recepcion', '[DEMO] Control después de su química básica', null),
  (13, 20, 0, 2, '08:20',  'solicitada', 'paciente',  '[DEMO] Solicitud nueva desde la app del paciente', null),
  (14, 21, 1, 2, '09:00',    'confirmada', 'recepcion', '[DEMO] Cita confirmada con el médico general', null),
  (15, 22, 0, 3, '09:00',    'confirmada', 'recepcion', '[DEMO] Seguimiento después de la emergencia', null),
  (16, 7,  5, 4, '08:00',    'confirmada', 'recepcion', '[DEMO] Control ginecológico (la doctora solo atiende en días alternos)', null),
  (17, 11, 5, 2, '09:00',    'solicitada', 'paciente',  '[DEMO] Solicitud con la ginecóloga: confirma en un día con turno', null),
  (18, 8,  0, 4, '10:00',   'confirmada', 'recepcion', '[DEMO] Control de una paciente hospitalizada que será dada de alta', null),
  (19, 12, 1, 5, '11:00',   'confirmada', 'recepcion', '[DEMO] Control posterior al egreso', null),
  (20, 9,  0, 6, '08:40',  'confirmada', 'recepcion', '[DEMO] Revisión de seguimiento', null),
  -- Citas pasadas: historial de los pacientes con varias consultas (ver consultas más abajo).
  (40, 18, 0, -21, '09:00',  'atendida',   'recepcion', '[DEMO] Cita atendida de hace tres semanas: base de su historial clínico', null),
  (41, 18, 0, -45, '09:00',  'atendida',   'recepcion', '[DEMO] Cita atendida de hace mes y medio', null),
  (42, 15, 1, -3, '09:00',   'atendida',   'recepcion', '[DEMO] Consulta anulada por error de registro: queda ingresada por error, no se borra', null),
  (43, 19, 1, -1, '10:00',  'atendida',   'recepcion', '[DEMO] Consulta de ayer que pidió la química básica', null),
  (44, 20, 1, -1, '10:20','atendida',   'recepcion', '[DEMO] Consulta de ayer que pidió el examen de orina', null),
  (45, 21, 1, -1, '10:40','atendida',   'recepcion', '[DEMO] Consulta de ayer: el examen se canceló por muestra insuficiente', null),
  (46, 7,  1, -2, '11:00',  'atendida',   'recepcion', '[DEMO] Consulta previa al ingreso hospitalario', null),
  -- Citas que originaron los ingresos 2, 5 y 6 (el ingreso siempre es posterior a su origen).
  (52, 8,  1, -4, '09:00',  'atendida',   'recepcion', '[DEMO] Cita atendida: se programó la cirugía y el ingreso', null),
  (55, 11, 1, -1, '10:00',  'atendida',   'recepcion', '[DEMO] Cita atendida: se programó el ingreso en VIP', null),
  (56, 12, 1, -4, '10:20',  'atendida',   'recepcion', '[DEMO] Cita atendida: se programó el ingreso para tratamiento endovenoso', null);

-- Volumen: las citas generadas en 4c entran a la misma tabla de trabajo.
insert into cdemo select n, pac, med, dd, hora, estado, origen, motivo, rechazo from vcita;

insert into atencion.cita (id, paciente_id, medico_id, horario, motivo, estado, origen, motivo_rechazo, creado_por, creado_en)
select pg_temp.did('0004', c.n), pg_temp.did('0001', c.pac),
       case c.med when 0 then pg_temp.persona('MED') else pg_temp.did('0002', c.med) end,
       tstzrange(h.t, h.t + interval '20 minutes', '[)'),
       c.motivo, c.estado, c.origen, c.rechazo,
       case when c.origen = 'recepcion' then pg_temp.actor('REC') end,
       least(now(), h.t) - interval '2 days'
from cdemo c
-- Una cita ya atendida o a la que no se asistió no puede estar en el futuro: si es de hoy, se corre hacia atrás.
cross join lateral (select case when c.estado in ('atendida', 'no_asistio')
                                then least(pg_temp.tl(pg_temp.hoy() + c.dd, c.hora), now() - interval '30 minutes' - (c.n % 5) * interval '20 minutes')
                                else pg_temp.tl(pg_temp.hoy() + c.dd, c.hora) end as t) h
where case c.med when 0 then pg_temp.persona('MED') else pg_temp.did('0002', c.med) end is not null
on conflict do nothing;

-- ---------------------------------------------------------------------------------------------------------
-- 6. Fila del día: números emitidos con la función de la base (nunca choca con números reales)
-- ---------------------------------------------------------------------------------------------------------
create temp table tdemo (n int primary key, servicio text, pac int, estado text, consultorio text, llamados int, hora time) on commit drop;
insert into tdemo values
  (1,  'consulta_general', 4,  'en_espera',      null,     0, '07:30'),
  (2,  'consulta_general', 20, 'en_espera',      null,     0, '07:40'),
  (3,  'consulta_general', 19, 'llamado',        'C-101',  1, '07:00'),
  (4,  'consulta_general', 5,  'en_atencion',    'C-102',  1, '06:50'),
  (5,  'consulta_general', 18, 'atendido',       'C-103',  1, '06:30'),
  (6,  'consulta_general', 21, 'no_se_presento', null,     3, '06:40'),
  (7,  'emergencia',       22, 'en_atencion',    'E-01',   1, '07:00'),
  (8,  'emergencia',       25, 'en_espera',      null,     0, '07:30'),
  (9,  'emergencia',       24, 'llamado',        'E-02',   1, '07:15'),
  (10, 'emergencia',       9,  'atendido',       'E-03',   1, '06:00'),
  (11, 'laboratorio',      20, 'en_espera',      null,     0, '07:45'),
  (12, 'laboratorio',      21, 'llamado',        null,     1, '07:25'),
  (13, 'admisiones',       11, 'en_espera',      null,     0, '07:55');

-- Volumen: más números de hoy (consulta externa, emergencia, laboratorio y admisiones), uno por paciente y servicio activo.
insert into tdemo values
  (161, 'consulta_general', 88,  'en_espera',      null,    0, '07:20'),
  (162, 'consulta_general', 89,  'en_espera',      null,    0, '07:35'),
  (163, 'consulta_general', 90,  'en_espera',      null,    0, '07:50'),
  (164, 'consulta_general', 91,  'llamado',        'C-101', 1, '07:05'),
  (165, 'consulta_general', 92,  'en_atencion',    'C-104', 1, '06:55'),
  (166, 'consulta_general', 93,  'atendido',       'C-103', 1, '06:20'),
  (167, 'consulta_general', 94,  'atendido',       'C-102', 1, '06:40'),
  (168, 'consulta_general', 95,  'no_se_presento', null,    3, '06:30'),
  (169, 'laboratorio',      96,  'en_espera',      null,    0, '07:45'),
  (170, 'consulta_general', 97,  'en_espera',      null,    0, '08:05'),
  (171, 'emergencia',       98,  'en_espera',      null,    0, '07:50'),
  (172, 'emergencia',       99,  'en_atencion',    'E-02',  1, '07:20'),
  (173, 'emergencia',       100, 'atendido',       'E-03',  1, '05:50'),
  (174, 'emergencia',       101, 'llamado',        'E-02',  1, '07:35'),
  (176, 'emergencia',       103, 'atendido',       'E-01',  1, '06:00'),
  (183, 'admisiones',       110, 'en_espera',      null,    0, '07:10'),
  (184, 'admisiones',       111, 'en_espera',      null,    0, '07:25'),
  (110, 'laboratorio',      37,  'llamado',        null,    1, '07:30'),
  (120, 'laboratorio',      47,  'en_espera',      null,    0, '07:40'),
  (130, 'laboratorio',      57,  'atendido',       null,    1, '06:45');

do $$
declare
  t record;
  v_fecha date := pg_temp.hoy();
  v_numero int;
begin
  for t in select * from tdemo order by n loop
    continue when exists (select 1 from atencion.ticket_fila where id = pg_temp.did('0005', t.n));
    v_numero := atencion.emitir_numero(t.servicio, v_fecha);
    insert into atencion.ticket_fila (id, servicio, fecha, numero, paciente_id, estado, consultorio_id, llamados, emitido_por, emitido_en)
    values (pg_temp.did('0005', t.n), t.servicio, v_fecha, v_numero, pg_temp.did('0001', t.pac), t.estado,
            case when t.consultorio is not null then pg_temp.espacio(t.consultorio) end, t.llamados,
            pg_temp.actor('REC'), least(now() - interval '1 minute', pg_temp.tl(v_fecha, t.hora)))
    on conflict do nothing;
  end loop;
end $$;

-- ---------------------------------------------------------------------------------------------------------
-- 7. Consultas (borrador y firmadas) con signos, diagnósticos, recetas y addendum
-- ---------------------------------------------------------------------------------------------------------
create temp table kdemo (n int primary key, pac int, med int, cita int, ticket int, fin text, dd int, hora time, motivo text, examen text, plan text)
  on commit drop;
insert into kdemo values
  (1,  3,  0, 3,  null, 'firmada', 0, '08:00',   '[DEMO] Consulta firmada: ya no se edita, solo se corrige con addendum. Fiebre y garganta irritada de tres días', 'Faringe eritematosa, amígdalas sin exudado, sin adenopatías.', 'Reposo, líquidos, antipirético. Hemograma de control. Regresar si la fiebre pasa de 72 h.'),
  (2,  18, 0, 4,  5,    'firmada', 0, '08:20', '[DEMO] Control de hipertensión: firmada con receta y addendum de corrección', 'Sin edema, ruidos cardíacos rítmicos.', 'Continuar losartán, dieta baja en sal, control en tres meses.'),
  (3,  5,  0, 7,  4,    'abierta', 0, '09:40', '[DEMO] Consulta abierta (borrador): el médico aún puede editarla y firmarla; tiene un hemograma urgente pendiente', 'Abdomen blando, dolor leve en epigastrio.', null),
  (4,  18, 0, 40, null, 'firmada', -21, '09:00', '[DEMO] Consulta de hace tres semanas: aparece en el historial clínico del paciente', 'Presión elevada en control.', 'Ajuste de dosis de losartán.'),
  (5,  18, 0, 41, null, 'firmada', -45, '09:00', '[DEMO] Consulta de hace mes y medio: primer control de hipertensión', 'Cefalea ocasional, sin déficit neurológico.', 'Inicio de tratamiento antihipertensivo.'),
  (6,  15, 1, 42, null, 'error',   -3, '09:00',  '[DEMO] Consulta ingresada por error: se anuló conservando todo el registro', 'Sin hallazgos.', 'Anulada: se abrió sobre el paciente equivocado.'),
  (7,  19, 1, 43, null, 'firmada', -1, '10:00', '[DEMO] Consulta de ayer que solicitó una química básica (en proceso en laboratorio)', 'Paciente con poliuria y sed aumentada.', 'Química básica y control con resultados.'),
  (8,  20, 1, 44, null, 'firmada', -1, '10:20','[DEMO] Consulta de ayer que solicitó un examen general de orina (completado, sin revisar)', 'Disuria de dos días.', 'Examen de orina y tratamiento según resultado.'),
  (9,  21, 1, 45, null, 'firmada', -1, '10:40','[DEMO] Consulta de ayer: el examen pedido se canceló por muestra insuficiente', 'Dolor lumbar leve.', 'Repetir toma de muestra.'),
  (10, 22, 0, null, 7,  'abierta', 0, '07:05', '[DEMO] Consulta de emergencia abierta: la glucosa crítica del laboratorio espera revisión', 'Sudoración, taquicardia, glucosa capilar alta.', null),
  (11, 7,  1, 46, null, 'firmada', -2, '11:00', '[DEMO] Consulta previa al ingreso hospitalario de la paciente', 'Dolor abdominal persistente.', 'Ingreso programado para estudio.');

create temp table ddemo (k int, cie text, principal boolean, nota text) on commit drop;
insert into ddemo values
  (1, 'J02.9', true,  '[DEMO] Diagnóstico principal: solo uno por consulta'), (1, 'R50.9', false, '[DEMO] Diagnóstico secundario'),
  (2, 'I10',   true,  '[DEMO] Hipertensión esencial en control'),
  (3, 'K29.7', false, '[DEMO] En borrador: aún no se marca como principal'),
  (4, 'I10',   true,  '[DEMO] Control antiguo'), (5, 'I10', true, '[DEMO] Primer diagnóstico de hipertensión'),
  (7, 'E11.9', true,  '[DEMO] Sospecha de diabetes pendiente de laboratorio'),
  (8, 'N39.0', true,  '[DEMO] Infección urinaria a confirmar con examen de orina'),
  (9, 'M54.5', true,  '[DEMO] Lumbago'),
  (10,'R50.9', false, '[DEMO] Aún sin diagnóstico principal'),
  (11,'R10.4', true,  '[DEMO] Dolor abdominal que motivó el ingreso');

create temp table rdemo (k int, med text, dosis text, via text, frec text, dur text, indic text) on commit drop;
insert into rdemo values
  (1, 'Acetaminofén 500 mg tabletas', '1 tableta', 'oral', 'cada 8 horas', '3 días', '[DEMO] Receta de la consulta firmada: sus renglones ya no se pueden editar'),
  (1, 'Loratadina 10 mg tabletas', '1 tableta', 'oral', 'cada 24 horas', '5 días', null),
  (2, 'Losartán 50 mg tabletas', '1 tableta', 'oral', 'cada 24 horas', '90 días', '[DEMO] Tratamiento crónico'),
  (4, 'Losartán 50 mg tabletas', '1 tableta', 'oral', 'cada 24 horas', '30 días', null),
  (7, 'Metformina 500 mg tabletas', '1 tableta', 'oral', 'cada 12 horas', '30 días', '[DEMO] Se indicó antes del resultado como medida provisional');

create temp table sdemo (k int, ps int, pd int, fc int, fr int, tt numeric, sat int, peso numeric, talla numeric) on commit drop;
insert into sdemo values
  (1, 118, 76, 88, 18, 38.2, 97, 71.5, 172), (2, 148, 92, 76, 16, 36.6, 97, 82.0, 168), (3, 124, 80, 82, 17, 36.8, 98, 80.5, 175),
  (4, 156, 96, 78, 16, 36.5, 96, 83.5, 168), (5, 162, 100, 80, 16, 36.5, 97, 84.0, 168), (7, 128, 82, 90, 18, 36.7, 97, 69.0, 160),
  (8, 122, 78, 86, 18, 37.4, 98, 78.0, 176), (9, 126, 82, 74, 16, 36.5, 98, 76.5, 165), (11, 124, 80, 88, 18, 36.8, 98, 64.0, 160),
  (10, 138, 88, 112, 22, 37.1, 95, 87.0, 174);

-- Volumen: consultas del historial, de hoy y de origen de ingresos. Cada una trae diagnóstico, signos y, si se firmó, receta.
-- Consulta firmada = fin 'firmada'; las de hoy con la consulta en curso quedan 'abierta' (borrador) sin diagnóstico principal.
insert into kdemo
select c.n, c.pac, c.med, c.n, case when c.k in (65, 66, 67) then c.n end,
       case when c.n = 165 then 'abierta' else 'firmada' end, c.dd, c.hora,
       '[DEMO] ' || vin.motivo || case c.tipo when 'cron1' then ' (control anterior del paciente crónico)' when 'cron2' then ' (primer control del paciente crónico)' else '' end,
       vin.examen, case when c.n = 165 then null else vin.plan end
from vcita c join vcl l on l.k = c.k join vin on vin.v = l.v
where c.tipo in ('hist', 'cron1', 'cron2', 'orig') or c.n in (165, 166, 167)
union all
select 100 + t.k, 27 + t.k, t.med, null, 100 + t.k, case when t.k = 72 then 'abierta' else 'firmada' end, 0, time '07:30',
       '[DEMO] ' || vin.motivo || ' (consulta de emergencia)', vin.examen, case when t.k = 72 then null else vin.plan end
from (values (72, 3, 20), (73, 3, 21), (76, 16, 22)) t(k, med, v) join vin on vin.v = t.v;

insert into ddemo
select c.n, case when s.o = 1 then vin.cie1 else vin.cie2 end, s.o = 1 and c.n not in (165, 172),
       '[DEMO] ' || case when s.o = 1 then vin.nota1 else vin.nota2 end
from (select n, k from vcita where tipo in ('hist', 'cron1', 'cron2', 'orig') or n in (165, 166, 167)
      union all select 100 + k, k from (values (72), (73), (76)) t(k)) c
join vcl l on l.k = c.k
join vin on vin.v = case when c.n in (172, 173, 176) then (case c.n when 172 then 20 when 173 then 21 else 22 end) else l.v end
cross join (values (1), (2)) s(o)
where s.o = 1 or vin.cie2 is not null;

insert into rdemo
select c.n, case when s.o = 1 then vin.med1 else vin.med2 end, case when s.o = 1 then vin.dosis1 else vin.dosis2 end,
       case when s.o = 1 then vin.via1 else vin.via2 end, case when s.o = 1 then vin.frec1 else vin.frec2 end,
       case when s.o = 1 then vin.dur1 else vin.dur2 end,
       case when s.o = 1 and c.n % 5 = 0 then '[DEMO] Receta entregada al paciente con indicaciones por escrito' end
from (select n, k from vcita where tipo in ('hist', 'cron1', 'cron2', 'orig') or n in (166, 167)
      union all select 173, 73 union all select 176, 76) c
join vcl l on l.k = c.k
join vin on vin.v = case c.n when 173 then 21 when 176 then 22 else l.v end
cross join (values (1), (2)) s(o)
where s.o = 1 or vin.med2 is not null;

-- Signos de cada consulta (los crónicos muestran la presión bajando con el tratamiento: más alta en el control más antiguo).
insert into sdemo
select c.n,
       vin.ps + case c.tipo when 'cron2' then 14 when 'cron1' then 7 else 0 end + mod(c.k, 7) - 3,
       vin.pd + case c.tipo when 'cron2' then 8 when 'cron1' then 4 else 0 end + mod(c.k, 5) - 2,
       vin.fc + mod(c.k, 9) - 4, vin.fr, vin.tt + case when vin.tt < 37.5 then (mod(c.k, 4) - 2) / 10.0 else 0 end, vin.sat,
       case when l.edad < 15 then 8 + l.edad * 3 else 52 + mod(c.k * 7, 40) + case c.tipo when 'cron2' then 3 when 'cron1' then 1.5 else 0 end end,
       case when l.edad < 15 then 70 + l.edad * 6 when l.sexo = 'femenino' then 150 + mod(c.k * 3, 22) else 160 + mod(c.k * 3, 25) end
from (select n, k, tipo from vcita where tipo in ('hist', 'cron1', 'cron2', 'orig') or n in (165, 166, 167)
      union all select 172, 72, 'hoy' union all select 173, 73, 'hoy' union all select 176, 76, 'hoy') c
join vcl l on l.k = c.k
join vin on vin.v = case c.n when 172 then 20 when 173 then 21 when 176 then 22 else l.v end;

do $$
declare
  kk record;
  v_id uuid;
  v_cita uuid;
  v_ticket uuid;
  v_med uuid;
  v_inicio timestamptz;
  v_receta uuid;
  d record;
begin
  for kk in select * from kdemo order by n loop
    v_id := pg_temp.did('0006', kk.n);
    continue when exists (select 1 from atencion.consulta where id = v_id);
    v_med := case kk.med when 0 then pg_temp.persona('MED') else pg_temp.did('0002', kk.med) end;
    v_cita := (select id from atencion.cita where id = pg_temp.did('0004', kk.cita));
    v_ticket := (select id from atencion.ticket_fila where id = pg_temp.did('0005', kk.ticket));
    continue when v_med is null or (v_cita is null and v_ticket is null);
    v_inicio := least(now() - interval '1 minute', pg_temp.tl(pg_temp.hoy() + kk.dd, kk.hora));
    -- Se crea abierta para poder agregar hijos; después se firma (lo firmado ya no admite hijos nuevos).
    insert into atencion.consulta (id, paciente_id, medico_id, consultorio_id, ticket_id, cita_id, motivo, examen_fisico, plan, estado, iniciada_en)
    values (v_id, pg_temp.did('0001', kk.pac), v_med, pg_temp.espacio('C-101'), v_ticket, v_cita, kk.motivo, kk.examen, kk.plan, 'abierta', v_inicio);
    for d in select * from ddemo where ddemo.k = kk.n loop
      insert into atencion.diagnostico (id, consulta_id, cie10, principal, nota)
      values (pg_temp.did('0040', kk.n * 10 + (select count(*) from atencion.diagnostico where consulta_id = v_id)::int), v_id, d.cie, d.principal, d.nota);
    end loop;
    if exists (select 1 from rdemo where rdemo.k = kk.n) then
      v_receta := pg_temp.did('0041', kk.n);
      insert into atencion.receta (id, consulta_id, emitida_en) values (v_receta, v_id, least(now(), v_inicio + interval '15 minutes'));
      insert into atencion.receta_item (id, receta_id, medicamento, dosis, via, frecuencia, duracion, indicaciones)
      select pg_temp.did('0042', kk.n * 10 + (row_number() over ())::int), v_receta, r.med, r.dosis, r.via, r.frec, r.dur, r.indic
      from rdemo r where r.k = kk.n;
    end if;
    insert into atencion.signos_vitales (id, paciente_id, consulta_id, tomado_por, tomado_en, pa_sistolica, pa_diastolica, fc, fr, temperatura, sat_o2, peso_kg, talla_cm)
    select pg_temp.did('0043', kk.n), pg_temp.did('0001', kk.pac), v_id, pg_temp.actor('AST'), v_inicio - interval '10 minutes',
           s.ps, s.pd, s.fc, s.fr, s.tt, s.sat, s.peso, s.talla
    from sdemo s where s.k = kk.n;
    insert into atencion.relacion_atencion (id, paciente_id, profesional_id, origen, origen_id, vigencia)
    values (pg_temp.did('0045', kk.n), pg_temp.did('0001', kk.pac), v_med, 'consulta', v_id, tstzrange(v_inicio, v_inicio + interval '30 days'));
    if kk.fin in ('firmada', 'error') then
      update atencion.consulta set estado = 'firmada', firmada_en = least(now(), v_inicio + interval '25 minutes'), version = 2 where id = v_id;
    end if;
    if kk.fin = 'error' then
      update atencion.consulta set estado = 'ingresada_por_error', version = 3 where id = v_id;
    end if;
  end loop;
end $$;

-- Una consulta firmada se corrige con addendum: guarda el original y el motivo.
insert into atencion.addendum (id, consulta_id, autor_id, motivo, texto, original, creado_en)
select pg_temp.did('0044', 1), c.id, pg_temp.actor('MED'),
       '[DEMO] Corrección de la dosis indicada en el plan',
       'Se aclara que el antipirético es cada 8 horas y no cada 6; el resto del plan no cambia.',
       jsonb_build_object('plan', c.plan, 'motivo', c.motivo), now()
from atencion.consulta c where c.id = pg_temp.did('0006', 2)
on conflict do nothing;

-- ---------------------------------------------------------------------------------------------------------
-- 8. Laboratorio: órdenes en todos los estados (rangos y catálogo vienen de seed.sql)
-- ---------------------------------------------------------------------------------------------------------
create temp table odemo (n int primary key, pac int, consulta int, admision int, med int, prio text, estado text, hace interval,
  muestra boolean, cancel text, revisada boolean, items text[]) on commit drop;
insert into odemo values
  (1, 3,  1,    null, 0, 'rutina',  'completado', interval '3 hours', true,  null, true,  array['HEMO']),
  (2, 5,  3,    null, 0, 'urgente', 'pendiente',  interval '20 minutes', false, null, false, array['HEMO']),
  (3, 19, 7,    null, 1, 'rutina',  'en_proceso', interval '1 day', true,  null, false, array['QB']),
  (4, 20, 8,    null, 1, 'rutina',  'completado', interval '1 day', true,  null, false, array['EGO']),
  (5, 21, 9,    null, 1, 'rutina',  'cancelado',  interval '1 day', false, '[DEMO] Orden cancelada: muestra insuficiente, se pidió una nueva toma', false, array['QB']),
  (6, 22, 10,   null, 0, 'urgente', 'completado', interval '2 hours', true,  null, false, array['GLU']),
  (7, 7,  null, 1,    1, 'rutina',  'en_proceso', interval '5 hours', true,  null, false, array['HEMO','GLU']);

create temp table resdemo (o int, cod text, valor numeric, texto text) on commit drop;
insert into resdemo values
  (1, 'HB', 14.1, null), (1, 'HTO', 43, null), (1, 'LEU', 13.8, null), (1, 'PLQ', 280, null),
  (3, 'GLU', 118, null),
  (4, 'EGO-ASP', null, 'Turbio, color amarillo oscuro'), (4, 'EGO-DEN', 1.024, null),
  (6, 'GLU', 452, null),
  (7, 'HB', 11.2, null);

-- Volumen: órdenes de laboratorio de las consultas (todas las firmadas con examen en su viñeta), canceladas, de hoy y de hospitalizados.
-- Cada orden cuelga de una consulta o admisión del mismo paciente; los resultados salen de esas órdenes.
insert into odemo
select c.n, c.pac, c.n, null::int, c.med, 'rutina', 'completado', -c.dd * interval '1 day', true, null::text,
       not (c.k % 7 = 0 and c.dd >= -14), array[vin.lab]
from vcita c join vcl l on l.k = c.k join vin on vin.v = l.v
where c.tipo = 'hist' and vin.lab is not null and l.edad >= 18
union all
select 700 + c.k, c.pac, c.n, null, c.med, 'rutina', 'cancelado', -c.dd * interval '1 day', false,
       '[DEMO] Orden cancelada: muestra hemolizada, se pidió una nueva toma', false, array['QB']
from vcita c join vcl l on l.k = c.k where c.tipo = 'hist' and c.k in (20, 31) and l.edad >= 18
union all
select * from (values
  (765, 92,  165, null::int, 1,  'rutina',  'en_proceso', interval '40 minutes', true,  null::text, false, array['HEMO']),
  (766, 93,  166, null, 30, 'rutina',  'completado', interval '2 hours',    true,  null, false, array['GLU']),
  (769, 96,  169, null, 1,  'rutina',  'pendiente',  interval '20 hours',   false, null, false, array['HEMO']),
  (772, 99,  172, null, 3,  'urgente', 'pendiente',  interval '15 minutes', false, null, false, array['GLU']),
  (773, 100, 173, null, 3,  'urgente', 'completado', interval '3 hours',    true,  null, false, array['HEMO']),
  (875, 102, null, 175, 1,  'rutina',  'completado', interval '10 hours',   true,  null, true,  array['QB']),
  (876, 103, null, 176, 16, 'urgente', 'pendiente',  interval '0 minutes',  false, null, false, array['GLU']),
  (877, 104, null, 177, 30, 'rutina',  'completado', interval '8 hours',    true,  null, false, array['HEMO']),
  (878, 105, null, 178, 31, 'urgente', 'completado', interval '6 hours',    true,  null, false, array['QB']),
  (879, 106, null, 179, 31, 'rutina',  'en_proceso', interval '3 hours',    true,  null, false, array['HEMO']),
  (880, 107, null, 180, 31, 'rutina',  'pendiente',  interval '40 minutes', false, null, false, array['EGO']),
  (881, 108, null, 181, 30, 'rutina',  'completado', interval '20 hours',   true,  null, true,  array['LIP']),
  (882, 109, null, 182, 1,  'rutina',  'completado', interval '30 hours',   true,  null, true,  array['QB']),
  (885, 112, null, 185, 30, 'rutina',  'completado', interval '6 days',     true,  null, true,  array['HEMO']),
  (887, 114, null, 187, 31, 'rutina',  'cancelado',  interval '3 days',     false, '[DEMO] Orden cancelada: el paciente no pudo dar la muestra en ayunas', false, array['QB'])
) x(n, pac, consulta, admision, med, prio, estado, hace, muestra, cancel, revisada, items);

-- Resultados de esas órdenes. Un paciente de cada nueve (k múltiplo de 9) y los hospitalizados 78 y el de emergencia traen un valor crítico.
create temp table hojas_demo (panel text, cod text, ord int) on commit drop;
insert into hojas_demo values
  ('HEMO', 'HB', 1), ('HEMO', 'HTO', 2), ('HEMO', 'LEU', 3), ('HEMO', 'PLQ', 4),
  ('QB', 'GLU', 1), ('QB', 'CREA', 2), ('QB', 'UREA', 3), ('QB', 'K', 4), ('QB', 'NA', 5),
  ('LIP', 'COLT', 1), ('LIP', 'TG', 2), ('EGO', 'EGO-ASP', 1), ('EGO', 'EGO-DEN', 2), ('GLU', 'GLU', 1),
  ('PRENATAL', 'HB', 1), ('PRENATAL', 'HTO', 2), ('PRENATAL', 'LEU', 3), ('PRENATAL', 'PLQ', 4), ('PRENATAL', 'GLU', 5),
  ('PRENATAL', 'EGO-ASP', 6), ('PRENATAL', 'EGO-DEN', 7);

insert into resdemo
select o.n, h.cod,
       case h.cod
         when 'HB' then case when crit.es then 6.4 when p.sexo = 'femenino' then 11.0 + mod(p.k * 7, 45) / 10.0 else 12.5 + mod(p.k * 7, 50) / 10.0 end
         when 'HTO' then case when crit.es then 19 else 33 + mod(p.k * 5, 18) end
         when 'LEU' then 4.5 + mod(p.k * 3, 90) / 10.0
         when 'PLQ' then 140 + mod(p.k * 13, 260)
         when 'GLU' then case when crit.es then 420 + mod(p.k, 60) else 78 + mod(p.k * 11, 90) end
         when 'CREA' then 0.6 + mod(p.k * 3, 10) / 10.0
         when 'UREA' then 12 + mod(p.k * 7, 20)
         when 'K' then 3.8 + mod(p.k, 12) / 10.0
         when 'NA' then 137 + mod(p.k, 8)
         when 'COLT' then 170 + mod(p.k * 7, 90)
         when 'TG' then 100 + mod(p.k * 9, 160)
         when 'EGO-DEN' then 1.010 + mod(p.k, 18) / 1000.0 end,
       case when h.cod = 'EGO-ASP' then pg_temp.pick(array['Amarillo claro, transparente', 'Amarillo, ligeramente turbio', 'Turbio, color amarillo oscuro'], p.k) end
from odemo o
join vol p on p.n = o.pac
cross join lateral (select (p.k % 9 = 0 and o.n < 700) or o.n in (773, 878) as es) crit
join hojas_demo h on h.panel = o.items[1]
where o.n >= 100 and o.estado in ('completado', 'en_proceso') and (o.estado = 'completado' or h.ord <= 2);

do $$
declare
  o record;
  v_orden uuid;
  v_med uuid;
  v_creada timestamptz;
begin
  for o in select * from odemo order by n loop
    v_orden := pg_temp.did('0050', o.n);
    continue when exists (select 1 from laboratorio.orden where id = v_orden);
    v_med := case o.med when 0 then pg_temp.persona('MED') else pg_temp.did('0002', o.med) end;
    continue when v_med is null
      or (o.admision is null and not exists (select 1 from atencion.consulta where id = pg_temp.did('0006', o.consulta)));
    -- La orden nunca es anterior a su consulta ni queda en el futuro.
    v_creada := least(now(), greatest(now() - o.hace,
      coalesce((select iniciada_en from atencion.consulta where id = pg_temp.did('0006', o.consulta)) + interval '5 minutes', now() - o.hace)));
    insert into laboratorio.orden (id, consulta_id, admision_id, paciente_id, medico_id, prioridad, estado, motivo_cancelacion,
      muestra_tomada_en, muestra_tomada_por, completada_en, completada_por, revisada_en, revisada_por, creada_en)
    values (v_orden,
      (select id from atencion.consulta where id = pg_temp.did('0006', o.consulta)),
      case when o.admision is not null then pg_temp.did('0060', o.admision) end,
      pg_temp.did('0001', o.pac), v_med, o.prio, o.estado, o.cancel,
      case when o.muestra then least(now(), v_creada + interval '10 minutes') end, case when o.muestra then pg_temp.actor('LAB') end,
      case when o.estado = 'completado' then least(now(), v_creada + interval '90 minutes') end, case when o.estado = 'completado' then pg_temp.actor('LAB') end,
      case when o.revisada then least(now(), v_creada + interval '120 minutes') end, case when o.revisada then pg_temp.actor('MED') end,
      v_creada);
    insert into laboratorio.orden_item (id, orden_id, examen_id, pedido_como)
    select pg_temp.did('0051', o.n * 100 + (row_number() over (order by e.codigo, h.id))::int), v_orden, h.id,
           case when e.es_panel then e.id end
    from unnest(o.items) p(cod)
    join laboratorio.examen e on e.codigo = p.cod
    cross join lateral laboratorio.hojas(e.id) h(id)
    on conflict do nothing;
  end loop;
end $$;

-- Resultados con su marca calculada contra el rango de referencia vigente (igual que la API).
insert into laboratorio.resultado (orden_item_id, valor, texto, marca, rango_id, capturado_por, capturado_en, version)
select i.id, r.valor, r.texto,
       case when rr.id is null or r.valor is null then 'sin_rango'
            when rr.critico_bajo is not null and r.valor < rr.critico_bajo then 'critico_bajo'
            when rr.critico_alto is not null and r.valor > rr.critico_alto then 'critico_alto'
            when rr.minimo is not null and r.valor < rr.minimo then 'bajo'
            when rr.maximo is not null and r.valor > rr.maximo then 'alto'
            else 'normal' end,
       rr.id, pg_temp.actor('LAB'), least(now(), o.creada_en + interval '80 minutes'), 1
from resdemo r
join laboratorio.orden o on o.id = pg_temp.did('0050', r.o)
join laboratorio.examen e on e.codigo = r.cod
join laboratorio.orden_item i on i.orden_id = o.id and i.examen_id = e.id
join pacientes.paciente p on p.id = o.paciente_id
left join lateral (
  select x.* from laboratorio.rango_referencia x
  where x.examen_id = e.id and x.sexo in (p.sexo, 'cualquiera') and p.nacimiento is not null
    and x.edad_anios @> extract(year from age(pg_temp.hoy(), p.nacimiento))::int and x.vigencia @> pg_temp.hoy()
  order by (x.sexo = 'cualquiera') limit 1) rr on true
on conflict do nothing;

-- Un resultado corregido: la versión actual es 2 y el valor anterior queda en el historial.
do $$
declare
  v_item uuid;
begin
  select i.id into v_item from laboratorio.orden_item i join laboratorio.examen e on e.id = i.examen_id
  where i.orden_id = pg_temp.did('0050', 1) and e.codigo = 'LEU';
  if v_item is not null and not exists (select 1 from laboratorio.resultado_historial where orden_item_id = v_item) then
    insert into laboratorio.resultado_historial (orden_item_id, version, valor, marca, cambiado_por, cambiado_en, motivo)
    select v_item, 1, 31.8, 'critico_alto', pg_temp.actor('LAB'), r.capturado_en,
           '[DEMO] Corrección de un error de digitación: se capturó 31.8 en lugar de 13.8'
    from laboratorio.resultado r where r.orden_item_id = v_item;
    update laboratorio.resultado set version = 2 where orden_item_id = v_item;
  end if;
end $$;

-- ---------------------------------------------------------------------------------------------------------
-- 10. Ambulancia: solicitudes, servicios en varios estados con hitos, tripulación y bitácora
--     Un solo servicio activo por unidad: se crean los cerrados y al final el activo. Si ya hay un servicio
--     activo real, no se siembra ningún servicio (la unidad y su servicio real no se tocan).
-- ---------------------------------------------------------------------------------------------------------
insert into ambulancia.solicitud (id, canal, solicitante_usuario_id, paciente_id, direccion, latitud, longitud, municipio, motivo, telefono_contacto,
  estado, motivo_descarte, creada_en, resuelta_por, registrada_por)
select pg_temp.did('0071', s.n), s.canal, case when s.canal = 'app_paciente' then pg_temp.actor('PAC') end,
       case when s.pac is not null then pg_temp.did('0001', s.pac) end, s.dir, s.lat, s.lon, s.mun, s.motivo, s.tel, s.estado, s.descarte,
       now() - s.hace, case when s.estado <> 'por_confirmar' then pg_temp.actor('REC') end,
       case when s.canal = 'telefono' then pg_temp.actor('REC') end
from (values
  (1, 'app_paciente', 23,   'Col. Guadalupe #12, Soyapango', 13.7154, -89.1511, 'Soyapango', '[DEMO] Solicitud por confirmar: REC la confirma (y despacha JOP/PAR) o la descarta con motivo', '7222-0001', 'por_confirmar', null::text, interval '10 minutes'),
  (2, 'telefono',     null, 'Calle a Apopa, frente a la gasolinera', 13.8066, -89.1792, 'Apopa', '[DEMO] Llamada telefónica de una persona sin expediente: se registra aunque no se sepa quién es', '7222-0002', 'por_confirmar', null, interval '4 minutes'),
  (3, 'app_paciente', 22,   'Col. Centroamérica, Av. Las Palmas', 13.7040, -89.2053, 'San Salvador', '[DEMO] Solicitud confirmada: ya tiene su servicio completado', '7222-0003', 'confirmada', null, interval '3 days'),
  (4, 'telefono',     null, 'Col. Miramonte', 13.7167, -89.2250, 'San Salvador', '[DEMO] Llamada repetida de otra solicitud', '7222-0004', 'descartada', '[DEMO] Duplicada: ya existía la solicitud anterior', interval '2 days'),
  (5, 'app_paciente', null, 'Res. Las Colinas', 13.6870, -89.2480, 'Antiguo Cuscatlán', '[DEMO] La persona canceló porque llegó por sus medios', '7222-0005', 'cancelada', null, interval '1 day'),
  (6, 'app_paciente', 24,   'Col. El Cañaveral, Apopa', 13.8010, -89.1690, 'Apopa', '[DEMO] Solicitud confirmada con servicio en curso', '7222-0006', 'confirmada', null, interval '30 minutes'),
  -- Volumen: solicitudes que ya tienen su servicio completado o cerrado, y otras por confirmar, descartadas y canceladas.
  (7,  'telefono',     105,  'Carretera Panamericana km 12, Soyapango', 13.7280, -89.1330, 'Soyapango', '[DEMO] Accidente de tránsito con una persona atrapada: la solicitud terminó en ingreso hospitalario', '7222-0007', 'confirmada', null, interval '30 hours'),
  (8,  'telefono',     67,   'Col. Las Brisas, Soyapango', 13.7210, -89.1400, 'Soyapango', '[DEMO] Caída de un adulto mayor con dolor de cadera', '7222-0008', 'confirmada', null, interval '5 days'),
  (9,  'app_paciente', 89,   'Col. San Luis, Mejicanos', 13.7480, -89.2090, 'Mejicanos', '[DEMO] Dolor torácico desde la app del paciente', '7222-0009', 'confirmada', null, interval '6 days'),
  (10, 'app_paciente', 70,   'Col. Layco, San Salvador', 13.7120, -89.2150, 'San Salvador', '[DEMO] Mareo y desmayo breve; la unidad salió y la persona ya estaba mejor', '7222-0010', 'confirmada', null, interval '8 days'),
  (11, 'telefono',     null, 'Calle a Tonacatepeque, km 5', 13.7890, -89.1130, 'Tonacatepeque', '[DEMO] Persona con crisis convulsiva atendida en el sitio', '7222-0011', 'confirmada', null, interval '9 days'),
  (12, 'telefono',     84,   'Col. Montes de San Bartolo, Ilopango', 13.7000, -89.1100, 'Ilopango', '[DEMO] Parto en casa con sangrado: traslado urgente', '7222-0012', 'confirmada', null, interval '12 days'),
  (13, 'app_paciente', 66,   'Col. Santa Marta, Ciudad Delgado', 13.7300, -89.1700, 'Ciudad Delgado', '[DEMO] Solicitud nueva desde la app: REC la confirma o la descarta', '7222-0013', 'por_confirmar', null, interval '3 minutes'),
  (14, 'telefono',     null, 'Col. Zacamil, Mejicanos', 13.7450, -89.2230, 'Mejicanos', '[DEMO] Llamada sin expediente por una persona con fiebre alta', '7222-0014', 'por_confirmar', null, interval '8 minutes'),
  (15, 'telefono',     null, 'Col. Escalón, San Salvador', 13.7060, -89.2380, 'San Salvador', '[DEMO] Llamada de prueba del servicio telefónico', '7222-0015', 'descartada', '[DEMO] Llamada de prueba, no hay emergencia', interval '6 days'),
  (16, 'app_paciente', 75,   'Col. Flor Blanca, San Salvador', 13.7100, -89.2190, 'San Salvador', '[DEMO] El paciente canceló porque llegó en un vehículo particular', '7222-0016', 'cancelada', null, interval '2 days')
) s(n, canal, pac, dir, lat, lon, mun, motivo, tel, estado, descarte, hace)
on conflict do nothing;

-- Nombre que dio quien llamó (ficticio); la solicitud de la app toma el del paciente.
update ambulancia.solicitud set solicitante_nombre = case id
    when pg_temp.did('0071', 2) then 'Marta Elena Quintanilla'
    when pg_temp.did('0071', 4) then 'Rigoberto Alas Mejía'
    when pg_temp.did('0071', 7) then 'Ismael Antonio Cruz Ventura'
    when pg_temp.did('0071', 8) then 'Dora Alicia Rivas'
    when pg_temp.did('0071', 11) then 'Wilber Alfonso Mena'
    when pg_temp.did('0071', 12) then 'Nidia Esmeralda Funes'
    when pg_temp.did('0071', 14) then 'Marvin Alexander Pineda'
    when pg_temp.did('0071', 15) then 'Número de prueba (sin nombre real)' end
  where id in (pg_temp.did('0071', 2), pg_temp.did('0071', 4), pg_temp.did('0071', 7), pg_temp.did('0071', 8), pg_temp.did('0071', 11),
               pg_temp.did('0071', 12), pg_temp.did('0071', 14), pg_temp.did('0071', 15)) and solicitante_nombre is null;

do $$
declare
  v_unidad uuid;
  v_prev text;
  v_hay_activo boolean;
  s record;
  v_serv uuid;
  v_base timestamptz;
  h text;
  k int;
begin
  select id, estado into v_unidad, v_prev from ambulancia.unidad order by id limit 1;
  v_hay_activo := exists (select 1 from ambulancia.servicio where finalizado_en is null);
  if v_unidad is null or v_hay_activo then
    return;   -- sin unidad, o ya hay un servicio activo (propio o real): no se siembran servicios
  end if;

  for s in select * from (values
    (1, 3, 'emergencia_domicilio',         'roja',     22,   'Col. Centroamérica, Av. Las Palmas', 'Hospital Universitario, Emergencia', 'San Salvador', interval '3 days',
       array['salida','en_escena','trasladando','en_hospital','finalizado'], 'completado', null::text),
    (2, null, 'emergencia_domicilio',      'amarilla', null, 'Col. Miramonte', 'Hospital Universitario, Emergencia', 'San Salvador', interval '2 days',
       array['salida'], 'cancelado', '[DEMO] Cancelado en camino: la familia llevó al paciente por sus medios'),
    (3, null, 'emergencia_domicilio',      'verde',    null, 'Col. Escalón, Pje. 7', 'Hospital Universitario, Emergencia', 'San Salvador', interval '30 hours',
       array['salida','en_escena','finalizado'], 'sin_traslado', '[DEMO] Evaluado en el lugar: se queda en casa con indicaciones y firma'),
    (4, null, 'traslado_interhospitalario','amarilla', 10,   'Hospital Regional Norte (ficticio)', 'Hospital Universitario, Planta 3 VIP', 'Chalatenango', interval '4 days',
       array['salida','en_escena','trasladando','en_hospital','finalizado'], 'completado', null),
    (5, null, 'emergencia_domicilio',      'naranja',  null, 'Col. Médica', 'Hospital Universitario, Emergencia', 'San Salvador', interval '1 day',
       array['salida','en_escena'], 'rechaza_traslado', '[DEMO] El paciente rechazó el traslado y firmó el rechazo'),
    -- Volumen: servicios de los últimos días con paciente, solicitante y hitos completos (7 origina el ingreso 78).
    (7, 7, 'emergencia_domicilio',         'roja',     105, 'Carretera Panamericana km 12, Soyapango', 'Hospital Universitario, Emergencia', 'Soyapango', interval '30 hours',
       array['salida','en_escena','trasladando','en_hospital','finalizado'], 'completado', null),
    (8, 8, 'emergencia_domicilio',         'amarilla', 67,  'Col. Las Brisas, Soyapango', 'Hospital Universitario, Emergencia', 'Soyapango', interval '5 days',
       array['salida','en_escena','trasladando','en_hospital','finalizado'], 'completado', null),
    (9, 9, 'emergencia_domicilio',         'naranja',  89,  'Col. San Luis, Mejicanos', 'Hospital Universitario, Emergencia', 'Mejicanos', interval '6 days',
       array['salida','en_escena','trasladando','en_hospital','finalizado'], 'completado', null),
    (10, null, 'traslado_interhospitalario','amarilla', 117, 'Hospital Universitario, Planta 4', 'Hospital de Especialidades (ficticio)', 'San Salvador', interval '7 days',
       array['salida','en_escena','trasladando','en_hospital','finalizado'], 'completado', null),
    (11, 10, 'emergencia_domicilio',       'verde',    70,  'Col. Layco, San Salvador', 'Hospital Universitario, Emergencia', 'San Salvador', interval '8 days',
       array['salida'], 'cancelado', '[DEMO] Cancelado en camino: la persona ya se sentía mejor y la familia la llevó a su médico'),
    (12, 11, 'emergencia_domicilio',       'naranja',  null, 'Calle a Tonacatepeque, km 5', 'Hospital Universitario, Emergencia', 'Tonacatepeque', interval '9 days',
       array['salida','en_escena','finalizado'], 'sin_traslado', '[DEMO] Crisis resuelta en el sitio: la persona quedó en casa con su familia y firmó'),
    (13, null, 'emergencia_domicilio',     'naranja',  55,  'Col. Montserrat, San Salvador', 'Hospital Universitario, Emergencia', 'San Salvador', interval '10 days',
       array['salida','en_escena'], 'rechaza_traslado', '[DEMO] La paciente rechazó el traslado y firmó el rechazo'),
    (14, 12, 'emergencia_domicilio',       'roja',     84,  'Col. Montes de San Bartolo, Ilopango', 'Hospital Universitario, Emergencia', 'Ilopango', interval '12 days',
       array['salida','en_escena','trasladando','en_hospital','finalizado'], 'completado', null)
  ) x(n, sol, tipo, prio, pac, origen, destino, mun, hace, hit, fin, motivo) loop
    v_serv := pg_temp.did('0070', s.n);
    continue when exists (select 1 from ambulancia.servicio where id = v_serv);
    v_base := now() - s.hace;
    insert into ambulancia.servicio (id, unidad_id, solicitud_id, tipo, prioridad, paciente_id, origen, destino, municipio, despachado_por, despachado_en, clave_idempotencia)
    values (v_serv, v_unidad, case when s.sol is not null then pg_temp.did('0071', s.sol) end, s.tipo, s.prio,
            case when s.pac is not null then pg_temp.did('0001', s.pac) end, s.origen, s.destino, s.mun, pg_temp.actor('JOP'), v_base, 'demo-servicio-' || s.n);
    for k in 1..cardinality(s.hit) loop
      h := s.hit[k];
      insert into ambulancia.hito (id, servicio_id, tipo, ocurrido_en, registrado_en, registrado_por, clave_idempotencia)
      values (pg_temp.did('0072', s.n * 10 + k), v_serv, h, v_base + (k * 12) * interval '1 minute', v_base + (k * 12) * interval '1 minute',
              pg_temp.actor('PAR'), 'demo-hito-' || s.n || '-' || h);
    end loop;
    insert into ambulancia.tripulacion (servicio_id, persona_id, funcion) values
      (v_serv, case s.n % 3 when 0 then pg_temp.did('0002', 42) when 1 then pg_temp.did('0002', 41) else coalesce(pg_temp.persona('PAR'), pg_temp.did('0002', 12)) end, 'paramedico'),
      (v_serv, case s.n % 2 when 0 then pg_temp.did('0002', 13) else pg_temp.did('0002', 43) end, 'motorista')
    on conflict do nothing;
    if s.prio = 'roja' then
      insert into ambulancia.tripulacion (servicio_id, persona_id, funcion) values (v_serv, pg_temp.did('0002', 7), 'enfermero') on conflict do nothing;
    end if;
    -- Bitácora de la unidad: sale y regresa a la base.
    insert into ambulancia.cambio_estado (unidad_id, desde, hacia, motivo, por, en) values
      (v_unidad, 'disponible', 'en_servicio', '[DEMO] Despacho del servicio ' || s.n || ': la unidad pasa a En Servicio', pg_temp.actor('JOP'), v_base),
      (v_unidad, 'en_servicio', 'disponible', '[DEMO] Servicio ' || s.n || ' cerrado: la unidad regresa a la base', pg_temp.actor('JOP'),
         v_base + (cardinality(s.hit) * 12 + 5) * interval '1 minute');
    if cardinality(s.hit) > 1 then
      insert into ambulancia.reporte_prehospital (id, servicio_id, motivo, prioridad, signos, llegada_estimada, enviado_por, capturado_en, recibido_en, recibido_por, clave_idempotencia)
      values (pg_temp.did('0073', s.n), v_serv, '[DEMO] Reporte prehospitalario enviado desde la app del paramédico', s.prio,
              jsonb_build_object('paSistolica', 118 + s.n * 4, 'paDiastolica', 72 + s.n * 2, 'fc', 88 + s.n * 2, 'sat', 98 - s.n % 7),
              v_base + interval '40 minutes', coalesce(pg_temp.actor('PAR'), pg_temp.did('0099', 9)),
              v_base + interval '20 minutes', v_base + interval '21 minutes', pg_temp.actor('REC'), 'demo-reporte-' || s.n)
      on conflict do nothing;
    end if;
    update ambulancia.servicio set finalizado_en = v_base + (cardinality(s.hit) * 12 + 5) * interval '1 minute', estado_final = s.fin, motivo_final = s.motivo
    where id = v_serv;
  end loop;

  -- Servicio activo: la unidad pasa a En Servicio y se guarda su estado anterior para restaurarlo al limpiar.
  v_serv := pg_temp.did('0070', 6);
  if not exists (select 1 from ambulancia.servicio where id = v_serv) then
    v_base := now() - interval '20 minutes';
    insert into ambulancia.servicio (id, unidad_id, solicitud_id, tipo, prioridad, paciente_id, origen, destino, municipio, despachado_por, despachado_en, clave_idempotencia)
    values (v_serv, v_unidad, pg_temp.did('0071', 6), 'emergencia_domicilio', 'roja', pg_temp.did('0001', 24), 'Col. El Cañaveral, Apopa',
            'Hospital Universitario, Emergencia', 'Apopa', pg_temp.actor('JOP'), v_base, 'demo-servicio-6');
    insert into ambulancia.hito (id, servicio_id, tipo, ocurrido_en, registrado_en, registrado_por, clave_idempotencia) values
      (pg_temp.did('0072', 61), v_serv, 'salida',    v_base + interval '2 minutes',  v_base + interval '2 minutes',  pg_temp.actor('PAR'), 'demo-hito-6-salida'),
      (pg_temp.did('0072', 62), v_serv, 'en_escena', v_base + interval '11 minutes', v_base + interval '11 minutes', pg_temp.actor('PAR'), 'demo-hito-6-en_escena');
    insert into ambulancia.tripulacion (servicio_id, persona_id, funcion) values
      (v_serv, pg_temp.persona('PAR'), 'paramedico'), (v_serv, pg_temp.did('0002', 13), 'motorista') on conflict do nothing;
    insert into ambulancia.ubicacion (servicio_id, latitud, longitud, capturada_en) values
      (v_serv, 13.7100, -89.2000, v_base + interval '3 minutes'), (v_serv, 13.7500, -89.1900, v_base + interval '7 minutes'),
      (v_serv, 13.7900, -89.1700, v_base + interval '11 minutes'), (v_serv, 13.8010, -89.1690, v_base + interval '14 minutes');
    insert into ambulancia.cambio_estado (unidad_id, desde, hacia, motivo, por, en) values
      (v_unidad, v_prev, v_prev, '[DEMO] Estado previo de la unidad al sembrar los datos de demostración (limpiar-demo.sql lo restaura)', pg_temp.actor('JOP'), now()),
      (v_unidad, v_prev, 'disponible', '[DEMO] Hay paramédico de turno: la unidad queda disponible', pg_temp.actor('JOP'), now() - interval '21 minutes'),
      (v_unidad, 'disponible', 'en_servicio', '[DEMO] Despacho de la solicitud confirmada: la unidad pasa a En Servicio', pg_temp.actor('JOP'), v_base);
    update ambulancia.unidad set estado = 'en_servicio' where id = v_unidad and estado <> 'en_servicio';
  end if;
end $$;

-- ---------------------------------------------------------------------------------------------------------
-- 9. Hospitalización (va después de la ambulancia porque un ingreso puede nacer de un servicio): admisiones, camas ocupadas / reservada / bloqueada / en limpieza, traslado y altas
-- ---------------------------------------------------------------------------------------------------------
insert into hospitalizacion.admision (id, paciente_id, origen, origen_id, categoria_pedida, sexo_paciente, aislamiento, medico_tratante_id,
  fecha_programada, estado, creado_por, creado_en, motivo, tipo_aislamiento, inestable, postquirurgico, visitas_permitidas, visitantes_max)
select pg_temp.did('0060', a.n), pg_temp.did('0001', a.pac), a.origen, og.id,
       a.cat, p.sexo, a.aisl, case a.tratante when 0 then pg_temp.persona('MED') else pg_temp.did('0002', a.tratante) end,
       case a.origen when 'cita' then now() + a.prog end, a.estado, pg_temp.actor('MED'),
       -- El ingreso nunca es anterior a su origen (consulta, cita, número de emergencia o servicio de ambulancia).
       least(now(), greatest(now() - a.hace, coalesce(pg_temp.origen_ts(a.origen, og.id), now() - a.hace) + interval '10 minutes')),
       '[DEMO] ' || a.motivo, case when a.aisl then 'contacto' end, a.n = 3, a.n = 2, a.n <> 3, case when a.n = 3 then 0 when a.cat = 'vip' then 2 else 1 end
from (values
  (1, 7,  'consulta',   'semiprivada', false, 1, interval '0',      'hospitalizado',  interval '2 days',  'Observación por cuadro respiratorio'),
  (2, 8,  'cita',       'semiprivada', false, 1, interval '-3 days', 'hospitalizado', interval '3 days',  'Cirugía programada, recuperación'),
  (3, 9,  'emergencia', 'semiprivada', true,  3, interval '0',      'hospitalizado',  interval '1 day',   'Fiebre alta con aislamiento'),
  (4, 10, 'ambulancia', 'vip',         false, 0, interval '0',      'alta_firmada',   interval '4 days',  'Traslado por trauma de miembro'),
  (5, 11, 'cita',       'vip',         false, 0, interval '1 day',  'pendiente_cama', interval '3 hours', 'Ingreso programado por control'),
  (6, 12, 'cita',       'semiprivada', false, 1, interval '-3 days', 'egresado',      interval '3 days',  'Tratamiento endovenoso completado')
) a(n, pac, origen, cat, aisl, tratante, prog, estado, hace, motivo)
join pacientes.paciente p on p.id = pg_temp.did('0001', a.pac)
cross join lateral (select case a.origen when 'emergencia' then pg_temp.did('0005', 10) when 'ambulancia' then pg_temp.did('0070', 4)
                                          when 'consulta' then pg_temp.did('0006', 11) when 'cita' then pg_temp.did('0004', 50 + a.n) end as id) og
where case a.tratante when 0 then pg_temp.persona('MED') else pg_temp.did('0002', a.tratante) end is not null
on conflict do nothing;

-- Ocupaciones: abiertas (sin fin) o cerradas con su motivo. Un traslado: la admisión 2 pasó de HAB-403 B a HAB-401 B.
insert into hospitalizacion.ocupacion_cama (id, admision_id, cama_id, habitacion_id, categoria, periodo, motivo_fin, asignado_por)
select pg_temp.did('0061', o.n), pg_temp.did('0060', o.adm), pg_temp.espacio(o.cama), pg_temp.espacio(o.hab), o.cat,
       tstzrange(greatest(now() - o.desde, ad.creado_en), now() - o.hasta, '[)'), o.fin, pg_temp.actor('ENF')
from (values
  (1, 1, 'HAB-401-A', 'HAB-401', 'semiprivada', interval '2 days',  null::interval,         null),
  (2, 2, 'HAB-403-B', 'HAB-403', 'semiprivada', interval '3 days',  interval '1 day',       'traslado'),
  (3, 2, 'HAB-401-B', 'HAB-401', 'semiprivada', interval '1 day',   null::interval,         null),
  (4, 3, 'HAB-402-A', 'HAB-402', 'semiprivada', interval '1 day',   null::interval,         null),
  (5, 4, 'VIP-401-A', 'VIP-401', 'vip',         interval '4 days',  null::interval,         null),
  (6, 6, 'HAB-403-A', 'HAB-403', 'semiprivada', interval '3 days',  interval '2 hours',     'egreso')
) o(n, adm, cama, hab, cat, desde, hasta, fin)
join hospitalizacion.admision ad on ad.id = pg_temp.did('0060', o.adm)
on conflict do nothing;

insert into hospitalizacion.traslado (id, admision_id, ocupacion_origen_id, ocupacion_destino_id, motivo, realizado_por, realizado_en)
select pg_temp.did('0063', 1), pg_temp.did('0060', 2), pg_temp.did('0061', 2), pg_temp.did('0061', 3),
       '[DEMO] Traslado de cama: la paciente pasó a la habitación con su compañera de la misma planta (no aplica a VIP)',
       pg_temp.actor('ENF'), now() - interval '1 day'
where exists (select 1 from hospitalizacion.ocupacion_cama where id = pg_temp.did('0061', 2))
  and exists (select 1 from hospitalizacion.ocupacion_cama where id = pg_temp.did('0061', 3))
on conflict do nothing;

insert into hospitalizacion.reserva_cama (id, admision_id, cama_id, periodo, estado)
select pg_temp.did('0062', 1), pg_temp.did('0060', 5), pg_temp.espacio('VIP-402-A'), tstzrange(now(), now() + interval '8 hours', '[)'), 'activa'
where exists (select 1 from hospitalizacion.admision where id = pg_temp.did('0060', 5))
on conflict do nothing;

insert into hospitalizacion.alta (admision_id, tipo, firmada_por, firmada_en, resumen, pendientes)
select pg_temp.did('0060', v.n), 'medica', pg_temp.actor('MED'), now() - v.hace, v.resumen, v.pend::jsonb
from (values
  (4, interval '3 hours', '[DEMO] Alta firmada: la cama VIP-401 sigue ocupada hasta la salida física del paciente',
      '[{"descripcion": "Control en consulta externa en siete días", "responsable": "Consulta general"}]'),
  (6, interval '3 hours', '[DEMO] Alta médica ya completada: el paciente salió y la cama pasó a limpieza', '[]')
) v(n, hace, resumen, pend)
where exists (select 1 from hospitalizacion.admision where id = pg_temp.did('0060', v.n))
on conflict do nothing;

insert into hospitalizacion.nota_enfermeria (id, admision_id, autor_id, texto, creada_en)
select pg_temp.did('0064', v.n), pg_temp.did('0060', v.adm), pg_temp.actor('ENF'), v.texto,
       least(now(), greatest(now() - v.hace, ad.creado_en + interval '5 minutes'))
from (values
  (1, 1, '[DEMO] Nota de enfermería: paciente estable, tolera la dieta, sin dolor.', interval '6 hours'),
  (2, 2, '[DEMO] Nota de enfermería: se trasladó de cama; ayuda para levantarse.', interval '20 hours'),
  (3, 3, '[DEMO] Nota de enfermería: aislamiento de contacto; la cama vecina queda bloqueada.', interval '5 hours'),
  (4, 4, '[DEMO] Nota de enfermería: familia informada del alta, espera transporte.', interval '1 hour')
) v(n, adm, texto, hace)
join hospitalizacion.admision ad on ad.id = pg_temp.did('0060', v.adm)
on conflict do nothing;

insert into atencion.signos_vitales (id, paciente_id, admision_id, tomado_por, tomado_en, pa_sistolica, pa_diastolica, fc, fr, temperatura, sat_o2, peso_kg, talla_cm)
select pg_temp.did('0043', 9000 + v.n), pg_temp.did('0001', v.pac), pg_temp.did('0060', v.adm), pg_temp.actor('ENF'),
       least(now(), greatest(now() - v.hace, ad.creado_en + interval '5 minutes')),
       v.ps, v.pd, v.fc, v.fr, v.t, v.sat, v.peso, null
from (values
  (1, 7, 1, interval '5 hours', 122, 78, 84, 18, 36.7, 98, 64.0),
  (2, 8, 2, interval '4 hours', 134, 84, 80, 18, 36.5, 96, 70.5),
  (3, 9, 3, interval '3 hours', 130, 86, 96, 20, 37.8, 94, 88.0),
  (4, 10, 4, interval '2 hours', 118, 74, 72, 16, 36.5, 98, 80.0)
) v(n, pac, adm, hace, ps, pd, fc, fr, t, sat, peso)
join hospitalizacion.admision ad on ad.id = pg_temp.did('0060', v.adm)
on conflict do nothing;

insert into atencion.relacion_atencion (id, paciente_id, profesional_id, origen, origen_id, vigencia)
select pg_temp.did('0045', 9100 + (row_number() over (order by a.id))::int), a.paciente_id, a.medico_tratante_id, 'admision', a.id,
       tstzrange(a.creado_en, a.creado_en + interval '30 days')
from hospitalizacion.admision a where a.id::text like 'de300000-%' and a.id < pg_temp.did('0060', 100) and a.estado <> 'pendiente_cama'
on conflict do nothing;

-- Camas: bloqueos, limpieza y equipo. Las camas ocupadas, la reservada y las libres salen de la vista infra.v_estado_cama.
insert into infra.bloqueo_cama (id, cama_id, periodo, motivo, origen, creado_por)
values
  (pg_temp.did('0022', 1), pg_temp.espacio('HAB-402-B'),
     tstzrange(coalesce((select lower(periodo) from hospitalizacion.ocupacion_cama where id = pg_temp.did('0061', 4)), now() - interval '1 day'), now() + interval '7 days', '[)'),
     '[DEMO] Bloqueada por aislamiento del paciente de la cama HAB-402-A', 'aislamiento', pg_temp.actor('ENF')),
  (pg_temp.did('0022', 2), pg_temp.espacio('HAB-404-A'), tstzrange(now() - interval '2 hours', now() + interval '3 days', '[)'),
     '[DEMO] Mantenimiento de la toma de oxígeno: bloqueo manual con motivo', 'manual', pg_temp.actor('JOP'))
on conflict do nothing;

insert into infra.limpieza_cama (id, cama_id, pendiente_desde, limpiada_por, limpiada_en, lista, verificada_por, verificada_en)
values
  -- Abierta: la cama HAB-403-A está en limpieza; la limpia una persona y la verifica otra (D-013).
  (pg_temp.did('0023', 1), pg_temp.espacio('HAB-403-A'), now() - interval '2 hours', null, null, null, null, null),
  -- Cerrada: historial de una limpieza ya verificada por otra persona.
  (pg_temp.did('0023', 2), pg_temp.espacio('HAB-403-B'), now() - interval '1 day 2 hours', pg_temp.actor('ENF'), now() - interval '1 day 1 hour',
     '{"nota": "[DEMO] Limpieza terminada y verificada por otra persona"}'::jsonb, pg_temp.actor('AST'), now() - interval '1 day')
on conflict do nothing;

-- ---------------------------------------------------------------------------------------------------------
-- 9b. Volumen de hospitalización: 16 admisiones más (k 75 a 90) en las habitaciones nuevas de la Planta 4.
--     Reglas que respeta: cada ingreso apunta a un origen que existe y es anterior; una cama o un paciente nunca
--     tienen dos ocupaciones a la vez; una semiprivada comparte solo pacientes del mismo sexo; quien está en
--     aislamiento queda solo (la otra cama se bloquea); la VIP no se traslada; la categoría de la ocupación es la
--     de la habitación; y solo hay ocupación abierta en hospitalizados y alta firmada.
-- ---------------------------------------------------------------------------------------------------------
create temp table vadm (k int primary key, origen text, origen_n int, cat text, aisl text, tratante int, estado text, hace interval, prog interval,
  motivo text, inest boolean, postq boolean, visitas boolean, vmax int) on commit drop;
insert into vadm values
  (75, 'consulta',   175, 'semiprivada', null,      1,  'hospitalizado',  interval '20 hours', null, 'Observación por neumonía comunitaria leve', false, false, true, 1),
  (76, 'emergencia', 176, 'semiprivada', null,      31, 'hospitalizado',  interval '0 minutes', null, 'Crisis hipertensiva en observación y ajuste de tratamiento', false, false, true, 1),
  (77, 'cita',       177, 'semiprivada', null,      30, 'hospitalizado',  interval '40 hours', null, 'Recuperación posoperatoria de colecistectomía programada', false, true, true, 2),
  (78, 'ambulancia', 7,   'semiprivada', null,      31, 'hospitalizado',  interval '24 hours', null, 'Politraumatismo por accidente de tránsito, vigilancia estrecha', true, false, false, 0),
  (79, 'cita',       179, 'semiprivada', 'gotitas', 31, 'hospitalizado',  interval '2 days', null, 'Neumonía con aislamiento por gotitas mientras se descarta tuberculosis', false, false, false, 0),
  (80, 'cita',       180, 'semiprivada', 'aerea',   31, 'hospitalizado',  interval '30 hours', null, 'Varicela en adulto con aislamiento aéreo', false, false, false, 0),
  (81, 'cita',       181, 'vip',         null,      30, 'hospitalizado',  interval '3 days', null, 'Control posoperatorio de histerectomía en habitación VIP', false, true, true, 2),
  (82, 'cita',       182, 'vip',         null,      1,  'alta_firmada',   interval '4 days', null, 'Tratamiento endovenoso de infección de tejidos blandos', false, false, true, 2),
  (83, 'cita',       183, 'semiprivada', null,      30, 'pendiente_cama', interval '2 hours', interval '3 hours', 'Ingreso programado para observación y estudios', false, false, true, 1),
  (84, 'cita',       184, 'vip',         null,      1,  'pendiente_cama', interval '1 hour', interval '4 hours', 'Ingreso programado en VIP para tratamiento endovenoso', false, false, true, 2),
  (85, 'cita',       185, 'semiprivada', null,      30, 'egresado',       interval '7 days', null, 'Crisis asmática tratada con nebulizaciones, egreso hoy', false, false, true, 1),
  (86, 'cita',       186, 'semiprivada', null,      1,  'cancelada',      interval '12 hours', null, 'Ingreso cancelado: el paciente prefirió tratamiento ambulatorio', false, false, true, 1),
  (87, 'cita',       187, 'semiprivada', null,      31, 'hospitalizado',  interval '5 days', null, 'Pielonefritis en tratamiento endovenoso; se trasladó a una cama más cerca de enfermería', false, false, true, 1),
  (88, 'cita',       188, 'semiprivada', null,      30, 'egresado',       interval '11 days', null, 'Deshidratación por gastroenteritis, egreso hace seis días', false, false, true, 1),
  (89, 'cita',       189, 'semiprivada', null,      1,  'egresado',       interval '13 days', null, 'Observación por dolor torácico; el paciente pidió el alta voluntaria', false, false, true, 1),
  (90, 'cita',       190, 'semiprivada', null,      31, 'egresado',       interval '10 days', null, 'Trauma de miembro inferior; se trasladó a un hospital de tercer nivel', false, false, true, 1);

insert into hospitalizacion.admision (id, paciente_id, origen, origen_id, categoria_pedida, sexo_paciente, aislamiento, medico_tratante_id,
  fecha_programada, estado, creado_por, creado_en, motivo, tipo_aislamiento, inestable, postquirurgico, visitas_permitidas, visitantes_max)
select pg_temp.did('0060', 100 + a.k), pg_temp.did('0001', 27 + a.k), a.origen,
       case a.origen when 'consulta' then pg_temp.did('0006', a.origen_n) when 'cita' then pg_temp.did('0004', a.origen_n)
            when 'emergencia' then pg_temp.did('0005', a.origen_n) else pg_temp.did('0070', a.origen_n) end,
       a.cat, p.sexo, a.aisl is not null, case a.tratante when 0 then pg_temp.persona('MED') else pg_temp.did('0002', a.tratante) end,
       case when a.origen = 'cita' then case when a.prog is not null then now() + a.prog else cr.t end end,
       a.estado, pg_temp.actor('MED'), cr.t, '[DEMO] ' || a.motivo, a.aisl, a.inest, a.postq, a.visitas, a.vmax
from vadm a
join pacientes.paciente p on p.id = pg_temp.did('0001', 27 + a.k)
cross join lateral (select pg_temp.origen_ts(a.origen, case a.origen when 'consulta' then pg_temp.did('0006', a.origen_n) when 'cita' then pg_temp.did('0004', a.origen_n)
            when 'emergencia' then pg_temp.did('0005', a.origen_n) else pg_temp.did('0070', a.origen_n) end) as o) og
cross join lateral (select least(now(), greatest(now() - a.hace, og.o + interval '10 minutes')) as t) cr
where og.o is not null and case a.tratante when 0 then pg_temp.persona('MED') else pg_temp.did('0002', a.tratante) end is not null
on conflict do nothing;

-- Ocupaciones. Inicio = 30 minutos después del ingreso (sin pasar de ahora); las cerradas terminan en el instante indicado.
create temp table vocc (id int primary key, k int, cama text, hab text, cat text, fin timestamptz, motivo_fin text, ini_ref int) on commit drop;
insert into vocc values
  (175, 75, 'HAB-405-A', 'HAB-405', 'semiprivada', null, null, null),
  (177, 77, 'HAB-405-B', 'HAB-405', 'semiprivada', null, null, null),
  (176, 76, 'HAB-406-A', 'HAB-406', 'semiprivada', null, null, null),
  (178, 78, 'HAB-406-B', 'HAB-406', 'semiprivada', null, null, null),
  (179, 79, 'HAB-407-A', 'HAB-407', 'semiprivada', null, null, null),
  (180, 80, 'HAB-408-A', 'HAB-408', 'semiprivada', null, null, null),
  (181, 81, 'VIP-403-A', 'VIP-403', 'vip',         null, null, null),
  (182, 82, 'VIP-404-A', 'VIP-404', 'vip',         null, null, null),
  (187, 87, 'HAB-410-A', 'HAB-410', 'semiprivada', now() - interval '26 hours', 'traslado', null),
  (287, 87, 'HAB-409-B', 'HAB-409', 'semiprivada', null, null, 187),
  (185, 85, 'HAB-409-A', 'HAB-409', 'semiprivada', now() - interval '5 hours', 'egreso', null),
  (188, 88, 'HAB-410-B', 'HAB-410', 'semiprivada', now() - interval '6 days', 'egreso', null),
  (189, 89, 'HAB-405-A', 'HAB-405', 'semiprivada', now() - interval '9 days', 'egreso', null),
  (190, 90, 'HAB-406-A', 'HAB-406', 'semiprivada', now() - interval '7 days', 'egreso', null);

insert into hospitalizacion.ocupacion_cama (id, admision_id, cama_id, habitacion_id, categoria, periodo, motivo_fin, asignado_por)
select pg_temp.did('0061', o.id), a.id, pg_temp.espacio(o.cama), pg_temp.espacio(o.hab), o.cat,
       tstzrange(case when o.ini_ref is not null then o.ini_ref_fin else least(now(), a.creado_en + interval '30 minutes') end, o.fin, '[)'),
       o.motivo_fin, pg_temp.actor('ENF')
from (select v.*, (select fin from vocc r where r.id = v.ini_ref) as ini_ref_fin from vocc v) o
join hospitalizacion.admision a on a.id = pg_temp.did('0060', 100 + o.k)
on conflict do nothing;

-- Traslado de la paciente 87 (semiprivada, mismo sexo en la nueva habitación) y su registro.
insert into hospitalizacion.traslado (id, admision_id, ocupacion_origen_id, ocupacion_destino_id, motivo, realizado_por, realizado_en)
select pg_temp.did('0063', 187), pg_temp.did('0060', 187), pg_temp.did('0061', 187), pg_temp.did('0061', 287),
       '[DEMO] Traslado a una cama más cercana a enfermería por el tratamiento endovenoso', pg_temp.actor('ENF'), now() - interval '26 hours'
where exists (select 1 from hospitalizacion.ocupacion_cama where id = pg_temp.did('0061', 187))
  and exists (select 1 from hospitalizacion.ocupacion_cama where id = pg_temp.did('0061', 287))
on conflict do nothing;

insert into hospitalizacion.reserva_cama (id, admision_id, cama_id, periodo, estado)
select pg_temp.did('0062', 100 + v.k), pg_temp.did('0060', 100 + v.k), pg_temp.espacio(v.cama), v.periodo, v.estado
from (values
  (84, 'VIP-405-A',  tstzrange(now(), now() + interval '8 hours', '[)'), 'activa'),
  (81, 'VIP-403-A',  tstzrange(now() - interval '3 days', now() - interval '3 days' + interval '30 minutes', '[)'), 'usada'),
  (86, 'HAB-410-A',  tstzrange(now() - interval '11 hours', now() - interval '3 hours', '[)'), 'vencida')
) v(k, cama, periodo, estado)
where exists (select 1 from hospitalizacion.admision where id = pg_temp.did('0060', 100 + v.k))
on conflict do nothing;

insert into hospitalizacion.alta (admision_id, tipo, firmada_por, firmada_en, resumen, pendientes, constancia_voluntaria)
select pg_temp.did('0060', 100 + v.k), v.tipo, pg_temp.actor('MED'), v.cuando, v.resumen, v.pend::jsonb, v.tipo = 'voluntaria'
from (values
  (82, 'medica',     now() - interval '2 hours', '[DEMO] Alta firmada: la cama VIP-404 sigue ocupada hasta la salida física del paciente',
      '[{"descripcion": "Control en consulta externa en siete días", "responsable": "Consulta general"}, {"descripcion": "Retiro de puntos en diez días", "responsable": "Enfermería de consulta externa"}]'),
  (85, 'medica',     now() - interval '5 hours' - interval '20 minutes', '[DEMO] Alta médica: salió a su casa con inhalador y cita de control; la cama pasó a limpieza', '[]'),
  (88, 'medica',     now() - interval '6 days' - interval '20 minutes',   '[DEMO] Alta médica completada sin pendientes', '[]'),
  (89, 'voluntaria', now() - interval '9 days' - interval '20 minutes',   '[DEMO] Alta voluntaria: el paciente firmó la constancia después de recibir explicación de los riesgos',
      '[{"descripcion": "Valoración cardiológica ambulatoria", "responsable": "Consulta general"}]'),
  (90, 'traslado',   now() - interval '7 days' - interval '30 minutes',   '[DEMO] Traslado a un hospital de tercer nivel para valoración ortopédica; se entregó el resumen clínico', '[]')
) v(k, tipo, cuando, resumen, pend)
where exists (select 1 from hospitalizacion.admision where id = pg_temp.did('0060', 100 + v.k))
on conflict do nothing;

-- Notas de enfermería cada nueve horas mientras el paciente estuvo ingresado (nunca en el futuro ni después del alta).
insert into hospitalizacion.nota_enfermeria (id, admision_id, autor_id, texto, creada_en)
select pg_temp.did('0064', 100 + a.k * 5 + j.j), ad.id, pg_temp.actor('ENF'),
       '[DEMO] Nota de enfermería: ' || case when a.aisl is not null and j.j = 1 then 'aislamiento ' || a.aisl || ' indicado, la puerta permanece cerrada y se usa equipo de protección.'
         else pg_temp.pick(array['paciente estable, tolera la dieta y deambula con ayuda.', 'se administran los medicamentos indicados; refiere dolor leve que cede con analgesia.',
           'signos vitales estables; se educa a la familia sobre los signos de alarma.'], a.k + j.j) end,
       ad.creado_en + j.j * interval '9 hours'
from vadm a
join hospitalizacion.admision ad on ad.id = pg_temp.did('0060', 100 + a.k)
cross join generate_series(1, 3) j(j)
where a.estado in ('hospitalizado', 'alta_firmada', 'egresado')
  and ad.creado_en + j.j * interval '9 hours' <= now() - interval '5 minutes'
  and ad.creado_en + j.j * interval '9 hours' < coalesce((select firmada_en from hospitalizacion.alta where admision_id = ad.id), now())
on conflict do nothing;

-- Serie de signos vitales cada ocho horas desde el ingreso (la presión y la temperatura mejoran con el tratamiento).
insert into atencion.signos_vitales (id, paciente_id, admision_id, tomado_por, tomado_en, pa_sistolica, pa_diastolica, fc, fr, temperatura, sat_o2, peso_kg, talla_cm)
select pg_temp.did('0043', 1000 + a.k * 20 + j.j), ad.paciente_id, ad.id, pg_temp.actor('ENF'), t.t,
       118 + mod(a.k * 5, 34) + case when a.inest then 18 else 0 end - least(j.j, 6) * 2,
       74 + mod(a.k * 3, 16) - least(j.j, 4),
       78 + mod(a.k * 7, 24) + case when a.inest then 14 else 0 end - least(j.j, 5),
       16 + mod(a.k, 5),
       36.4 + mod(a.k + j.j, 9) / 10.0 + case when a.aisl is not null then greatest(1.2 - j.j * 0.35, 0) else 0 end,
       94 + mod(a.k + j.j, 5) - case when a.aisl = 'aerea' then 2 else 0 end,
       case when j.j = 0 then 55 + mod(a.k * 7, 40) end, null
from vadm a
join hospitalizacion.admision ad on ad.id = pg_temp.did('0060', 100 + a.k)
cross join generate_series(0, 8) j(j)
cross join lateral (select case when j.j = 0 then least(now(), ad.creado_en + interval '10 minutes')
                                else ad.creado_en + interval '10 minutes' + j.j * interval '8 hours' end as t) t
where a.estado in ('hospitalizado', 'alta_firmada', 'egresado')
  and (j.j = 0 or t.t <= now() - interval '5 minutes')
  and t.t < coalesce((select firmada_en from hospitalizacion.alta where admision_id = ad.id), now() + interval '1 day')
on conflict do nothing;

insert into atencion.relacion_atencion (id, paciente_id, profesional_id, origen, origen_id, vigencia)
select pg_temp.did('0045', 2000 + substr(a.id::text, 25)::int), a.paciente_id, a.medico_tratante_id, 'admision', a.id,
       tstzrange(a.creado_en, a.creado_en + interval '30 days')
from hospitalizacion.admision a
where a.id::text like 'de300000-%' and a.id >= pg_temp.did('0060', 100) and a.estado not in ('pendiente_cama', 'cancelada')
on conflict do nothing;

-- Camas: bloqueos por aislamiento (la otra cama de la habitación queda sin usar) y uno manual ya vencido; limpiezas pendientes,
-- por verificar y terminadas; monitores en las habitaciones nuevas.
insert into infra.bloqueo_cama (id, cama_id, periodo, motivo, origen, creado_por)
select pg_temp.did('0022', v.n), pg_temp.espacio(v.cama), tstzrange(v.ini, v.fin, '[)'), v.motivo, v.origen, pg_temp.actor('ENF')
from (values
  (10, 'HAB-407-B', (select lower(periodo) from hospitalizacion.ocupacion_cama where id = pg_temp.did('0061', 179)), now() + interval '5 days',
       '[DEMO] Bloqueada por aislamiento de gotitas del paciente de la cama HAB-407-A', 'aislamiento'),
  (11, 'HAB-408-B', (select lower(periodo) from hospitalizacion.ocupacion_cama where id = pg_temp.did('0061', 180)), now() + interval '5 days',
       '[DEMO] Bloqueada por aislamiento aéreo del paciente de la cama HAB-408-A', 'aislamiento'),
  (12, 'HAB-410-B', now() - interval '20 days', now() - interval '15 days', '[DEMO] Pintura de la habitación: bloqueo manual ya terminado', 'manual')
) v(n, cama, ini, fin, motivo, origen)
where v.ini is not null
on conflict do nothing;

insert into infra.limpieza_cama (id, cama_id, pendiente_desde, limpiada_por, limpiada_en, lista, verificada_por, verificada_en)
select pg_temp.did('0023', v.n), pg_temp.espacio(v.cama), v.pend, v.por, v.limpia, v.lista::jsonb, v.ver_por, v.ver
from (values
  -- HAB-409-A: acaba de egresar el paciente y espera limpieza.
  (3, 'HAB-409-A', now() - interval '5 hours', null::uuid, null::timestamptz, null::text, null::uuid, null::timestamptz),
  -- HAB-410-A: ya se limpió tras el traslado, falta que otra persona la verifique.
  (4, 'HAB-410-A', now() - interval '26 hours', pg_temp.actor('ENF'), now() - interval '25 hours', '{"nota": "[DEMO] Limpiada; falta la verificación de otra persona"}', null::uuid, null::timestamptz),
  -- HAB-410-B: limpieza terminada y verificada hace seis días.
  (5, 'HAB-410-B', now() - interval '6 days', pg_temp.actor('ENF'), now() - interval '6 days' + interval '1 hour', '{"nota": "[DEMO] Limpieza terminada y verificada"}', pg_temp.actor('AST'), now() - interval '6 days' + interval '2 hours')
) v(n, cama, pend, por, limpia, lista, ver_por, ver)
on conflict do nothing;

insert into infra.equipo (id, tipo, serie, espacio_id, estado) values
  (pg_temp.did('0021', 5), 'monitor', 'DEMO-MON-405', pg_temp.did('0020', 17), 'operativo'),
  (pg_temp.did('0021', 6), 'monitor', 'DEMO-MON-406', pg_temp.did('0020', 18), 'operativo'),
  (pg_temp.did('0021', 7), 'bomba',   'DEMO-BOM-407', pg_temp.did('0020', 19), 'operativo'),
  (pg_temp.did('0021', 8), 'oxigeno', 'DEMO-OXI-408', pg_temp.did('0020', 20), 'operativo'),
  (pg_temp.did('0021', 9), 'monitor', 'DEMO-MON-VIP3', pg_temp.did('0020', 23), 'operativo')
on conflict do nothing;

-- ---------------------------------------------------------------------------------------------------------
-- 11. Inventario: artículos, lotes (uno vencido), existencias (varias bajo el mínimo) y movimientos
-- ---------------------------------------------------------------------------------------------------------
create temp table idemo (n int primary key, cod text, nombre text, tipo text, unidad text, minimo numeric, lote text, vence date,
  bodega text, entrada numeric, salida numeric, tipo_salida text, traslado numeric, ajuste numeric, merma numeric default 0) on commit drop;
insert into idemo values
  (1,  'DEMO-PAR500', 'Paracetamol 500 mg tabletas',        'insumo',       'tableta', 200, 'DL-26-A', date '2027-08-31', 'BOD-CEN', 400, 280, 'consumo', 0, 0),
  (2,  'DEMO-AMOX',   'Amoxicilina 500 mg cápsulas',        'insumo',       'cápsula', 150, 'DL-26-A', date '2027-05-31', 'BOD-CEN', 800, 150, 'salida',  100, 0),
  (3,  'DEMO-SUERO',  'Suero oral en sobres',               'insumo',       'sobre',    80, 'DL-26-A', date '2027-03-31', 'BOD-CEN', 200, 170, 'consumo', 0, 0),
  (4,  'DEMO-MASC',   'Mascarilla quirúrgica',              'insumo',       'caja',     25, 'DL-26-A', date '2028-01-31', 'BOD-CEN', 120, 30,  'salida',  0, 0),
  (5,  'DEMO-CANULA', 'Cánula nasal de oxígeno',            'equipo_menor', 'unidad',   15, 'DL-26-A', null,              'BOD-URG', 20,  16,  'consumo', 0, 0),
  (6,  'DEMO-TUBOVD', 'Tubo de muestra tapón verde',        'reactivo',     'unidad',  200, 'DL-26-A', date '2027-02-28', 'BOD-LAB', 600, 100, 'consumo', 0, 0),
  (7,  'DEMO-TUBOVD', 'Tubo de muestra tapón verde',        'reactivo',     'unidad',  200, 'DL-25-V', date '2026-09-30', 'BOD-LAB', 150, 0,   'salida',  0, 0),
  (8,  'DEMO-CREA',   'Reactivo de creatinina',             'reactivo',     'kit',       4, 'DL-26-A', date '2027-04-30', 'BOD-LAB', 6,   4,   'consumo', 0, 0),
  (9,  'DEMO-HEMCTL', 'Control de hematología',             'reactivo',     'frasco',    3, 'DL-26-A', date '2027-01-31', 'BOD-LAB', 10,  2,   'consumo', 0, 0),
  (10, 'DEMO-TIRAS',  'Tiras reactivas de glucosa',         'reactivo',     'caja',     10, 'DL-26-A', date '2027-06-30', 'BOD-LAB', 12,  8,   'consumo', 0, 1),
  (11, 'DEMO-VENDA',  'Venda elástica 10 cm',               'insumo',       'unidad',   40, 'DL-26-A', null,              'BOD-CEN', 90,  35,  'salida',  0, 0),
  -- Estados de la lista: segundo lote que vence pronto (FEFO), agotado, por vencer, artículo retirado y merma.
  (12, 'DEMO-SUERO',  'Suero oral en sobres',               'insumo',       'sobre',    80, 'DL-26-B', current_date + 12, 'BOD-CEN', 60,  0,   'salida',  0, 0),
  (13, 'DEMO-GUANTE', 'Guantes de examen',                  'insumo',       'caja',     20, 'DL-26-A', date '2027-10-31', 'BOD-CEN', 80,  20,  'consumo', 10, 0),
  (14, 'DEMO-JER5',   'Jeringa de 5 ml',                    'insumo',       'unidad',  100, 'DL-26-A', date '2028-03-31', 'BOD-URG', 150, 150, 'consumo', 0, 0),
  (15, 'DEMO-GLUCO',  'Solución de control de glucosa',     'reactivo',     'frasco',    3, 'DL-26-A', current_date + 20, 'BOD-LAB', 8,   2,   'consumo', 0, 0),
  (16, 'DEMO-ALCOHOL','Alcohol en gel',                     'insumo',       'frasco',   30, 'DL-26-A', date '2027-06-30', 'BOD-CEN', 100, 40,  'salida',  20, 0),
  (17, 'DEMO-TERMOM', 'Termómetro de mercurio (retirado)',  'equipo_menor', 'unidad',    0, 'DL-20',   null,              'BOD-URG', 5,   5,   'salida',  0, 0),
  -- Volumen: farmacia hospitalaria y reactivos con todos los estados de la lista (bajo mínimo, agotado, por vencer, vencido, dado de baja).
  (18, 'DEMO-IBU400',  'Ibuprofeno 400 mg tabletas',         'insumo',       'tableta', 300, 'DL-26-C', date '2027-09-30', 'BOD-FAR', 900, 640, 'consumo', 0, 0),
  (19, 'DEMO-OMEP',    'Omeprazol 20 mg cápsulas',           'insumo',       'cápsula', 250, 'DL-26-A', date '2027-11-30', 'BOD-FAR', 600, 420, 'consumo', 50, 0),
  (20, 'DEMO-LORAT',   'Loratadina 10 mg tabletas',          'insumo',       'tableta', 200, 'DL-26-A', date '2027-10-31', 'BOD-FAR', 500, 180, 'consumo', 0, 0),
  (21, 'DEMO-LOSART',  'Losartán 50 mg tabletas',            'insumo',       'tableta', 400, 'DL-26-A', date '2028-02-29', 'BOD-FAR', 1200, 520, 'consumo', 100, 0),
  (22, 'DEMO-METF',    'Metformina 850 mg tabletas',         'insumo',       'tableta', 300, 'DL-26-A', date '2027-12-31', 'BOD-FAR', 900, 300, 'consumo', 0, 0),
  (23, 'DEMO-ATOR',    'Atorvastatina 20 mg tabletas',       'insumo',       'tableta', 150, 'DL-26-A', date '2028-01-31', 'BOD-FAR', 400, 120, 'consumo', 0, 10),
  (24, 'DEMO-SALB',    'Salbutamol inhalador 100 mcg',       'insumo',       'inhalador', 20, 'DL-26-A', date '2027-04-30', 'BOD-FAR', 40, 32, 'consumo', 0, 0),
  (25, 'DEMO-SALINA',  'Solución salina 0.9% 1 L',           'insumo',       'bolsa',    60, 'DL-26-A', date '2027-07-31', 'BOD-CEN', 200, 90, 'consumo', 20, 0),
  (26, 'DEMO-CATET',   'Catéter IV 20G',                     'insumo',       'unidad',  100, 'DL-26-A', date '2028-05-31', 'BOD-URG', 400, 310, 'consumo', 0, 0),
  (27, 'DEMO-GASA',    'Gasa estéril 10x10',                 'insumo',       'paquete',  50, 'DL-26-A', date '2028-06-30', 'BOD-CEN', 300, 100, 'salida', 0, 0),
  (28, 'DEMO-SUTURA',  'Sutura de nailon 3-0',               'insumo',       'unidad',   30, 'DL-26-A', date '2029-01-31', 'BOD-URG', 60, 20, 'consumo', 0, 0),
  (29, 'DEMO-AMPI',    'Ampicilina 1 g frasco',              'insumo',       'frasco',   60, 'DL-26-A', current_date + 25, 'BOD-FAR', 120, 40, 'consumo', 0, 0),
  (30, 'DEMO-AMPI',    'Ampicilina 1 g frasco',              'insumo',       'frasco',   60, 'DL-25-Z', current_date - 10, 'BOD-FAR', 50, 10, 'consumo', 0, 0),
  (31, 'DEMO-CEFTR',   'Ceftriaxona 1 g frasco',             'insumo',       'frasco',   80, 'DL-26-A', date '2027-03-31', 'BOD-FAR', 200, 60, 'consumo', 0, 0),
  (32, 'DEMO-HIDRO',   'Hidrocortisona 100 mg frasco',       'insumo',       'frasco',   20, 'DL-26-A', current_date + 6,  'BOD-URG', 30, 10, 'consumo', 0, 0),
  (33, 'DEMO-AGUJA',   'Aguja 21G',                          'insumo',       'caja',     20, 'DL-26-A', date '2028-09-30', 'BOD-CEN', 50, 50, 'consumo', 0, 0),
  (34, 'DEMO-TUBOLIL', 'Tubo de muestra tapón lila',         'reactivo',     'unidad',  300, 'DL-26-A', date '2027-05-31', 'BOD-LAB', 800, 350, 'consumo', 0, 0),
  (35, 'DEMO-TUBOROJ', 'Tubo de muestra tapón rojo',         'reactivo',     'unidad',  300, 'DL-26-A', date '2027-05-31', 'BOD-LAB', 800, 500, 'consumo', 0, 0),
  (36, 'DEMO-REAGLU',  'Reactivo de glucosa',                'reactivo',     'kit',       5, 'DL-26-A', current_date + 45, 'BOD-LAB', 12, 6, 'consumo', 0, 0),
  (37, 'DEMO-HCG',     'Prueba rápida β-hCG',                'reactivo',     'unidad',   30, 'DL-26-A', date '2027-02-28', 'BOD-LAB', 100, 40, 'consumo', 0, 0),
  (38, 'DEMO-GUANTEST','Guantes quirúrgicos estériles',      'insumo',       'par',     100, 'DL-26-A', date '2028-04-30', 'BOD-URG', 400, 120, 'consumo', 0, 0),
  (39, 'DEMO-N95',     'Mascarilla N95',                     'insumo',       'unidad',  100, 'DL-26-A', date '2028-08-31', 'BOD-CEN', 300, 260, 'consumo', 0, 0),
  (40, 'DEMO-ALCOH',   'Alcohol 70% 1 L',                    'insumo',       'frasco',   30, 'DL-26-B', current_date + 18, 'BOD-CEN', 40, 5, 'salida', 0, 0),
  (41, 'DEMO-OXIM',    'Mascarilla de oxígeno',              'equipo_menor', 'unidad',   20, 'DL-26-A', null,              'BOD-URG', 60, 35, 'consumo', 0, 0),
  (42, 'DEMO-DEFIB',   'Parches de desfibrilación',          'equipo_menor', 'par',       6, 'DL-25-A', current_date + 3,  'BOD-URG', 10, 4, 'salida', 0, 0),
  (43, 'DEMO-LANCET',  'Lancetas',                           'insumo',       'caja',     15, 'DL-26-A', date '2028-02-29', 'BOD-LAB', 40, 10, 'consumo', 0, 0),
  (44, 'DEMO-PAPEL',   'Papel de electrocardiograma',        'equipo_menor', 'rollo',    10, 'DL-26-A', null,              'BOD-CEN', 25, 12, 'salida', 0, 0);
-- La merma se registra aparte para no cambiar las columnas de las filas anteriores.
update idemo set merma = 10 where n in (7, 11, 39);
update idemo set merma = 5 where n = 30;

insert into inventario.articulo (id, codigo, nombre, tipo, unidad, minimo)
select distinct on (i.cod) pg_temp.did('0080', i.n), i.cod, i.nombre, i.tipo, i.unidad, i.minimo from idemo i order by i.cod, i.n
on conflict do nothing;

insert into inventario.lote (id, articulo_id, numero, vence)
select pg_temp.did('0081', i.n), a.id, i.lote, i.vence from idemo i join inventario.articulo a on a.codigo = i.cod
on conflict do nothing;
-- Un artículo retirado del catálogo: no se mueve y sale como «Inactivo» en la lista.
update inventario.articulo set activo = false where codigo = 'DEMO-TERMOM';
-- Un lote vencido dado de baja (baja lógica de la ronda 2): ya no cuenta en las existencias ni en la alerta de mínimo.
update inventario.lote set activo = false where id = pg_temp.did('0081', 30) and activo;

insert into inventario.existencia (lote_id, bodega_id, cantidad)
select pg_temp.did('0081', i.n), pg_temp.espacio(i.bodega), i.entrada - i.salida - i.traslado - i.ajuste - i.merma from idemo i
join inventario.lote l on l.id = pg_temp.did('0081', i.n)
on conflict do nothing;
insert into inventario.existencia (lote_id, bodega_id, cantidad)
select pg_temp.did('0081', i.n), pg_temp.espacio('BOD-URG'), i.traslado from idemo i
join inventario.lote l on l.id = pg_temp.did('0081', i.n) where i.traslado > 0
on conflict do nothing;

insert into inventario.movimiento (id, tipo, lote_id, bodega_origen_id, bodega_destino_id, cantidad, motivo, paciente_id, autor_id, registrado_en, clave_idempotencia)
select pg_temp.did('0082', i.n * 10 + m.k), m.tipo, pg_temp.did('0081', i.n),
       case m.tipo when 'entrada' then null when 'traslado' then pg_temp.espacio(i.bodega) else pg_temp.espacio(i.bodega) end,
       case m.tipo when 'entrada' then pg_temp.espacio(i.bodega) when 'traslado' then pg_temp.espacio('BOD-URG') else null end,
       m.cant, m.motivo,
       case when m.tipo = 'consumo' then pg_temp.did('0001', case when i.n <= 17 then 3 else 88 + mod(i.n * 5 + m.k, 30) end) end,
       pg_temp.actor('AST'), now() - m.hace, 'demo-mov-' || i.n || '-' || m.k
from idemo i
cross join lateral (values
  (1, 'entrada', i.entrada, '[DEMO] Entrada inicial del lote: así se ve una compra recibida en la bodega', interval '20 days'),
  (2, i.tipo_salida, i.salida, case i.tipo_salida when 'consumo' then '[DEMO] Consumo con paciente: queda ligado a su expediente' else '[DEMO] Salida de la bodega para el servicio' end, interval '5 days'),
  (3, 'traslado', i.traslado, '[DEMO] Traslado entre bodegas: baja en una y sube en la otra', interval '3 days'),
  (4, 'ajuste', i.ajuste, '[DEMO] Ajuste por conteo físico: resta lo que faltaba en el estante', interval '1 day'),
  (5, 'merma', i.merma, '[DEMO] Merma: unidades dadas de baja por vencimiento o daño', interval '2 days')
) m(k, tipo, cant, motivo, hace)
where m.cant > 0
on conflict do nothing;

-- ---------------------------------------------------------------------------------------------------------
-- 12. Avisos públicos (vigente, programado y vencido)
-- ---------------------------------------------------------------------------------------------------------
insert into publico.aviso (id, titulo, cuerpo, vigencia, publicado_por) values
  (pg_temp.did('0090', 1), 'Horario de visita ampliado',
     '[DEMO] Aviso vigente: se ve ahora en la pantalla pública y en las apps. Las visitas son de 2:00 a 5:00 p. m. y solo una persona por paciente.',
     tstzrange(now() - interval '2 days', now() + interval '10 days', '[)'), pg_temp.actor('ADM')),
  (pg_temp.did('0090', 2), 'Campaña de vacunación',
     '[DEMO] Aviso programado: todavía no es público; aparecerá solo cuando llegue su fecha de inicio.',
     tstzrange(now() + interval '3 days', now() + interval '12 days', '[)'), pg_temp.actor('ADM')),
  (pg_temp.did('0090', 3), 'Mantenimiento del ascensor',
     '[DEMO] Aviso vencido: ya no aparece en la pantalla pública; queda como referencia de un aviso con vigencia terminada.',
     tstzrange(now() - interval '9 days', now() - interval '2 days', '[)'), pg_temp.actor('ADM')),
  (pg_temp.did('0090', 4), 'Recepción: nuevo horario',
     '[DEMO] Aviso vigente de ejemplo para el tablero: la recepción atiende de 7:00 a. m. a 7:00 p. m.',
     tstzrange(now() - interval '1 day', now() + interval '20 days', '[)'), pg_temp.actor('ADM'))
on conflict do nothing;

-- Avisos dirigidos a roles (no salen en la pantalla pública): se ven en el tablero de inicio de cada rol.
insert into publico.aviso (id, titulo, cuerpo, vigencia, publicado_por, prioridad, publico, roles) values
  (pg_temp.did('0090', 5), 'Simulacro de evacuación',
     '[DEMO] Aviso interno para el personal clínico: simulacro de evacuación mañana a las 10:00 a. m.',
     tstzrange(now() - interval '1 hour', now() + interval '3 days', '[)'), pg_temp.actor('ADM'), 'urgente', false, array['ENF','MED','AST','LAB']),
  (pg_temp.did('0090', 6), 'Cierre mensual de inventario',
     '[DEMO] Aviso interno para Administración y Jefatura: el cierre mensual del inventario es el viernes.',
     tstzrange(now() - interval '1 hour', now() + interval '8 days', '[)'), pg_temp.actor('ADM'), 'atencion', false, array['ADM','JOP'])
on conflict do nothing;

insert into publico.aviso (id, titulo, cuerpo, vigencia, publicado_por, prioridad, publico, roles) values
  (pg_temp.did('0090', 7), 'Corte de agua programado',
     '[DEMO] Aviso público y para el personal de enfermería: corte de agua el sábado de 6:00 a. m. a 12:00 m.; se usan las cisternas.',
     tstzrange(now() - interval '1 hour', now() + interval '2 days', '[)'), pg_temp.actor('ADM'), 'urgente', true, array['JOP','ENF','AST']),
  (pg_temp.did('0090', 8), 'Actualización del sistema esta noche',
     '[DEMO] Aviso crítico interno: el sistema estará en mantenimiento de 11:00 p. m. a 1:00 a. m.; respalda lo pendiente antes.',
     tstzrange(now() - interval '30 minutes', now() + interval '1 day', '[)'), pg_temp.actor('ADM'), 'critico', false, array['ADM','JOP']),
  (pg_temp.did('0090', 9), 'Campaña de donación de sangre',
     '[DEMO] Aviso público programado: jornada de donación voluntaria con el banco de sangre; aparecerá cuando llegue su fecha.',
     tstzrange(now() + interval '5 days', now() + interval '9 days', '[)'), pg_temp.actor('ADM'), 'atencion', true, '{}'),
  (pg_temp.did('0090', 10), 'Revisión del carro de paro',
     '[DEMO] Aviso interno vencido: revisión mensual del carro de paro en emergencia; queda como ejemplo de aviso con vigencia terminada.',
     tstzrange(now() - interval '10 days', now() - interval '8 days', '[)'), pg_temp.actor('ADM'), 'urgente', false, array['MED','ENF']),
  (pg_temp.did('0090', 11), 'Nuevo horario de laboratorio',
     '[DEMO] Aviso público y para laboratorio y médicos: las muestras de ayuno se reciben de 6:00 a 9:00 a. m.',
     tstzrange(now() - interval '1 day', now() + interval '12 days', '[)'), pg_temp.actor('ADM'), 'atencion', true, array['LAB','MED']),
  (pg_temp.did('0090', 12), 'Vacunación de influenza para el personal',
     '[DEMO] Aviso interno para todo el personal clínico y administrativo: vacunación en la sala de espera de 8:00 a. m. a 12:00 m.',
     tstzrange(now() - interval '3 days', now() + interval '6 days', '[)'), pg_temp.actor('ADM'), 'atencion', false, array['ADM','JOP','REC','AST','ENF','MED','LAB','PAR']),
  (pg_temp.did('0090', 13), 'Ruta alterna por obras en la Panamericana',
     '[DEMO] Aviso público y para despacho y paramédicos: usar la ruta alterna por la calle principal; la unidad avisa si hay retraso.',
     tstzrange(now() - interval '2 hours', now() + interval '4 days', '[)'), pg_temp.actor('ADM'), 'urgente', true, array['PAR','REC','JOP']),
  (pg_temp.did('0090', 14), 'Reunión de jefaturas',
     '[DEMO] Aviso interno programado: reunión de jefaturas de área mañana a las 2:00 p. m. para revisar la ocupación.',
     tstzrange(now() + interval '1 day', now() + interval '2 days', '[)'), pg_temp.actor('ADM'), 'atencion', false, array['ADM','JOP','DPD']),
  (pg_temp.did('0090', 15), 'Documentos para su ingreso',
     '[DEMO] Aviso para pacientes: lleve su DUI y su carné de seguro, si tiene, cuando venga a un ingreso programado.',
     tstzrange(now() - interval '5 days', now() + interval '25 days', '[)'), pg_temp.actor('ADM'), 'atencion', true, array['PAC']),
  (pg_temp.did('0090', 16), 'Ocupación alta en hospitalización',
     '[DEMO] Aviso crítico interno: la Planta 4 está casi llena; confirmar altas del día antes de aceptar nuevos ingresos.',
     tstzrange(now() - interval '2 hours', now() + interval '1 day', '[)'), pg_temp.actor('ADM'), 'critico', false, array['ADM','JOP','ENF'])
on conflict do nothing;

-- ---------------------------------------------------------------------------------------------------------
-- 13. Vinculaciones de cuenta y expediente (REC) e invitaciones (ADM)
--     Las cuentas solicitantes son filas demo de acceso.usuario SIN usuario en Supabase Auth: no pueden entrar,
--     solo existen para que REC y ADM vean solicitudes en cada estado. No se toca la cuenta PAC real.
-- ---------------------------------------------------------------------------------------------------------
insert into acceso.usuario (id, correo, nombre_mostrar, estado)
select pg_temp.did('0010', v.n), 'demo.' || v.clave || '@example.test', '[DEMO] ' || v.nombre, 'activo'
from (values
  (1, 'vinculacion1', 'Karla Menéndez (pide vincular su cuenta)'),
  (2, 'vinculacion2', 'Ana Portillo (fecha de nacimiento no coincide)'),
  (3, 'vinculacion3', 'Óscar Villatoro (ya vinculado)'),
  (4, 'vinculacion4', 'Sandra Escobar (solicitud rechazada)'),
  (5, 'invitado1',    'Invitación enviada (aún no acepta)'),
  (6, 'invitado2',    'Invitación expirada'),
  (7, 'invitado3',    'Invitación aceptada')
) v(n, clave, nombre)
on conflict do nothing;

insert into acceso.asignacion_rol (usuario_id, rol_codigo, asignado_por)
select pg_temp.did('0010', v.n), v.rol, case when v.n >= 5 then (select usuario_id from cuentas where rol = 'ADM') end
from (values (1, 'PAC'), (2, 'PAC'), (3, 'PAC'), (4, 'PAC'), (5, 'ENF'), (6, 'LAB'), (7, 'MED')) v(n, rol)
on conflict do nothing;

-- Cuenta 3: ya vinculada a su expediente por una vinculación aprobada.
update acceso.usuario set paciente_id = pg_temp.did('0001', 14)
where id = pg_temp.did('0010', 3) and paciente_id is null
  and not exists (select 1 from acceso.usuario x where x.paciente_id = pg_temp.did('0001', 14));

insert into acceso.vinculacion_paciente (id, usuario_id, dui_declarado, nacimiento_declarado, paciente_candidato_id, estado, motivo_rechazo,
  verificado_por, creado_en, resuelto_en)
select pg_temp.did('0011', v.n), pg_temp.did('0010', v.n), v.dui, v.nac, pg_temp.did('0001', v.pac), v.estado, v.motivo,
       case when v.estado <> 'pendiente' then (select usuario_id from cuentas where rol = 'REC') end, now() - v.hace,
       case when v.estado <> 'pendiente' then now() - v.hace + interval '30 minutes' end
from (
  select 1 n, 13 pac, 'pendiente' estado, null::text motivo, interval '2 hours' hace,
         substr(pg_temp.dui('9000' || lpad('13', 4, '0')), 1, 8) || '-' || right(pg_temp.dui('9000' || lpad('13', 4, '0')), 1) dui, date '1999-06-11' nac
  union all
  select 2, 4, 'pendiente', null, interval '1 hour',
         substr(pg_temp.dui('9000' || lpad('4', 4, '0')), 1, 8) || '-' || right(pg_temp.dui('9000' || lpad('4', 4, '0')), 1), date '2001-01-23'
  union all
  select 3, 14, 'aprobada', null, interval '3 days',
         substr(pg_temp.dui('9000' || lpad('14', 4, '0')), 1, 8) || '-' || right(pg_temp.dui('9000' || lpad('14', 4, '0')), 1), date '1986-12-25'
  union all
  select 4, 15, 'rechazada', '[DEMO] La fecha de nacimiento declarada no coincide con el expediente; se pidió presentar el DUI en recepción', interval '2 days',
         substr(pg_temp.dui('9000' || lpad('15', 4, '0')), 1, 8) || '-' || right(pg_temp.dui('9000' || lpad('15', 4, '0')), 1), date '1971-09-15'
) v
where v.estado = 'pendiente' or exists (select 1 from cuentas where rol = 'REC' and usuario_id is not null)
on conflict do nothing;

insert into acceso.invitacion (id, usuario_id, correo, nombre_mostrar, rol_codigo, invitado_por, estado, creado_en, actualizado_en)
select pg_temp.did('0012', v.n), pg_temp.did('0010', v.n + 4), 'demo.invitado' || v.n || '@example.test', '[DEMO] ' || v.nombre, v.rol,
       c.usuario_id, v.estado, now() - v.hace, now() - v.hace
from (values
  (1, 'Invitación enviada (aún no acepta)', 'ENF', 'enviada',  interval '1 day'),
  (2, 'Invitación expirada',                'LAB', 'expirada', interval '12 days'),
  (3, 'Invitación aceptada',                'MED', 'aceptada', interval '6 days')
) v(n, nombre, rol, estado, hace)
join cuentas c on c.rol = 'ADM' and c.usuario_id is not null
on conflict do nothing;

-- Volumen: más cuentas en todos los estados de vinculación (pendiente, aprobada, rechazada) e invitación (enviada, expirada,
-- aceptada, rechazada). Las vinculadas apuntan a pacientes adultos con DUI del volumen; ninguna entra en Supabase Auth.
create temp table vinc_pac (r int primary key, n int, dui text, nac date) on commit drop;
insert into vinc_pac
select row_number() over (order by k), n,
       substr(pg_temp.dui('9000' || lpad(n::text, 4, '0')), 1, 8) || '-' || right(pg_temp.dui('9000' || lpad(n::text, 4, '0')), 1), nac
from vol where ident = 'dui' and k between 21 and 45 and estado = 'activo';

insert into acceso.usuario (id, correo, nombre_mostrar, estado)
select pg_temp.did('0010', v.n), 'demo.' || v.clave || '@example.test', '[DEMO] ' || v.nombre, 'activo'
from (values
  (8,  'vinculacion5',  'Solicitud nueva (pide vincular su cuenta)'),
  (9,  'vinculacion6',  'Solicitud con fecha de nacimiento distinta'),
  (10, 'vinculacion7',  'Cuenta ya vinculada (aprobada)'),
  (11, 'vinculacion8',  'Cuenta ya vinculada (aprobada)'),
  (12, 'vinculacion9',  'Cuenta ya vinculada (aprobada)'),
  (13, 'vinculacion10', 'Solicitud rechazada por documento ilegible'),
  (14, 'vinculacion11', 'Solicitud rechazada por datos distintos'),
  (15, 'vinculacion12', 'Solicitud pendiente de revisión'),
  (16, 'invitado4',     'Invitación enviada a asistente'),
  (17, 'invitado5',     'Invitación enviada a recepción'),
  (18, 'invitado6',     'Invitación expirada de enfermería'),
  (19, 'invitado7',     'Invitación aceptada de médico'),
  (20, 'invitado8',     'Invitación aceptada de laboratorio'),
  (21, 'invitado9',     'Invitación rechazada de paramédico')
) v(n, clave, nombre)
on conflict do nothing;

insert into acceso.asignacion_rol (usuario_id, rol_codigo, asignado_por)
select pg_temp.did('0010', v.n), v.rol, case when v.n >= 16 then (select usuario_id from cuentas where rol = 'ADM') end
from (values (8, 'PAC'), (9, 'PAC'), (10, 'PAC'), (11, 'PAC'), (12, 'PAC'), (13, 'PAC'), (14, 'PAC'), (15, 'PAC'),
             (16, 'AST'), (17, 'REC'), (18, 'ENF'), (19, 'MED'), (20, 'LAB'), (21, 'PAR')) v(n, rol)
on conflict do nothing;

-- Las tres cuentas aprobadas ya apuntan a su expediente.
update acceso.usuario u set paciente_id = pg_temp.did('0001', p.n)
from (values (10, 3), (11, 4), (12, 5)) v(u, r)
join vinc_pac p on p.r = v.r
where u.id = pg_temp.did('0010', v.u) and u.paciente_id is null
  and not exists (select 1 from acceso.usuario x where x.paciente_id = pg_temp.did('0001', p.n));

insert into acceso.vinculacion_paciente (id, usuario_id, dui_declarado, nacimiento_declarado, paciente_candidato_id, estado, motivo_rechazo,
  verificado_por, creado_en, resuelto_en)
select pg_temp.did('0011', v.u), pg_temp.did('0010', v.u), p.dui, p.nac + v.dnac, pg_temp.did('0001', p.n), v.estado, v.motivo,
       case when v.estado <> 'pendiente' then (select usuario_id from cuentas where rol = 'REC') end, now() - v.hace,
       case when v.estado <> 'pendiente' then now() - v.hace + interval '40 minutes' end
from (values
  (8,  1, 'pendiente', null::text, 0, interval '3 hours'),
  (9,  2, 'pendiente', null, 1, interval '90 minutes'),
  (10, 3, 'aprobada',  null, 0, interval '6 days'),
  (11, 4, 'aprobada',  null, 0, interval '4 days'),
  (12, 5, 'aprobada',  null, 0, interval '1 day'),
  (13, 6, 'rechazada', '[DEMO] La foto del DUI no se leía: se pidió presentarlo en recepción para verificar la identidad', 0, interval '5 days'),
  (14, 7, 'rechazada', '[DEMO] El DUI declarado no coincide con el expediente; se pidió corregir el dato en recepción', 0, interval '3 days'),
  (15, 8, 'pendiente', null, 0, interval '20 minutes')
) v(u, r, estado, motivo, dnac, hace)
join vinc_pac p on p.r = v.r
where v.estado = 'pendiente' or exists (select 1 from cuentas where rol = 'REC' and usuario_id is not null)
on conflict do nothing;

insert into acceso.invitacion (id, usuario_id, correo, nombre_mostrar, rol_codigo, invitado_por, estado, creado_en, actualizado_en)
select pg_temp.did('0012', v.n), pg_temp.did('0010', v.u), 'demo.invitado' || v.clave || '@example.test', '[DEMO] ' || v.nombre, v.rol,
       c.usuario_id, v.estado, now() - v.hace, now() - v.hace
from (values
  (4, 16, '4', 'Invitación enviada a asistente',     'AST', 'enviada',   interval '3 hours'),
  (5, 17, '5', 'Invitación enviada a recepción',     'REC', 'enviada',   interval '2 days'),
  (6, 18, '6', 'Invitación expirada de enfermería',  'ENF', 'expirada',  interval '15 days'),
  (7, 19, '7', 'Invitación aceptada de médico',      'MED', 'aceptada',  interval '9 days'),
  (8, 20, '8', 'Invitación aceptada de laboratorio', 'LAB', 'aceptada',  interval '7 days'),
  (9, 21, '9', 'Invitación rechazada de paramédico', 'PAR', 'rechazada', interval '4 days')
) v(n, u, clave, nombre, rol, estado, hace)
join cuentas c on c.rol = 'ADM' and c.usuario_id is not null
on conflict do nothing;

commit;
