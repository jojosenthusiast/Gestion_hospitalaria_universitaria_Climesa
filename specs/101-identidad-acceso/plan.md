# 101. Plan

## Backend
Módulo `Acceso`: comandos `InvitarPersonal`, `AsignarRoles`, `DesactivarUsuario`, `SolicitarVinculacion`, `AprobarVinculacion`, `RechazarVinculacion`; consulta `Perfil`. La invitación usa la API administrativa de Supabase (`/auth/v1/admin/invite`) con la llave de servicio, que solo vive en la API.

## Base de datos
`0002_acceso.sql`: `acceso.usuario`, `rol`, `permiso`, `rol_permiso`, `asignacion_rol` (CHECK asignado_por distinto de usuario_id), `vinculacion_paciente`. Disparador sobre `auth.users` al crear: inserta `acceso.usuario` con rol PAC si viene de registro público. Función `acceso.custom_access_token_hook(event)` que agrega `app_canales` al token. Semilla desde `roles.csv` y `permisos.csv` generada por `tools/` (sin escribir a mano).

## Eventos de tiempo real
`vinculacion.solicitada`, `vinculacion.resuelta`, `usuario.roles_cambiados` (invalida caché de permisos en la API y obliga al cliente a pedir `/me`).

## Clientes
Pantallas de ingreso, registro y vinculación; guardia de navegación por rol y plataforma; renovación de token automática del SDK de Supabase.

## Pruebas
Autoasignación prohibida, último administrador, vinculación con DUI de otro paciente (rechazo), cambio de rol aplicado sin reiniciar sesión.

## Riesgos
El gancho de token requiere activarse en el panel de Supabase: queda documentado en el README.
