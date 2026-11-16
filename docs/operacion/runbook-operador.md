# Manual del operador de CLIMESA

Procedimientos de operación del entorno demo: API y web en Render, base, Auth y Realtime en Supabase. Lo ejecuta la persona dueña de los proyectos de Render y Supabase. Ningún agente ni flujo de CI se conecta a producción.

Este documento no contiene contraseñas, claves, tokens ni cadenas de conexión, y nunca debe contenerlos. Los secretos se escriben solo en el panel de Render, en el panel de Supabase o en una variable de la sesión de la terminal.

| Sección | Tema |
|---|---|
| 1 | Piezas y direcciones |
| 2 | Desplegar la API y la web en Render |
| 3 | Aplicar migraciones con comprobación previa |
| 4 | Cuentas demo: rotar contraseñas y apagar el inicio de sesión de prueba |
| 5 | Correo de Supabase Auth: plantillas, URL y SMTP |
| 6 | Respaldos |
| 7 | CI: falla intermitente de `postgres-native` |
| 8 | Datos demo |
| 9 | Diagnóstico rápido |

## 1. Piezas y direcciones

| Pieza | Dirección | Configuración |
|---|---|---|
| API `sghu-api` | https://sghu-api.onrender.com/api/v1 | Render, Docker (`api/Dockerfile`), plan free, región virginia, `healthCheckPath: /salud`, `autoDeploy: false` |
| Web `sghu-web` | https://sghu-web.onrender.com | Render, sitio estático, `rootDir: web`, `npm ci && npm run build`, publica `dist`, `autoDeploy: false` |
| Base, Auth y Realtime | Proyecto Supabase de CLIMESA | Migraciones a mano (sección 3); la API se conecta por el *Session pooler* con el rol `sghu_api` |

Documentos relacionados: [despliegue-render.md](../desarrollo/despliegue-render.md), [ges-15-supabase-remoto.md](../desarrollo/ges-15-supabase-remoto.md), [correo-auth.md](correo-auth.md), [login-de-prueba.md](login-de-prueba.md), [respaldo-y-restauracion.md](respaldo-y-restauracion.md) y [usuario-conexion-bd.md](usuario-conexion-bd.md).

## 2. Desplegar la API y la web en Render

Render no despliega solo: después de cada fusión en `main` hay que desplegar a mano. Si la fusión trae migraciones, aplícalas **antes** de desplegar la API (sección 3), salvo que el PR diga otro orden.

### Variables de entorno (solo nombres)

| Servicio | Fijas en `render.yaml` | Escritas a mano en el panel (`sync: false`) |
|---|---|---|
| `sghu-api` | `NODE_ENV`, `API_PREFIX`, `WEB_APP_URL`, `TRUST_PROXY_HOPS`, `RATE_LIMIT_MAX` | `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `DATABASE_URL`; opcional `DB_SSL_CA` |
| `sghu-web` | `VITE_API_BASE_URL` | `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`; solo en desarrollo `VITE_DEMO_LOGIN` y `VITE_DEMO_CREDENTIALS` |

`WEB_APP_URL` debe valer `https://sghu-web.onrender.com`. En producción la API **no arranca** si falta, si no es HTTPS o si apunta a localhost.

### Pasos

1. Render → `sghu-api` → **Manual Deploy** → *Deploy latest commit*.
2. Espera a que el health check pase. Comprueba:
   ```bash
   curl -s https://sghu-api.onrender.com/salud
   ```
   Debe responder 200 con `"database":"ok"`. Un 503 indica que la API no llega a la base: revisa `DATABASE_URL` y el estado de Supabase.
3. Comprueba que la versión nueva está viva con un endpoint de la fusión. Ejemplo: `GET https://sghu-api.onrender.com/api/v1/publico/ocupacion` debe responder 200.
4. Render → `sghu-web` → **Manual Deploy**. Abre la web con `Ctrl + F5`.
5. Comprueba la reescritura y las cabeceras:
   ```bash
   curl -sI https://sghu-web.onrender.com/publico
   ```
   Con el Blueprint aplicado responde 200 con `content-security-policy` y `strict-transport-security`. Si responde 404, la regla `/*` → `/index.html` no está en el servicio: créala en **Redirects/Rewrites** (acción *Rewrite*) y las cabeceras en **Headers**, copiándolas de `render.yaml`. Mientras tanto la página carga igual porque el build copia `index.html` como `404.html`.

