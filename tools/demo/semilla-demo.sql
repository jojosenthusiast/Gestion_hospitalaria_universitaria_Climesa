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
--   * Pacientes: expediente 99000nn-d (rango 9900001 a 9900099) y DUI 9000nnnn-d.
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
  (pg_temp.did('0020', 3), pg_temp.espacio('P1'), 'bodega', 'BOD-URG', 'Bodega de urgencias', 1)
on conflict do nothing;

insert into infra.espacio (id, padre_id, tipo, codigo, nombre, categoria, capacidad, nivel)
select pg_temp.did('0020', 10 + h.n), pg_temp.espacio('P4-HOS'), 'habitacion', h.cod, h.cod, h.cat, h.cap, 4
from (values (1, 'HAB-401', 'semiprivada', 2), (2, 'HAB-402', 'semiprivada', 2), (3, 'HAB-403', 'semiprivada', 2),
             (4, 'HAB-404', 'semiprivada', 2), (5, 'VIP-401', 'vip', 1), (6, 'VIP-402', 'vip', 1)) h(n, cod, cat, cap)
on conflict do nothing;

insert into infra.espacio (id, padre_id, tipo, codigo, nombre, nivel)
select pg_temp.did('0020', 100 + (h.n - 1) * 2 + l.o), pg_temp.did('0020', 10 + h.n), 'cama', h.cod || '-' || l.letra, 'Cama ' || l.letra, 4
from (values (1, 'HAB-401', 2), (2, 'HAB-402', 2), (3, 'HAB-403', 2), (4, 'HAB-404', 2), (5, 'VIP-401', 1), (6, 'VIP-402', 1)) h(n, cod, cap)
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
  (17, 'Rina Marisol',         'Castañeda Iraheta',  'enfermero',     null,                         'P1-EMG')
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
-- N2 nocturno 19-07 en días alternos, G4 guardia de 24 h cada cuatro días, A2 diurno en días alternos.
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
  (9,  pg_temp.persona('ENF'),  'P2-HOS', 'D5'),
  (10, pg_temp.did('0002', 6),  'P2-HOS', 'T5'),
  (11, pg_temp.did('0002', 8),  'P3-VIP', 'D5'),
  (12, pg_temp.persona('AST'),  'P1-CON', 'D5'),
  (13, pg_temp.did('0002', 9),  'P1-CON', 'T5'),
  (14, pg_temp.persona('REC'),  'P1-REC', 'D5'),
  (15, pg_temp.did('0002', 10), 'P1-REC', 'T5'),
  (16, pg_temp.persona('LAB'),  'P1-LAB', 'D5'),
  (17, pg_temp.did('0002', 11), 'P1-LAB', 'T5'),
  (18, pg_temp.persona('PAR'),  'P1-AMB', 'D7'),
  (19, pg_temp.did('0002', 12), 'P1-AMB', 'T5'),
  (20, pg_temp.did('0002', 13), 'P1-AMB', 'D5'),
  (21, pg_temp.did('0002', 14), 'P2-HOS', 'D5'),
  (22, pg_temp.did('0002', 15), 'P1-REC', 'D5');
-- La cardióloga (persona demo 4) no tiene plan a propósito: en la agenda aparece como "Sin turno".

insert into personal.turno (id, persona_id, area_id, periodo, tipo, estado, justificacion, publicado_por, publicado_en, creado_por)
select pg_temp.did('0003', b.idx * 100 + b.d + 2), b.persona, pg_temp.espacio(b.area),
       tstzrange(b.ini, b.fin, '[)'), b.tipo,
       case when b.idx = 2 and b.d = 3 then 'cancelado'
            when b.fin <= now() then 'completado'
            when b.ini <= now() then 'en_curso'
            when b.d >= 11 and b.idx in (13, 15, 17) then 'borrador'
            else 'publicado' end,
       case when b.idx = 2 and b.d = 3 then '[DEMO] Turno cancelado: aparece tachado en la planificación y no cuenta como cobertura'
            when b.d >= 11 and b.idx in (13, 15, 17) then '[DEMO] Borrador: solo ADM y JOP lo ven hasta que lo publican'
            when b.idx = 1 and b.d = 0 then '[DEMO] Turno de la cuenta MED de prueba: sin turno no hay citas disponibles en la agenda'
            when b.idx = 5 and b.d = 0 then '[DEMO] Guardia médica de 24 h, el máximo que permite la política de turnos'
            when b.idx = 6 and b.d = 0 then '[DEMO] Turno nocturno de 12 h que termina al día siguiente'
            end,
       pg_temp.actor('JOP'), now() - interval '1 day', pg_temp.actor('JOP')
