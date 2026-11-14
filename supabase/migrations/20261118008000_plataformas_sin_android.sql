-- Generado por tools/generar_docs.py desde PLATAFORMAS_SIN_ANDROID y roles.csv. No editar a mano.
-- Ronda 3: Jefe de Operaciones y Laboratorio no usan Android (PDF del curso, decisión del propietario).
-- Idempotente: fija las plataformas actuales de cada rol; repetirla no cambia nada.
--
-- Pre-comprobación en producción (valores esperados antes: JOP {Android,Web}, LAB {Web,Android}):
--   select codigo, plataformas from acceso.rol where codigo in ('JOP', 'LAB');
--
-- Reversa:
--   update acceso.rol set plataformas = array['Android', 'Web'] where codigo = 'JOP';
--   update acceso.rol set plataformas = array['Web', 'Android'] where codigo = 'LAB';

update acceso.rol set plataformas = array['Web'] where codigo = 'JOP';
update acceso.rol set plataformas = array['Web'] where codigo = 'LAB';