### Arranque en frío

El plan gratuito duerme la API tras 15 minutos sin tráfico; la primera llamada tarda cerca de un minuto. Los tres clientes reintentan con espera creciente (2, 5 y 10 s) y a los 5 s muestran "El servidor se está activando". Antes de una demostración, abre `/salud` unos minutos antes. Para evitarlo del todo hay dos opciones: un monitor externo que pida `/salud` cada 5 minutos o el plan `starter` de Render ([despliegue-render.md](../desarrollo/despliegue-render.md)).

## 3. Aplicar migraciones con comprobación previa

Las migraciones de la nube se aplican **a mano** en Supabase → **SQL Editor**, una por una y en orden de fecha. **No uses `supabase db push`**: las versiones registradas en el remoto no coinciden con los nombres de archivo del repositorio, y `db push` intentaría recrear tablas existentes ([ges-15-supabase-remoto.md](../desarrollo/ges-15-supabase-remoto.md)). Un despliegue de Render no migra.

Una migración ya aplicada no se edita nunca. Un cambio de base es siempre un archivo nuevo con fecha posterior.

### Procedimiento por archivo

1. Haz un respaldo (sección 6).
2. Abre el archivo en `supabase/migrations/` y lee su cabecera. Casi todos traen:
   - una **comprobación previa** (consulta de solo lectura) que confirma que la base está en el estado que la migración espera, o que muestra los datos que la harían fallar;
   - una **reversa**, para deshacerla a mano si algo sale mal.
3. Ejecuta solo la comprobación previa en el SQL Editor y compara con lo que dice la cabecera. Si el resultado no es el esperado, **detente**: no apliques la migración y revisa con el autor del PR.
4. Pega el archivo completo y ejecútalo. Si falla, la transacción se revierte; no reintentes con cambios a mano.
5. Vuelve a correr la comprobación previa o la consulta de verificación de la cabecera.
6. En **Advisors → Security Advisor** no debe aparecer ningún hallazgo nuevo.

### Migraciones de las fases 0 y 1

| # | Archivo | Qué hace |
|---|---|---|
| 1 | `20261119002000_ambulancia_motorista_de_turno.sql` | El despacho exige paramédico y motorista de turno (RN-30) |
| 2 | `20261119003000_consulta_ticket_unico.sql` | Una consulta vigente por número de fila. Aborta si ya hay duplicados; el bloqueo del índice espera como máximo 5 s |
| 3 | `20261119004000_tiempo_real_canales_ampliados.sql` | Los canales del outbox se derivan del catálogo de permisos |
| 4 | `20261119004100_tiempo_real_eventos_faltantes.sql` | Eventos en vivo de inventario y de bloqueo de camas por aislamiento |
| 5 | `20261120001000_admision_cierre_ciclo.sql` | Cancelar y anular admisiones, solicitar y revocar alta, reasignar tratante |
| 6 | `20261120001100_ambulancia_cierre_administrativo.sql` | Cierre administrativo de JOP; el paramédico debe tener cuenta activa |
| 7 | `20261120001200_permisos_fase01_hospitalizacion.sql` | Generada: JOP recibe `camas.registrar_limpieza` |
| 8 | `20261120002000_citas_fila_fase01.sql` | Estados de citas y fila, reprogramaciones y límites (`plataforma.politica`) |
| 9 | `20261120003000_turnos_asistencia_carga.sql` | Estado `ausente`, transiciones, descanso y límites de carga |
| 10 | `20261120004000_cuentas_invitaciones.sql` | `invitable`, invitación `cancelada`, `aceptada_en`, `reenviada_en` |
| 11 | `20261121001000_laboratorio_enmienda_revision.sql` | Enmienda, `laboratorio.puede_revisar` y versión de exámenes |
| 12 | `20261121002000_ambulancia_fase1.sql` | Estados finales, `recibido_por` y `recibido_en`, motivo de cancelación de solicitudes, `servicio_cierre` |
| 13 | `20261121003000_aviso_editar_retirar.sql` | Versión y retiro de avisos |
| 14 | `20261121003100_recursos_inventario_adm.sql` | Generada: ADM recibe `inventario.ver`; se retiran `recursos.*` |
| 15 | `20261121003200_retiro_vista_avisos_vigentes.sql` | Elimina `publico.v_avisos_vigentes`, que exponía avisos internos y retirados |

