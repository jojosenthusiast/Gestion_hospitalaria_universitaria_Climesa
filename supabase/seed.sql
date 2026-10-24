-- Semillas ficticias del entorno de curso (ADR-0006, D-014). Ningún dato es real.
-- Supabase CLI las aplica con `supabase db reset`; en la nube se ejecutan una vez tras las migraciones.

-- ============ Edificio (D-055, REQ-HAB-01, 02, 06) ============
insert into infra.espacio (tipo, codigo, nombre, nivel) values ('hospital', 'HOSP', 'Hospital Universitario', null);
insert into infra.espacio (padre_id, tipo, codigo, nombre, nivel)
select (select id from infra.espacio where codigo = 'HOSP'), 'planta', 'P' || n, 'Planta ' || n, n from generate_series(1, 3) n;

-- Planta 1: recepción, espera, consultorios, emergencia, laboratorio, bahía, bodegas
insert into infra.espacio (padre_id, tipo, codigo, nombre, nivel)
select (select id from infra.espacio where codigo = 'P1'), t, c, nm, 1 from (values
  ('area', 'P1-REC', 'Recepción y admisión'),
  ('area', 'P1-ESP', 'Sala de espera'),
  ('area', 'P1-CON', 'Consulta general'),
  ('area', 'P1-EMG', 'Emergencia'),
  ('area', 'P1-LAB', 'Laboratorio'),
  ('bahia', 'P1-AMB', 'Bahía de ambulancia'),
  ('bodega', 'BOD-CEN', 'Bodega central'),
  ('bodega', 'BOD-LAB', 'Bodega de laboratorio')) v(t, c, nm);
insert into infra.espacio (padre_id, tipo, codigo, nombre, nivel)
select (select id from infra.espacio where codigo = 'P1-CON'), 'consultorio', 'C-10' || n, 'Consultorio C-10' || n, 1 from generate_series(1, 4) n;
insert into infra.espacio (padre_id, tipo, codigo, nombre, nivel)
select (select id from infra.espacio where codigo = 'P1-EMG'), 'cubiculo', 'E-0' || n, 'Cubículo E-0' || n, 1 from generate_series(1, 3) n;

-- Planta 2: 6 semiprivadas de 2 camas (12 camas)
insert into infra.espacio (padre_id, tipo, codigo, nombre, nivel)
values ((select id from infra.espacio where codigo = 'P2'), 'area', 'P2-HOS', 'Hospitalización semiprivada', 2);
insert into infra.espacio (padre_id, tipo, codigo, nombre, categoria, capacidad, nivel)
select (select id from infra.espacio where codigo = 'P2-HOS'), 'habitacion', 'HAB-20' || n, 'HAB-20' || n, 'semiprivada', 2, 2 from generate_series(1, 6) n;
insert into infra.espacio (padre_id, tipo, codigo, nombre, nivel)
select h.id, 'cama', h.codigo || '-' || l, 'Cama ' || l, 2 from infra.espacio h cross join (values ('A'), ('B')) v(l)
where h.codigo like 'HAB-20%';

-- Planta 3: 5 VIP individuales
insert into infra.espacio (padre_id, tipo, codigo, nombre, nivel)
values ((select id from infra.espacio where codigo = 'P3'), 'area', 'P3-VIP', 'Hospitalización VIP', 3);
insert into infra.espacio (padre_id, tipo, codigo, nombre, categoria, capacidad, nivel)
select (select id from infra.espacio where codigo = 'P3-VIP'), 'habitacion', 'VIP-30' || n, 'VIP-30' || n, 'vip', 1, 3 from generate_series(1, 5) n;
insert into infra.espacio (padre_id, tipo, codigo, nombre, nivel)
select h.id, 'cama', h.codigo || '-A', 'Cama A', 3 from infra.espacio h where h.codigo like 'VIP-30%';

insert into infra.tipo_equipo values ('monitor', 'Monitor de signos vitales'), ('bomba', 'Bomba de infusión'),
  ('oxigeno', 'Toma de oxígeno'), ('desfibrilador', 'Desfibrilador');
insert into infra.equipo (tipo, serie, espacio_id)
select 'monitor', 'MON-' || e.codigo, e.id from infra.espacio e where e.tipo = 'habitacion';
insert into infra.equipo (tipo, serie, espacio_id) values ('desfibrilador', 'DEF-EMG-1', (select id from infra.espacio where codigo = 'P1-EMG'));

