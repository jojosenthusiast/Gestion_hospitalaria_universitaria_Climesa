-- Ronda 3: ubicación pública del hospital (nombre, dirección, teléfono y coordenadas) para la pantalla "Ubicación" de las apps.
-- Dato ficticio configurable como política vigente: cambiarlo es insertar una política nueva, no tocar código.
--
-- Pre-comprobación en producción (no debe existir la clave):
--   select clave, vigencia from plataforma.politica where clave = 'hospital.ubicacion';
--
-- Reversa:
--   delete from plataforma.politica where clave = 'hospital.ubicacion';

insert into plataforma.politica (clave, valor, vigencia, fuente, aprobado_por)
select 'hospital.ubicacion',
  '{"nombre":"Hospital CLIMESA","direccion":"Calle Ficticia 123, Colonia Ejemplo","municipio":"San Salvador","departamento":"San Salvador","telefono":"2200-0000","latitud":13.6989,"longitud":-89.1914}'::jsonb,
  tstzrange('2026-10-01', null), 'PDF del curso: ubicación del hospital', 'equipo SGHU'
where not exists (select 1 from plataforma.politica where clave = 'hospital.ubicacion');
