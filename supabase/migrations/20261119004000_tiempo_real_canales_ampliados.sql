-- Tiempo real entre plataformas (auditoría de cobertura, docs/arquitectura/tiempo-real.md).
-- Algunos eventos llegaban solo a una parte de quienes leen esa información: los turnos solo a JOP y ADM,
-- los avisos públicos solo al canal `publico` (que web y Android no escuchan con sesión), las citas nunca al
-- médico de la cita, las admisiones nunca al paciente. El resultado: listas que no se actualizaban en otra
-- plataforma o en otro rol hasta recargar.
--
-- Este disparador amplía `canales` ANTES de insertar en `plataforma.outbox`, así el broadcast
-- (`outbox_publicar`) y la recuperación (`GET /eventos`, que filtra por `canales`) ven lo mismo.
-- Regla 8: los canales `rol:*` salen del catálogo de permisos (`acceso.rol_permiso`), como `channelsFor`
-- en la API; los contextos propios del paciente nunca abren un canal de rol (SEG-05).
-- Privacidad: el evento delgado solo lleva tipo, entidad, id y versión. Cada cliente vuelve a pedir el dato
-- a la API con su propio permiso, así que ampliar el aviso no amplía lo que se puede leer.

create function plataforma.canales_por_permiso(p_permisos text[]) returns text[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct 'rol:' || rp.rol_codigo), '{}'::text[])
  from acceso.rol_permiso rp
  where rp.permiso_codigo = any(p_permisos)
    and rp.contexto <> all(array['propio', 'propio_revisado'])
$$;

create function plataforma.ampliar_canales() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  extra text[] := '{}'::text[];
  cuenta uuid;
  es_uuid boolean := new.entidad_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
begin
  -- Los derivados agregados ya nacen con sus canales (`plataforma.derivar_eventos`).
  if new.entidad in ('publico', 'metricas') then
    return new;
  end if;

  case new.entidad
    -- Horarios: todo rol que ve turnos (agenda de citas, médicos disponibles, tripulación de ambulancia).
    when 'turno' then
      extra := plataforma.canales_por_permiso(array['turnos.ver']);
    when 'personal' then
      extra := plataforma.canales_por_permiso(array['personal.ver', 'usuarios.ver']);
    when 'usuario' then
      extra := plataforma.canales_por_permiso(array['usuarios.ver']);
    when 'caso_duplicado' then
      extra := plataforma.canales_por_permiso(array['pacientes.gestionar_duplicados']);
    -- Estado de la ambulancia y bitácora. La ubicación en vivo (cada pocos segundos) no se amplía.
    when 'unidad', 'servicio', 'solicitud' then
      if new.tipo <> 'ambulancia.ubicacion' then
        extra := plataforma.canales_por_permiso(array['ambulancia.ver_estado', 'ambulancia.ver_bitacora']);
      end if;
    -- Avisos: quien los administra siempre; un aviso público lo ve toda cuenta con sesión (`GET /me/avisos`).
    when 'aviso' then
      extra := plataforma.canales_por_permiso(array['avisos.publicar']);
      if 'publico' = any(new.canales) then
        extra := extra || plataforma.canales_por_permiso(array['sesion.perfil']);
      end if;
    -- La cita llega también a la cuenta del médico de esa cita (su `citas.ver` es propio).
    when 'cita' then
      if es_uuid then
        select u.id into cuenta
        from atencion.cita c join acceso.usuario u on u.persona_personal_id = c.medico_id
        where c.id = new.entidad_id::uuid;
        if cuenta is not null then extra := array['usuario:' || cuenta::text]; end if;
      end if;
    -- La admisión llega también a la cuenta del paciente internado (`admision.ver` propio).
    when 'admision' then
      if es_uuid then
        select u.id into cuenta
        from hospitalizacion.admision a join acceso.usuario u on u.paciente_id = a.paciente_id
        where a.id = new.entidad_id::uuid;
        if cuenta is not null then extra := array['usuario:' || cuenta::text]; end if;
      end if;
    else
      null;
  end case;

  if cardinality(extra) > 0 then
    new.canales := array(select distinct canal from unnest(new.canales || extra) as canal order by canal);
  end if;
  return new;
end $$;

create trigger outbox_ampliar_canales before insert on plataforma.outbox
  for each row execute function plataforma.ampliar_canales();

revoke all on function plataforma.canales_por_permiso(text[]) from public;
revoke all on function plataforma.ampliar_canales() from public;

-- Reversión (manual, en este orden):
-- drop trigger if exists outbox_ampliar_canales on plataforma.outbox;
-- drop function if exists plataforma.ampliar_canales();
-- drop function if exists plataforma.canales_por_permiso(text[]);