-- ============ Ambulancia (REQ-AMB-01) ============
insert into ambulancia.unidad (placa, estado) values ('P-000-001', 'en_mantenimiento');  -- pasa a disponible cuando haya paramédico de turno (RN-30)

-- ============ Laboratorio (D-039; rangos ilustrativos, solo para demostración) ============
insert into laboratorio.examen (codigo, nombre, es_panel, unidad, tipo_resultado) values
 ('HEMO', 'Hemograma', true, null, 'numerico'),
 ('HB', 'Hemoglobina', false, 'g/dL', 'numerico'),
 ('HTO', 'Hematocrito', false, '%', 'numerico'),
 ('LEU', 'Leucocitos', false, 'x10³/µL', 'numerico'),
 ('PLQ', 'Plaquetas', false, 'x10³/µL', 'numerico'),
 ('QB', 'Química básica', true, null, 'numerico'),
 ('GLU', 'Glucosa', false, 'mg/dL', 'numerico'),
 ('CREA', 'Creatinina', false, 'mg/dL', 'numerico'),
 ('UREA', 'Nitrógeno ureico', false, 'mg/dL', 'numerico'),
 ('K', 'Potasio', false, 'mmol/L', 'numerico'),
 ('NA', 'Sodio', false, 'mmol/L', 'numerico'),
 ('LIP', 'Perfil lipídico', true, null, 'numerico'),
 ('COLT', 'Colesterol total', false, 'mg/dL', 'numerico'),
 ('TG', 'Triglicéridos', false, 'mg/dL', 'numerico'),
 ('EGO', 'Examen general de orina', true, null, 'texto'),
 ('EGO-ASP', 'Orina: aspecto', false, null, 'texto'),
 ('EGO-DEN', 'Orina: densidad', false, 'g/mL', 'numerico'),
 ('BHCG', 'Prueba de embarazo (β-hCG)', false, null, 'texto'),
 ('PRENATAL', 'Perfil prenatal', true, null, 'numerico');
insert into laboratorio.examen_componente (panel_id, componente_id, orden)
select p.id, c.id, v.o from (values
  ('HEMO','HB',1),('HEMO','HTO',2),('HEMO','LEU',3),('HEMO','PLQ',4),
  ('QB','GLU',1),('QB','CREA',2),('QB','UREA',3),('QB','K',4),('QB','NA',5),
  ('LIP','COLT',1),('LIP','TG',2),('EGO','EGO-ASP',1),('EGO','EGO-DEN',2),
  ('PRENATAL','HEMO',1),('PRENATAL','GLU',2),('PRENATAL','EGO',3)) v(pc, cc, o)
join laboratorio.examen p on p.codigo = v.pc join laboratorio.examen c on c.codigo = v.cc;
insert into laboratorio.rango_referencia (examen_id, sexo, edad_anios, minimo, maximo, critico_bajo, critico_alto, vigencia, fuente)
select e.id, v.s, int4range(18, 120), v.mi, v.ma, v.cb, v.ca, daterange('2026-01-01', null), 'Ilustrativo para el curso; no usar en atención real'
from (values
  ('HB','femenino',12.0,15.5,7.0,20.0), ('HB','masculino',13.5,17.5,7.0,20.0),
  ('HTO','femenino',36,46,20,60), ('HTO','masculino',41,53,20,60),
  ('LEU','cualquiera',4.0,11.0,2.0,30.0), ('PLQ','cualquiera',150,450,50,1000),
  ('GLU','cualquiera',70,100,40,400), ('CREA','femenino',0.5,1.1,null,5.0), ('CREA','masculino',0.7,1.3,null,5.0),
  ('UREA','cualquiera',7,20,null,100), ('K','cualquiera',3.5,5.0,2.5,6.0), ('NA','cualquiera',135,145,120,160),
  ('COLT','cualquiera',null,200,null,null), ('TG','cualquiera',null,150,null,1000),
  ('EGO-DEN','cualquiera',1.005,1.030,null,null)) v(c, s, mi, ma, cb, ca)
join laboratorio.examen e on e.codigo = v.c;

