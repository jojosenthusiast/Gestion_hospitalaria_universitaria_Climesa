# GES-15: dejar Supabase remoto listo para la API

Proyecto: "Gestion hospitalaria universitaria (Climesa)", ref `gvmvmrusscsfbndnbvbr`.

## Estado verificado el 28-oct-2026 (consulta de solo lectura)

| Elemento | Remoto | Falta |
|---|---|---|
| Migraciones base (13) + invitaciones (`acceso_invitacion`, `acceso_invitacion_politicas`) | aplicadas | nada |
| `20261024070241_core_semanas_1_2.sql` (`acceso.canales_actuales`, `acceso.proteger_desactivacion`) | **no aplicada** | aplicarla |
| Rol `sghu_api` | existe, `rolcanlogin = false` | contraseña y login |
| Gancho `acceso.hook_token` | función existe | activarlo en el panel |
| Administrador principal (`acceso.administrador_principal`) | 1 fila | nada |
| Fila de humo `humo-1` en `plataforma.outbox` | presente | borrarla |

## Por qué no usar `supabase db push`

Las migraciones remotas se aplicaron con otra marca de versión (p. ej. `20261017190033_plataforma` frente a `20261017000100_plataforma.sql` en el repo). `db push` vería todo como pendiente e intentaría recrear tablas existentes. Aplica solo lo que falta, a mano, como abajo.

## Pasos (en este orden)

1. **Aplicar `core_semanas_1_2`.** En el SQL Editor de Supabase, pega el contenido de `supabase/migrations/20261024070241_core_semanas_1_2.sql` y ejecútalo. Después, en Security Advisor, no debe aparecer ningún hallazgo nuevo.
2. **Contraseña del rol de la API** (nunca en el repositorio ni en el chat):
   `alter role sghu_api login password '<contraseña larga y aleatoria>';`
3. **Gancho de token.** Authentication → Hooks → *Customize Access Token (JWT) Claims* → tipo Postgres → función `acceso.hook_token`.
4. **Borrar la fila de humo:**
   `delete from plataforma.outbox where entidad_id = 'humo-1';`
5. **`DATABASE_URL` de la API** (Render → `sghu-api` → Environment), con el rol de la API y el *Session pooler*:
   `postgresql://sghu_api.gvmvmrusscsfbndnbvbr:<contraseña>@aws-0-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require`
   Confirma host y región en el botón **Connect** del panel.
6. **Redirecciones de Auth.** Authentication → URL Configuration: Site URL `https://sghu-web.onrender.com` y Redirect URL `https://sghu-web.onrender.com/**`.

## Criterio de hecho

- `GET /salud` devuelve 200 con `"database":"ok"`.
- Un inicio de sesión devuelve un token con roles y canales.
- Existe un usuario con rol `ADM`.

Al terminar, marca GES-15 como hecho en Jira y deja la evidencia en `specs/100-plataforma-api/tasks.md`.