Para saber cuáles ya están aplicadas, corre la comprobación previa de cada una: una migración aplicada deja la base en el estado que su verificación espera. Las migraciones "generadas" salen de `tools/generar_docs.py` desde `permisos.csv`; `python tools/generar_docs.py --verificar` confirma que el repositorio está al día.

Después de aplicar las migraciones, despliega la API (sección 2) si el PR lo pide.

## 4. Cuentas demo: rotar contraseñas y apagar el inicio de sesión de prueba

Hay una cuenta demo por rol. Sus credenciales viven solo en `demo-credenciales.json` en la raíz (ignorado por git; formato en `demo-credenciales.example.json`) y se entregan por un canal privado del equipo. No hay un script que rote contraseñas: se hace a mano.

### Antes de la entrega o después de compartir credenciales

1. Respaldo (sección 6).
2. Supabase → **Authentication → Users**: para cada cuenta demo, cambia la contraseña por una nueva, larga y aleatoria. No la escribas en el repositorio, en issues, en el chat ni en registros.
3. Actualiza tu copia local de `demo-credenciales.json` y entrégala por el canal privado.
4. Desactiva la cuenta ADM de prueba desde la web (**Personal → Desactivar**) o bórrala en Supabase. Nadie puede desactivarse a sí mismo y siempre debe quedar un administrador activo.
5. Apaga el inicio de sesión de prueba ([login-de-prueba.md](login-de-prueba.md), "Antes de la entrega"):
   - Render `sghu-web`: `VITE_DEMO_LOGIN` en `false` o borrada y `VITE_DEMO_CREDENTIALS` borrada; vuelve a desplegar.
   - GitHub → Settings → Secrets: borra `CLIMESA_DEMO_CREDENTIALS` si existe.
   - Máquina que compila el APK: sin `CLIMESA_DEMO_LOGIN` en `~/.gradle/gradle.properties`. El APK Release nunca lleva el selector.
   - Mac: `sh ios/scripts/demo-login.sh --off`.
6. Comprueba que la pantalla de ingreso de la web ya no muestra "Modo de prueba: cuentas ficticias".

### Invitar personal nuevo

Lo hace ADM en la web, en **Personal** (ver [manual del Administrador](../manual/administrador.md)). Los pacientes no se invitan: crean su cuenta en la app.

## 5. Correo de Supabase Auth: plantillas, URL y SMTP

Detalle completo en [correo-auth.md](correo-auth.md). Resumen de la configuración, que se hace una vez:

1. **Authentication → URL Configuration.** Site URL `https://sghu-web.onrender.com`. Redirect URLs: `https://sghu-web.onrender.com/confirmar-correo`, `https://sghu-web.onrender.com/aceptar-invitacion` y `https://sghu-web.onrender.com/restablecer`.
2. **Authentication → Emails → SMTP Settings.** SMTP propio con dominio verificado (SPF y DKIM; DMARC recomendado) y remitente "CLIMESA" (D-15). El servidor incluido de Supabase envía pocos correos por hora y suele terminar en spam.
3. **Authentication → Emails → Templates.** Pega las cinco plantillas en español de `supabase/templates/` (confirmación, invitación, recuperación, enlace mágico y cambio de correo) con los asuntos de `supabase/templates/README.md`.
4. **Render `sghu-api`.** `WEB_APP_URL=https://sghu-web.onrender.com`.
5. **Authentication → Hooks.** *Customize Access Token (JWT) Claims* con la función `acceso.hook_token`.

Comprobación: registra un paciente de prueba con un correo propio y abre el enlace; debe decir "Tu correo quedó confirmado". Abre el mismo enlace otra vez; debe decir que el enlace ya se usó o expiró y ofrecer el reenvío.

## 6. Respaldos

Procedimiento completo en [respaldo-y-restauracion.md](respaldo-y-restauracion.md). El plan gratuito de Supabase no tiene restauración a un punto en el tiempo: este respaldo manual es la única copia.

