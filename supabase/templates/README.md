# Plantillas de correo de Supabase Auth (BL-07)

Seis plantillas HTML en español con la marca CLIMESA. Cinco tienen un botón y, debajo, el mismo enlace en texto para copiarlo (Gmail desactiva los botones de los correos que caen en spam); la de reverificación muestra un código para escribir. Usan tablas y estilos en línea para que se vean igual en Gmail, Outlook y el correo del teléfono.

## Dónde pegar cada una

Supabase → **Authentication → Emails → Templates**. En cada pestaña pega el **asunto** y el **contenido completo** del archivo (de `<!DOCTYPE html>` a `</html>`), y guarda.

| Pestaña de Supabase | Archivo | Asunto |
|---|---|---|
| Confirm signup | `confirmacion.html` | Confirma tu correo en CLIMESA |
| Invite user | `invitacion.html` | Tu invitación a CLIMESA |
| Reset Password | `recuperacion.html` | Restablece tu contraseña de CLIMESA |
| Magic Link | `enlace-magico.html` | Tu enlace de acceso a CLIMESA |
| Change Email Address | `cambio-correo.html` | Confirma tu nuevo correo en CLIMESA |
| Reauthentication | `reverificacion.html` | Tu código de verificación de CLIMESA |

Las genera `python tools/email/gen_auth_emails.py` desde un solo diseño (`--check` comprueba que estén al día); no se editan a mano. Usan `{{ .ConfirmationURL }}` y, en la reverificación, `{{ .Token }}`. Nunca muestran el correo de la cuenta en el cuerpo. `{{ .ConfirmationURL }}` ya incluye la página de destino que pide cada aplicación (`redirect_to`), así que no hace falta editar los enlaces.

## Configuración que deben acompañar (una sola vez)

1. **Authentication → URL Configuration**
   - **Site URL:** `https://sghu-web.onrender.com`. Si queda en `localhost`, el enlace abre una página inexistente.
   - **Redirect URLs:**
     - `https://sghu-web.onrender.com/confirmar-correo` (registro de paciente desde Android o iOS)
     - `https://sghu-web.onrender.com/aceptar-invitacion` (invitación de personal)
     - `https://sghu-web.onrender.com/restablecer` (recuperar contraseña)
2. **Authentication → Emails → SMTP Settings:** SMTP propio de un proveedor transaccional (decisión D-15) con dominio verificado.
   - Registros DNS **SPF** y **DKIM** del proveedor en el dominio; **DMARC** recomendado (`v=DMARC1; p=none` para empezar).
   - **Sender name:** `CLIMESA`. **Sender email:** una dirección del dominio verificado, por ejemplo `no-responder@<tu-dominio>`.
   - Sin SMTP propio, Supabase envía con su remitente de prueba: pocos correos por hora, en spam y solo a direcciones del equipo.
3. **Render → `sghu-api`:** `WEB_APP_URL=https://sghu-web.onrender.com` (la invitación usa esa URL).

## Comprobar

1. Regístrate como paciente en la app iOS o Android con un correo de prueba.
2. El correo llega a la bandeja de entrada (no a spam), en español y con el botón «Confirmar mi correo».
3. El botón abre `https://sghu-web.onrender.com/confirmar-correo` y la página termina con «Abre la app CLIMESA».
4. Repite con una invitación de personal desde la web (Usuarios) y con «¿Olvidaste tu contraseña?».

## Desarrollo local

`supabase/config.toml` apunta a estos archivos (`[auth.email.template.*]`), así que `supabase start` envía las mismas plantillas al buzón local (Inbucket, `http://localhost:54324`).
