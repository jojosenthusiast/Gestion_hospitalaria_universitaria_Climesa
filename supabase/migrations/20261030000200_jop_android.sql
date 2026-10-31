-- El Jefe de Operaciones usa tambien la app Android (ademas de la web). La semilla solo inserta (do nothing en conflicto),
-- asi que en una base ya sembrada hay que actualizar la plataforma. Idempotente. Aplicar en el proyecto remoto antes de probar.

update acceso.rol set plataformas = array['Android', 'Web']
where codigo = 'JOP' and plataformas is distinct from array['Android', 'Web'];
