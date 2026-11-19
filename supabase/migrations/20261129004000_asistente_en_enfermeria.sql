-- Lote 5 S10 (decisión del propietario 2026-11-19, «Unir en Enfermería»): el rol Asistente (AST) se retira y sus cuentas pasan a
-- Enfermería (ENF), que absorbe la estación del asistente. ENF conserva todo lo que AST tenía: gana `fila.ver`, `fila.llamar`,
-- `fila.gestionar` y `citas.ver` (los demás permisos de AST ya eran de ENF con el mismo o más alcance).
-- El rol AST queda en el catálogo (lo referencian la auditoría y el historial), sin permisos, sin cuentas y no invitable.
-- La función de la persona en el directorio (`personal.persona.tipo = 'asistente'`) no cambia: es el puesto, no la cuenta.
-- Idempotente: repetirla no cambia nada.
--
-- Pre-comprobación en producción (filas reales que cambia):
--   -- 1. Cuentas con AST (todas pierden AST; las que no tenían ENF lo ganan):
--   select count(*) as con_ast, count(*) filter (where not exists (select 1 from acceso.asignacion_rol e
--            where e.usuario_id = a.usuario_id and e.rol_codigo = 'ENF')) as ganan_enf
--     from acceso.asignacion_rol a where a.rol_codigo = 'AST';
--   -- 2. Permisos que ENF gana (deben salir fila.ver, fila.llamar, fila.gestionar, citas.ver):
--   select a.permiso_codigo from acceso.rol_permiso a where a.rol_codigo = 'AST'
--      and not exists (select 1 from acceso.rol_permiso e where e.rol_codigo = 'ENF' and e.permiso_codigo = a.permiso_codigo);
--   -- 3. Asignaciones rol-permiso de AST que se borran:
--   select count(*) from acceso.rol_permiso where rol_codigo = 'AST';
--   -- 4. Avisos dirigidos a AST que pasan a ENF (los retirados no cambian):
--   select count(*) filter (where retirado_en is null) as pasan_a_enf, count(*) filter (where retirado_en is not null) as retirados_sin_cambio
--     from publico.aviso where 'AST' = any(roles);
--
-- Reversa (manual, con la lista de cuentas de la pre-comprobación 1 guardada antes de aplicar):
--   insert into acceso.rol_permiso (rol_codigo, permiso_codigo, contexto) values ('AST','pacientes.buscar','x'),
--     ('AST','pacientes.ver_ficha','area'),('AST','pacientes.ver_nacimiento','x'),('AST','turnos.ver','x'),('AST','espacios.ver','x'),
--     ('AST','fila.ver','x'),('AST','fila.llamar','x'),('AST','fila.gestionar','x'),('AST','citas.ver','x'),('AST','signos.registrar','x'),
--     ('AST','sesion.perfil','x') on conflict do nothing;
--   delete from acceso.rol_permiso where rol_codigo = 'ENF' and permiso_codigo in ('fila.ver','fila.llamar','fila.gestionar','citas.ver');
--   update acceso.rol set invitable = true, descripcion = 'Apoya la consulta: prepara al paciente, toma signos vitales, llama y mueve la fila del consultorio.' where codigo = 'AST';
--   -- y volver a asignar AST (y quitar ENF a las que lo ganaron) con la lista guardada.

-- 1. ENF gana lo que solo AST tenía, con el contexto de AST.
insert into acceso.rol_permiso (rol_codigo, permiso_codigo, contexto)
select 'ENF', a.permiso_codigo, a.contexto from acceso.rol_permiso a
 where a.rol_codigo = 'AST'
   and not exists (select 1 from acceso.rol_permiso e where e.rol_codigo = 'ENF' and e.permiso_codigo = a.permiso_codigo)
on conflict (rol_codigo, permiso_codigo) do nothing;

-- 2. Cada cuenta con AST queda con ENF (sin duplicar) y sin AST.
insert into acceso.asignacion_rol (usuario_id, rol_codigo, asignado_por, asignado_en)
select a.usuario_id, 'ENF', a.asignado_por, now() from acceso.asignacion_rol a
 where a.rol_codigo = 'AST'
on conflict (usuario_id, rol_codigo) do nothing;
delete from acceso.asignacion_rol where rol_codigo = 'AST';

-- 3. AST sin permisos, retirado y no invitable.
delete from acceso.rol_permiso where rol_codigo = 'AST';
update acceso.rol set invitable = false,
  descripcion = 'Retirado (Lote 5): sus cuentas y funciones pasaron a Enfermería.'
 where codigo = 'AST';

-- 4. Los avisos dirigidos a AST llegan a ENF.
-- Solo avisos sin retirar: un aviso retirado no admite cambios (trigger `aviso_sin_cambios_tras_retiro`) y conserva su audiencia.
update publico.aviso set roles = array(select distinct r from unnest(array_replace(roles, 'AST', 'ENF')) r order by r),
       version = version + 1
 where 'AST' = any(roles) and retirado_en is null;