from (
  select p.idx, p.persona, p.area, d.d,
         case when p.patron = 'D7' or (p.patron = 'D5' and extract(isodow from pg_temp.hoy() + d.d) <= 5)
                   or (p.patron = 'A2' and mod(mod(d.d, 2) + 2, 2) = 0) then pg_temp.ts(pg_temp.hoy() + d.d, 7)
              when p.patron = 'T5' and extract(isodow from pg_temp.hoy() + d.d) <= 5 then pg_temp.ts(pg_temp.hoy() + d.d, 13)
              when p.patron = 'N2' and mod(mod(d.d, 2) + 2, 2) = 0 then pg_temp.ts(pg_temp.hoy() + d.d, 19)
              when p.patron = 'G4' and mod(mod(d.d, 4) + 4, 4) = 0 then pg_temp.ts(pg_temp.hoy() + d.d, 7) end as ini,
         case when p.patron in ('D7', 'D5', 'A2') then pg_temp.ts(pg_temp.hoy() + d.d, 14)
              when p.patron = 'T5' then pg_temp.ts(pg_temp.hoy() + d.d, 20)
              when p.patron in ('N2', 'G4') then pg_temp.ts(pg_temp.hoy() + d.d + 1, 7) end as fin,
         case when p.patron = 'N2' then 'nocturno' when p.patron = 'G4' then 'guardia' else 'diurno' end as tipo
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
  (46, 7,  1, -2, '11:00',  'atendida',   'recepcion', '[DEMO] Consulta previa al ingreso hospitalario', null);

insert into atencion.cita (id, paciente_id, medico_id, horario, motivo, estado, origen, motivo_rechazo, creado_por, creado_en)
select pg_temp.did('0004', c.n), pg_temp.did('0001', c.pac),
       case c.med when 0 then pg_temp.persona('MED') else pg_temp.did('0002', c.med) end,
       tstzrange(pg_temp.tl(pg_temp.hoy() + c.dd, c.hora), pg_temp.tl(pg_temp.hoy() + c.dd, c.hora) + interval '20 minutes', '[)'),
       c.motivo, c.estado, c.origen, c.rechazo,
       case when c.origen = 'recepcion' then pg_temp.actor('REC') end,
       least(now(), pg_temp.tl(pg_temp.hoy() + c.dd, c.hora)) - interval '2 days'
from cdemo c
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
  (10, 138, 88, 112, 22, 37.1, 95, 87.0, 174);

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
      insert into atencion.receta (id, consulta_id, emitida_en) values (v_receta, v_id, v_inicio + interval '15 minutes');
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
      update atencion.consulta set estado = 'firmada', firmada_en = v_inicio + interval '25 minutes', version = 2 where id = v_id;
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
    v_creada := now() - o.hace;
    insert into laboratorio.orden (id, consulta_id, admision_id, paciente_id, medico_id, prioridad, estado, motivo_cancelacion,
      muestra_tomada_en, muestra_tomada_por, completada_en, completada_por, revisada_en, revisada_por, creada_en)
    values (v_orden,
      (select id from atencion.consulta where id = pg_temp.did('0006', o.consulta)),
      case when o.admision is not null then pg_temp.did('0060', o.admision) end,
      pg_temp.did('0001', o.pac), v_med, o.prio, o.estado, o.cancel,
      case when o.muestra then v_creada + interval '10 minutes' end, case when o.muestra then pg_temp.actor('LAB') end,
      case when o.estado = 'completado' then v_creada + interval '90 minutes' end, case when o.estado = 'completado' then pg_temp.actor('LAB') end,
      case when o.revisada then v_creada + interval '120 minutes' end, case when o.revisada then pg_temp.actor('MED') end,
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
       rr.id, pg_temp.actor('LAB'), o.creada_en + interval '80 minutes', 1
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
-- 9. Hospitalización: admisiones, camas ocupadas / reservada / bloqueada / en limpieza, traslado y altas
-- ---------------------------------------------------------------------------------------------------------
insert into hospitalizacion.admision (id, paciente_id, origen, origen_id, categoria_pedida, sexo_paciente, aislamiento, medico_tratante_id,
  fecha_programada, estado, creado_por, creado_en)
select pg_temp.did('0060', a.n), pg_temp.did('0001', a.pac), a.origen,
       case a.origen when 'emergencia' then pg_temp.did('0005', 10) when 'ambulancia' then pg_temp.did('0070', 4) when 'consulta' then pg_temp.did('0006', 11) end,
       a.cat, p.sexo, a.aisl, case a.tratante when 0 then pg_temp.persona('MED') else pg_temp.did('0002', a.tratante) end,
       case a.origen when 'programada' then now() + a.prog end, a.estado, pg_temp.actor('MED'), now() - a.hace
from (values
  (1, 7,  'consulta',   'semiprivada', false, 1, interval '0',      'hospitalizado',  interval '2 days'),
  (2, 8,  'programada', 'semiprivada', false, 1, interval '-3 days', 'hospitalizado', interval '3 days'),
  (3, 9,  'emergencia', 'semiprivada', true,  3, interval '0',      'hospitalizado',  interval '1 day'),
  (4, 10, 'ambulancia', 'vip',         false, 0, interval '0',      'alta_firmada',   interval '4 days'),
  (5, 11, 'programada', 'vip',         false, 0, interval '1 day',  'pendiente_cama', interval '3 hours'),
  (6, 12, 'programada', 'semiprivada', false, 1, interval '-3 days', 'egresado',      interval '3 days')
) a(n, pac, origen, cat, aisl, tratante, prog, estado, hace)
join pacientes.paciente p on p.id = pg_temp.did('0001', a.pac)
where case a.tratante when 0 then pg_temp.persona('MED') else pg_temp.did('0002', a.tratante) end is not null
on conflict do nothing;

-- Ocupaciones: abiertas (sin fin) o cerradas con su motivo. Un traslado: la admisión 2 pasó de HAB-403 B a HAB-401 B.
insert into hospitalizacion.ocupacion_cama (id, admision_id, cama_id, habitacion_id, categoria, periodo, motivo_fin, asignado_por)
select pg_temp.did('0061', o.n), pg_temp.did('0060', o.adm), pg_temp.espacio(o.cama), pg_temp.espacio(o.hab), o.cat,
       tstzrange(now() - o.desde, now() - o.hasta, '[)'), o.fin, pg_temp.actor('ENF')
from (values
  (1, 1, 'HAB-401-A', 'HAB-401', 'semiprivada', interval '2 days',  null::interval,         null),
  (2, 2, 'HAB-403-B', 'HAB-403', 'semiprivada', interval '3 days',  interval '1 day',       'traslado'),
  (3, 2, 'HAB-401-B', 'HAB-401', 'semiprivada', interval '1 day',   null::interval,         null),
  (4, 3, 'HAB-402-A', 'HAB-402', 'semiprivada', interval '1 day',   null::interval,         null),
  (5, 4, 'VIP-401-A', 'VIP-401', 'vip',         interval '4 days',  null::interval,         null),
  (6, 6, 'HAB-403-A', 'HAB-403', 'semiprivada', interval '3 days',  interval '2 hours',     'egreso')
) o(n, adm, cama, hab, cat, desde, hasta, fin)
where exists (select 1 from hospitalizacion.admision where id = pg_temp.did('0060', o.adm))
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
select pg_temp.did('0064', v.n), pg_temp.did('0060', v.adm), pg_temp.actor('ENF'), v.texto, now() - v.hace
from (values
  (1, 1, '[DEMO] Nota de enfermería: paciente estable, tolera la dieta, sin dolor.', interval '6 hours'),
  (2, 2, '[DEMO] Nota de enfermería: se trasladó de cama; ayuda para levantarse.', interval '20 hours'),
  (3, 3, '[DEMO] Nota de enfermería: aislamiento de contacto; la cama vecina queda bloqueada.', interval '5 hours'),
  (4, 4, '[DEMO] Nota de enfermería: familia informada del alta, espera transporte.', interval '1 hour')
) v(n, adm, texto, hace)
where exists (select 1 from hospitalizacion.admision where id = pg_temp.did('0060', v.adm))
on conflict do nothing;

insert into atencion.signos_vitales (id, paciente_id, admision_id, tomado_por, tomado_en, pa_sistolica, pa_diastolica, fc, fr, temperatura, sat_o2, peso_kg, talla_cm)
select pg_temp.did('0043', 100 + v.n), pg_temp.did('0001', v.pac), pg_temp.did('0060', v.adm), pg_temp.actor('ENF'), now() - v.hace,
       v.ps, v.pd, v.fc, v.fr, v.t, v.sat, v.peso, null
from (values
  (1, 7, 1, interval '5 hours', 122, 78, 84, 18, 36.7, 98, 64.0),
  (2, 8, 2, interval '4 hours', 134, 84, 80, 18, 36.5, 96, 70.5),
  (3, 9, 3, interval '3 hours', 130, 86, 96, 20, 37.8, 94, 88.0)
) v(n, pac, adm, hace, ps, pd, fc, fr, t, sat, peso)
where exists (select 1 from hospitalizacion.admision where id = pg_temp.did('0060', v.adm))
on conflict do nothing;

insert into atencion.relacion_atencion (id, paciente_id, profesional_id, origen, origen_id, vigencia)
select pg_temp.did('0045', 100 + (row_number() over (order by a.id))::int), a.paciente_id, a.medico_tratante_id, 'admision', a.id,
       tstzrange(a.creado_en, a.creado_en + interval '30 days')
from hospitalizacion.admision a where a.id::text like 'de300000-%' and a.estado <> 'pendiente_cama'
on conflict do nothing;

-- Camas: bloqueos, limpieza y equipo. Las camas ocupadas, la reservada y las libres salen de la vista infra.v_estado_cama.
insert into infra.bloqueo_cama (id, cama_id, periodo, motivo, origen, creado_por)
values
  (pg_temp.did('0022', 1), pg_temp.espacio('HAB-402-B'), tstzrange(now() - interval '1 day', now() + interval '7 days', '[)'),
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
  (6, 'app_paciente', 24,   'Col. El Cañaveral, Apopa', 13.8010, -89.1690, 'Apopa', '[DEMO] Solicitud confirmada con servicio en curso', '7222-0006', 'confirmada', null, interval '30 minutes')
) s(n, canal, pac, dir, lat, lon, mun, motivo, tel, estado, descarte, hace)
on conflict do nothing;

-- Nombre que dio quien llamó (ficticio); la solicitud de la app toma el del paciente.
update ambulancia.solicitud set solicitante_nombre = case id
    when pg_temp.did('0071', 2) then 'Marta Elena Quintanilla'
    when pg_temp.did('0071', 4) then 'Rigoberto Alas Mejía' end
  where id in (pg_temp.did('0071', 2), pg_temp.did('0071', 4)) and solicitante_nombre is null;

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
       array['salida','en_escena'], 'rechaza_traslado', '[DEMO] El paciente rechazó el traslado y firmó el rechazo')
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
      (v_serv, pg_temp.persona('PAR'), 'paramedico'), (v_serv, pg_temp.did('0002', 13), 'motorista')
    on conflict do nothing;
    if cardinality(s.hit) > 1 then
      insert into ambulancia.reporte_prehospital (id, servicio_id, motivo, prioridad, signos, llegada_estimada, enviado_por, capturado_en, recibido_en, recibido_por, clave_idempotencia)
      values (pg_temp.did('0073', s.n), v_serv, '[DEMO] Reporte prehospitalario enviado desde la app del paramédico', s.prio,
              '{"paSistolica": 150, "paDiastolica": 95, "fc": 104, "sat": 93}'::jsonb, v_base + interval '40 minutes', pg_temp.actor('PAR'),
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
-- 11. Inventario: artículos, lotes (uno vencido), existencias (varias bajo el mínimo) y movimientos
-- ---------------------------------------------------------------------------------------------------------
create temp table idemo (n int primary key, cod text, nombre text, tipo text, unidad text, minimo numeric, lote text, vence date,
  bodega text, entrada numeric, salida numeric, tipo_salida text, traslado numeric, ajuste numeric) on commit drop;
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
  (11, 'DEMO-VENDA',  'Venda elástica 10 cm',               'insumo',       'unidad',   40, 'DL-26-A', null,              'BOD-CEN', 90,  35,  'salida',  0, 0);

insert into inventario.articulo (id, codigo, nombre, tipo, unidad, minimo)
select distinct on (i.cod) pg_temp.did('0080', i.n), i.cod, i.nombre, i.tipo, i.unidad, i.minimo from idemo i order by i.cod, i.n
on conflict do nothing;

insert into inventario.lote (id, articulo_id, numero, vence)
select pg_temp.did('0081', i.n), a.id, i.lote, i.vence from idemo i join inventario.articulo a on a.codigo = i.cod
on conflict do nothing;

insert into inventario.existencia (lote_id, bodega_id, cantidad)
select pg_temp.did('0081', i.n), pg_temp.espacio(i.bodega), i.entrada - i.salida - i.traslado - i.ajuste from idemo i
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
       case when m.tipo = 'consumo' then pg_temp.did('0001', 3) end,
       pg_temp.actor('AST'), now() - m.hace, 'demo-mov-' || i.n || '-' || m.k
from idemo i
cross join lateral (values
  (1, 'entrada', i.entrada, '[DEMO] Entrada inicial del lote: así se ve una compra recibida en la bodega', interval '20 days'),
  (2, i.tipo_salida, i.salida, case i.tipo_salida when 'consumo' then '[DEMO] Consumo con paciente: queda ligado a su expediente' else '[DEMO] Salida de la bodega para el servicio' end, interval '5 days'),
  (3, 'traslado', i.traslado, '[DEMO] Traslado entre bodegas: baja en una y sube en la otra', interval '3 days'),
  (4, 'ajuste', i.ajuste, '[DEMO] Ajuste por conteo físico: resta lo que faltaba en el estante', interval '1 day')
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

commit;
