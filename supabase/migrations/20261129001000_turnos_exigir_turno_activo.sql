-- Lote 5, S9: el personal que trabaja por turnos (REC, AST, ENF, MED, LAB, PAR) solo ejecuta comandos operativos con un
-- turno publicado, en curso o recién completado que cubra la hora actual, con 30 minutos de margen antes y después
-- (SHIFT_GRACE_MINUTES en api/src/platform/shift-gate.ts). ADM, DPD y JOP quedan exentos; las lecturas siguen permitidas.
-- La API rechaza con 403 `sin_turno_activo`: «No tienes un turno activo. Pide a Jefatura que publique tu turno.»
--
-- Esta política es el interruptor: mientras su vigencia contiene la hora, la regla aplica. Para apagarla sin desplegar:
--   update plataforma.politica set vigencia = tstzrange(lower(vigencia), now()) where clave = 'turnos.exigir_turno_activo' and upper_inf(vigencia);
--
-- No cambia filas existentes. Pre-comprobación en producción (cuentas de personal por turnos que hoy quedarían sin poder
-- escribir porque no tienen turno que cubra la hora actual):
--   select r.rol_codigo, count(distinct u.id) from acceso.usuario u join acceso.asignacion_rol r on r.usuario_id = u.id
--    where u.estado = 'activo' and r.rol_codigo in ('REC','AST','ENF','MED','LAB','PAR')
--      and not exists (select 1 from personal.turno t where t.persona_id = u.persona_personal_id
--                       and t.estado in ('publicado','en_curso','completado')
--                       and lower(t.periodo) - interval '30 minutes' <= now() and upper(t.periodo) + interval '30 minutes' > now())
--    group by r.rol_codigo;
--
-- Reversa:
--   delete from plataforma.politica where clave = 'turnos.exigir_turno_activo';

insert into plataforma.politica (clave, valor, vigencia, fuente, aprobado_por) values
 ('turnos.exigir_turno_activo', jsonb_build_object('margen_minutos', 30, 'roles', jsonb_build_array('REC','AST','ENF','MED','LAB','PAR')),
  tstzrange('2026-10-01', null), 'Lote 5 S9: sin turno activo no hay flujo de trabajo normal (decisión del propietario 2026-11-19)', 'propietario')
on conflict do nothing;
