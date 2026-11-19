-- Lote 5 S10 (decisión del propietario 2026-11-19, «Todo el hospital»): Enfermería trabaja en todos los pisos. Estos cuatro
-- permisos de ENF pasan del contexto `area` (solo el área de su turno) a `x` (todo el hospital). Siguen igual
-- `expediente.ver relacion`, `resultados.ver relacion` e `inventario.mover consumo`.
-- Escrita a mano: las migraciones generadas siguen emitiendo `area` (regla 10); tools/generar_docs.py lleva estos cambios en
-- AJUSTES_CONTEXTO_LOTE5 y --verificar exige que permisos.csv diga `x`. Idempotente: solo cambia filas que aún dicen `area`.
--
-- Pre-comprobación en producción (deben salir 4 filas con contexto `area`):
--   select rol_codigo, permiso_codigo, contexto from acceso.rol_permiso
--    where rol_codigo = 'ENF'
--      and permiso_codigo in ('admision.ver', 'pacientes.ver_ficha', 'camas.ver_ocupante', 'enfermeria.registrar')
--    order by permiso_codigo;
--
-- Reversa exacta:
--   update acceso.rol_permiso set contexto = 'area'
--    where rol_codigo = 'ENF' and contexto = 'x'
--      and permiso_codigo in ('admision.ver', 'pacientes.ver_ficha', 'camas.ver_ocupante', 'enfermeria.registrar');

update acceso.rol_permiso set contexto = 'x'
 where rol_codigo = 'ENF' and contexto = 'area'
   and permiso_codigo in ('admision.ver', 'pacientes.ver_ficha', 'camas.ver_ocupante', 'enfermeria.registrar');