- **Cuándo:** antes de cada migración, antes de cada demostración o defensa, antes de rotar o borrar cuentas demo, antes de limpiar datos demo y al menos una vez por semana.
- **Cómo:** tres archivos con `npx supabase db dump` (roles, esquema y datos con `--use-copy --data-only`) y su `SHA256SUMS`, guardados **fuera** del repositorio. La contraseña se escribe solo en la sesión (`read -rs PGPASSWORD`).
- **Restauración:** siempre primero en un destino de prueba, con `psql --single-transaction` y `session_replication_role = replica`; luego contraseña de `sghu_api`, gancho `hook_token` y URL de Auth.
- **Registro:** anota cada prueba de restauración en la tabla de `respaldo-y-restauracion.md`. Un respaldo que nunca se restauró no cuenta como respaldo.

## 7. CI: falla intermitente de `postgres-native`

Cada componente tiene su workflow en `.github/workflows/` (`api`, `web`, `android`, `ios`, `supabase`, `docs`) y solo corre cuando cambian sus rutas.

El job `postgres-native` (`supabase.yml`) levanta PostgreSQL con `docker compose -f compose.test.yaml up --wait db` y después corre `supabase/pruebas/01_invariantes.sql` y `02_concurrencia.sh`. Falla de forma intermitente con este error:

```text
01_invariantes.sql:49: ERROR: FALLO: se esperaba vip_no_se_traslada y llegó ... "traslado_ocupacion_origen_id_fkey" (23503)
```

Antes del error el registro muestra `INSERT 0 0`: las filas de la semilla (por ejemplo VIP-302-A y HAB-203-B) todavía no existían. La causa probable es una carrera: la comprobación de salud (`pg_isready`) responde con el servidor temporal de inicialización, y `--wait` termina antes de que `deployment/init-test-db.sh` aplique todas las migraciones y `seed.sql`. No es un error del cambio que se está probando.

Qué hacer:

1. Confirma que el error es exactamente ese y que el registro muestra `INSERT 0 0` antes.
2. Vuelve a ejecutar solo los jobs fallidos:
   ```bash
   gh run rerun <run-id> --failed
   ```
   El `<run-id>` sale de `gh pr checks <número>` o de la pestaña Actions.
3. Si falla dos veces seguidas con el mismo error, vuelve a intentarlo una vez más; si cambia el error, trátalo como un fallo real.

Arreglo de fondo pendiente (cambio de código, fuera de este manual): que la comprobación de salud de `compose.test.yaml` espere a que termine la semilla, por ejemplo consultando una tabla sembrada en lugar de `pg_isready`.

## 8. Datos demo

- La semilla demo (`tools/demo/semilla-demo.sql`) es idempotente y solo crea datos ficticios. Ocupa las camas reales de P2 (HAB-201 a HAB-206) y P3 (VIP-301 a VIP-305); ya no crea la planta 4 (BL-01).
- `tools/demo/limpiar-demo.sql` borra los datos demo, incluida la planta 4 de una semilla anterior.
- Las dos se ejecutan sobre producción solo con respaldo previo y aprobación explícita de la dueña del proyecto (D-01). Instrucciones en `tools/demo/README.md`.

## 9. Diagnóstico rápido

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| La web muestra "El servidor se está activando" | Arranque en frío del plan gratuito | Esperar hasta un minuto |
| `/salud` responde 503 | La API no llega a la base | Revisar `DATABASE_URL` en Render y el estado de Supabase |
| La API no arranca tras un despliegue | Falta `WEB_APP_URL` o no es HTTPS | Definirla (sección 2) y volver a desplegar |
| Un endpoint nuevo responde 404 | Render sirve una versión anterior | Manual Deploy de `sghu-api` |
| Un endpoint nuevo responde 500 con error de columna o tabla | Falta aplicar una migración | Sección 3 |
| Los enlaces de correo abren "No es posible acceder al sitio" | Site URL en `localhost` | Sección 5, paso 1 |
| El correo llega a spam o en inglés | SMTP y plantillas por defecto | Sección 5, pasos 2 y 3 |
| Un rol no ve un módulo esperado | Permiso o plataforma del rol | Revisar `permisos.csv` y `roles.csv`; el menú depende del permiso |
| El despacho de ambulancia se rechaza | Falta turno de paramédico con cuenta o de motorista | JOP planifica el turno en **Turnos** |
