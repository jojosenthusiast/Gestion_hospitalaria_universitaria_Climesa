# Correos de cuenta: confirmación, invitación y recuperación

Los tres correos de Supabase Auth llevan a páginas de la web, venga la cuenta de la web, de Android o de iOS:

| Correo | Página de destino | Qué hace |
|---|---|---|
| Confirmación de registro de paciente | `https://sghu-web.onrender.com/confirmar-correo` | Confirma el correo y dice en qué aplicaciones puede ingresar la cuenta. Un paciente (Android/iOS) queda sin sesión en la web. |
| Invitación de personal | `https://sghu-web.onrender.com/aceptar-invitacion` | Crea la contraseña y muestra dónde ingresa cada rol (unión si tiene varios). Si ningún rol usa la web, cierra la sesión web. |
| Recuperar contraseña | `https://sghu-web.onrender.com/restablecer` | Guarda la nueva contraseña, cierra la sesión y muestra dónde ingresar. |

Las plataformas de cada rol salen de `acceso.rol.plataformas` a través de `GET /api/v1/auth/me` (`platforms` y `rolePlatforms`). La web no repite esa lista.

Un enlace vencido o ya usado muestra un aviso en español y una salida: reenviar la confirmación, pedir al administrador que reenvíe la invitación, o pedir un enlace nuevo de recuperación.

## Lista del propietario (una sola vez)

1. **Supabase → Authentication → URL Configuration**
   - **Site URL:** `https://sghu-web.onrender.com` (si queda `http://localhost:3000`, el enlace de confirmación abre «No es posible acceder al sitio»).
   - **Redirect URLs:** agrega las tres:
     - `https://sghu-web.onrender.com/confirmar-correo`
     - `https://sghu-web.onrender.com/aceptar-invitacion`
     - `https://sghu-web.onrender.com/restablecer`
     - Para desarrollo local, opcional: `http://localhost:5173/**`
2. **Supabase → Authentication → Emails → SMTP Settings:** configura un SMTP propio. El servidor de correo incluido de Supabase solo envía unos pocos correos por hora y solo a direcciones del equipo del proyecto.
3. **Supabase → Authentication → Emails → Templates:** no hace falta cambiarlas. Las plantillas de fábrica usan `{{ .ConfirmationURL }}`, que ya respeta la página de destino.
4. **Render → servicio `sghu-api` → Environment:** `WEB_APP_URL=https://sghu-web.onrender.com`. Desde este cambio la API no arranca en producción (`NODE_ENV=production`) si falta, si no es HTTPS o si apunta a localhost; así un correo de invitación nunca lleva a localhost.
5. **Render → servicio `sghu-web`:** no hace falta tocar nada. El build copia `index.html` como `404.html`, y Render sirve ese archivo en cualquier ruta, así que los enlaces profundos cargan la aplicación aunque falte la regla de reescritura. Si se aplica `render.yaml` como Blueprint, su regla `/*` → `/index.html` hace lo mismo con estado 200.

## Aplicaciones móviles

Android e iOS deben pedir el correo con la URL de la web: `emailRedirectTo` = `https://sghu-web.onrender.com/confirmar-correo` al registrarse y `redirectTo` = `https://sghu-web.onrender.com/restablecer` al recuperar la contraseña.

Si la app usa el flujo PKCE, el enlace llega con `?code=` y la web no puede canjearlo (el verificador queda en el teléfono). En la confirmación no importa: Supabase ya confirmó el correo antes de redirigir, y la página lo dice. En la recuperación sí: la web pide un enlace nuevo desde `/recuperar`. Por eso la recuperación desde la app debe usar el flujo implícito o abrir la app con un enlace propio.

## Comprobar

1. Regístrate como paciente con un correo de prueba y abre el enlace: debe decir «Tu correo quedó confirmado» y «Ya puedes iniciar sesión en la app CLIMESA (Android/iOS)».
2. Abre otra vez el mismo enlace: debe decir «El enlace ya se usó o expiró» y ofrecer el reenvío.
3. Invita a una cuenta de Laboratorio desde Usuarios: el enlace abre «Hazla tuya», y después de crear la contraseña muestra «Portal web CLIMESA».
