-- Invitaciones por rol y jerarquía de administración.
-- El API Node.js es el único escritor de esta tabla; no se expone a clientes públicos.

create table acceso.administrador_principal (
  id boolean primary key default true check (id),
  usuario_id uuid not null unique references acceso.usuario(id),
  asignado_en timestamptz not null default now()
);

create table acceso.invitacion (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references acceso.usuario(id),
  correo text not null,
  nombre_mostrar text not null,
  rol_codigo text not null references acceso.rol(codigo),
  invitado_por uuid not null references acceso.usuario(id),
  estado text not null default 'enviada' check (estado in ('enviada', 'aceptada', 'rechazada', 'expirada')),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create index invitacion_usuario_idx on acceso.invitacion(usuario_id, creado_en desc);
create index invitacion_actor_idx on acceso.invitacion(invitado_por, creado_en desc);

-- Si ya existe un único administrador al aplicar la migración, queda como principal.
-- Si la cuenta se crea después, el API realiza el bootstrap solo cuando es el único ADM.
insert into acceso.administrador_principal (usuario_id)
select a.usuario_id
from acceso.asignacion_rol a
join acceso.usuario u on u.id = a.usuario_id and u.estado = 'activo'
where a.rol_codigo = 'ADM'
order by a.asignado_en asc
limit 1
on conflict (id) do nothing;

grant select on acceso.administrador_principal, acceso.invitacion to sghu_api;
grant insert, update on acceso.invitacion to sghu_api;
