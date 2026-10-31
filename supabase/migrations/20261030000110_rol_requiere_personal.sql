-- Atributo de rol: los roles de trabajo exigen una persona del directorio vinculada a la cuenta.
-- Reemplaza la lista de códigos de rol que validaba la API (regla 8 de AGENTS.md). Conserva el comportamiento vigente.
-- Idempotente.

alter table acceso.rol add column if not exists requiere_personal boolean not null default false;

update acceso.rol set requiere_personal = true
where codigo in ('REC', 'AST', 'ENF', 'MED', 'LAB', 'PAR') and not requiere_personal;