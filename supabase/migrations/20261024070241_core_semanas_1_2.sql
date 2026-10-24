-- Core S1/S2. Se aplica después de las migraciones originales; no borra datos.
grant delete on pacientes.busqueda_registro to sghu_api;
create index if not exists paciente_creado on pacientes.paciente(creado_en desc,id);
create index if not exists busqueda_usuario_vigencia on pacientes.busqueda_registro(usuario_id,vence_en);
create index if not exists persona_area on personal.persona(area_id) where activo;
create index if not exists auditoria_entidad on plataforma.auditoria(entidad,entidad_id,seq);
create index if not exists turno_persona_inicio on personal.turno(persona_id,lower(periodo));

-- Serializa eliminación de ADM y desactivación de cuentas en una misma sección crítica.
create or replace function acceso.proteger_ultimo_admin() returns trigger language plpgsql set search_path='' as $$
begin
  if old.rol_codigo='ADM' then
    perform pg_advisory_xact_lock(671001);
    if exists(select 1 from acceso.usuario where id=old.usuario_id and estado='activo')
      and not exists(select 1 from acceso.asignacion_rol a join acceso.usuario u on u.id=a.usuario_id where a.rol_codigo='ADM' and u.estado='activo' and a.usuario_id<>old.usuario_id) then
      raise exception 'ultimo_administrador' using errcode='P0001';
    end if;
  end if;
  return old;
end $$;
create function acceso.proteger_desactivacion() returns trigger language plpgsql set search_path='' as $$
begin
  if old.estado='activo' and new.estado='desactivado' then
    perform pg_advisory_xact_lock(671001);
    if exists(select 1 from acceso.asignacion_rol where usuario_id=old.id and rol_codigo='ADM')
      and not exists(select 1 from acceso.asignacion_rol a join acceso.usuario u on u.id=a.usuario_id where a.rol_codigo='ADM' and u.estado='activo' and a.usuario_id<>old.id) then
      raise exception 'ultimo_administrador' using errcode='P0001';
    end if;
  end if;
  return new;
end $$;
create trigger usuario_ultimo_admin before update of estado on acceso.usuario for each row execute function acceso.proteger_desactivacion();

create or replace function acceso.canales_de(p_usuario uuid) returns text[] language sql stable security definer set search_path='' as $$
 select case when exists(select 1 from acceso.usuario where id=p_usuario and estado='activo') then
   array['publico','usuario:'||p_usuario::text]
   ||coalesce(array_agg(distinct 'rol:'||a.rol_codigo),'{}')
   ||case when bool_or(a.rol_codigo in ('REC','JOP','PAR')) then array['ambulancia'] else '{}'::text[] end
   else '{}'::text[] end
 from acceso.asignacion_rol a where a.usuario_id=p_usuario
$$;
-- La autorización de Broadcast se resuelve con la cuenta actual; no depende de un JWT con roles antiguos.
create function acceso.canales_actuales() returns text[] language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null then return '{}'::text[]; end if;
  return acceso.canales_de(auth.uid());
end $$;
revoke all on all functions in schema acceso from public,anon,authenticated;
grant usage on schema acceso to authenticated;
grant execute on function acceso.canales_actuales() to authenticated;
grant execute on function acceso.canales_de(uuid) to sghu_api,supabase_auth_admin;
grant execute on function acceso.hook_token(jsonb) to supabase_auth_admin;
drop policy if exists sghu_escuchar_canales on realtime.messages;
create policy sghu_escuchar_canales on realtime.messages for select to authenticated
  using(realtime.topic()=any(acceso.canales_actuales()));

-- Las vistas de negocio usan las políticas del invocante.
do $$ declare v record; begin
  for v in select schemaname,viewname from pg_views where schemaname in ('acceso','pacientes','personal','infra','hospitalizacion','atencion','laboratorio','ambulancia','publico','inventario') loop
    execute format('alter view %I.%I set (security_invoker=true)',v.schemaname,v.viewname);
  end loop;
end $$;