-- ============ CIE-10: subconjunto frecuente en consulta general (spec 106) ============
insert into atencion.cie10 (codigo, descripcion) values
 ('A09','Diarrea y gastroenteritis de presunto origen infeccioso'),('B34.9','Infección viral, no especificada'),
 ('E11.9','Diabetes mellitus tipo 2 sin complicaciones'),('E78.5','Hiperlipidemia, no especificada'),
 ('I10','Hipertensión esencial (primaria)'),('J00','Rinofaringitis aguda (resfriado común)'),
 ('J02.9','Faringitis aguda, no especificada'),('J03.9','Amigdalitis aguda, no especificada'),
 ('J06.9','Infección aguda de las vías respiratorias superiores, no especificada'),('J18.9','Neumonía, no especificada'),
 ('J20.9','Bronquitis aguda, no especificada'),('J30.4','Rinitis alérgica, no especificada'),
 ('J45.9','Asma, no especificada'),('K21.9','Enfermedad del reflujo gastroesofágico sin esofagitis'),
 ('K29.7','Gastritis, no especificada'),('K59.0','Constipación'),('L23.9','Dermatitis alérgica de contacto'),
 ('L50.9','Urticaria, no especificada'),('M54.5','Lumbago no especificado'),('M79.1','Mialgia'),
 ('N39.0','Infección de vías urinarias, sitio no especificado'),('O80','Parto único espontáneo'),
 ('R05','Tos'),('R10.4','Otros dolores abdominales y los no especificados'),('R50.9','Fiebre, no especificada'),
 ('R51','Cefalea'),('T78.4','Alergia no especificada'),('Z00.0','Examen médico general'),
 ('Z34.9','Supervisión de embarazo normal, no especificado'),('A90','Fiebre del dengue');

-- ============ Inventario ============
insert into inventario.articulo (codigo, nombre, tipo, unidad, minimo) values
 ('GAS-10','Gasa estéril 10x10','insumo','paquete',50),('JER-5','Jeringa 5 mL','insumo','unidad',200),
 ('GUA-M','Guantes de examen talla M','insumo','caja',20),('SOL-SAL','Solución salina 0.9% 1 L','insumo','bolsa',40),
 ('CAT-20','Catéter IV 20G','insumo','unidad',100),('TUB-LILA','Tubo de muestra tapón lila','reactivo','unidad',300),
 ('TUB-ROJO','Tubo de muestra tapón rojo','reactivo','unidad',300),('REA-GLU','Reactivo de glucosa','reactivo','kit',5),
 ('REA-HCG','Prueba rápida β-hCG','reactivo','unidad',30),('ALC-70','Alcohol 70% 1 L','insumo','frasco',10);
insert into inventario.lote (articulo_id, numero, vence)
select id, 'L-2026-01', date '2027-06-30' from inventario.articulo;
insert into inventario.existencia (lote_id, bodega_id, cantidad)
select l.id, (select id from infra.espacio where codigo = case when a.tipo = 'reactivo' then 'BOD-LAB' else 'BOD-CEN' end), a.minimo * 3
from inventario.lote l join inventario.articulo a on a.id = l.articulo_id;

-- ============ Personal ficticio (sin cuentas; las cuentas se invitan desde la web) ============
insert into personal.persona (nombres, apellidos, tipo, especialidad, area_id) values
 ('Rosa María','Aguilar Pineda','medico','Medicina general',(select id from infra.espacio where codigo='P1-CON')),
 ('Julio César','Martínez Ramos','medico','Emergencias',(select id from infra.espacio where codigo='P1-EMG')),
 ('Ana Lucía','Hernández Cruz','medico','Alergología',(select id from infra.espacio where codigo='P1-CON')),
 ('Karla Beatriz','López Mejía','enfermero',null,(select id from infra.espacio where codigo='P2-HOS')),
 ('Óscar Ernesto','Flores Díaz','enfermero',null,(select id from infra.espacio where codigo='P1-EMG')),
 ('Marta Elena','Rivas Orellana','asistente',null,(select id from infra.espacio where codigo='P1-CON')),
 ('Luis Alberto','Castro Menjívar','recepcionista',null,(select id from infra.espacio where codigo='P1-REC')),
 ('Sonia Patricia','Guzmán Alvarado','laboratorista',null,(select id from infra.espacio where codigo='P1-LAB')),
 ('Pedro Antonio','Ramírez Solís','paramedico',null,(select id from infra.espacio where codigo='P1-AMB')),
 ('José Rafael','Ortiz Lemus','motorista',null,(select id from infra.espacio where codigo='P1-AMB'));
insert into personal.inscripcion (persona_id, junta, numero, vigencia)
select id, case tipo when 'medico' then 'JVPM' when 'enfermero' then 'JVPE' else 'JVPL' end,
       'DEMO-' || row_number() over (), daterange('2026-01-01', '2027-12-31')
from personal.persona where tipo in ('medico', 'enfermero', 'laboratorista');
