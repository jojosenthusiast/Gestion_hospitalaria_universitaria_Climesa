-- Auditoría 2026-11-13, DAT-01. Marcar un diagnóstico como principal desmarca el anterior con
-- `UPDATE atencion.diagnostico SET principal=false`, pero `sghu_api` solo tenía SELECT, INSERT y DELETE
-- sobre la tabla (20261017000600_atencion.sql). PostgreSQL exige el privilegio aunque no coincida ninguna
-- fila, así que todo diagnóstico principal respondía 500 (42501). Se concede UPDATE solo de la columna
-- `principal`; el resto del diagnóstico sigue sin poder cambiarse (nada clínico se edita).

grant update (principal) on atencion.diagnostico to sghu_api;

-- Reversión (manual):
-- revoke update (principal) on atencion.diagnostico from sghu_api;
