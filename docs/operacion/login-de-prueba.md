# Login de prueba (temporal, solo desarrollo)

Ayuda **temporal** para probar el sistema en desarrollo: en la pantalla de ingreso aparece el aviso "Modo de prueba: cuentas ficticias" y un selector **Cuenta de prueba** con los roles ADM, DPD, JOP, REC, AST, ENF, MED, LAB, PAR y PAC. Al elegir un rol se llenan el correo y la contraseña de su cuenta ficticia; la persona todavía pulsa "Iniciar sesión". Con la bandera apagada no se muestra nada y la aplicación no lleva ninguna credencial.

Este archivo no contiene contraseñas ni correos reales, y nunca debe contenerlos.

## Estado actual (15-nov-2026)

| Plataforma | Dónde puede activarse | Qué impide que llegue a la entrega |
|---|---|---|
| Web | `npm run dev` local, o una variable de Render | Con `VITE_DEMO_LOGIN` distinto de `true`, `web/vite.config.ts` compila `VITE_DEMO_CREDENTIALS` como texto vacío: `dist/` no lleva credenciales aunque la variable exista. |
| Android | Solo builds **debug** | `android/app/build.gradle.kts` fija `DEMO_LOGIN=false` y `DEMO_CREDENTIALS=""` en `release`, y **falla el build** si se pide un release con `-PCLIMESA_DEMO_LOGIN=true` (B-02). |
| iOS | Solo configuración **Debug** | `ios/Config/Release.xcconfig` fuerza `CLIMESA_DEMO_LOGIN = NO` y credenciales vacías; `Core/DemoLogin.swift` lee el selector solo bajo `#if DEBUG`. El job `ipa` de CI comprueba que el `Info.plist` del IPA no lleve el selector y ya no usa el secreto `CLIMESA_DEMO_CREDENTIALS`. |

## Credenciales

- Viven en un solo archivo en la raíz del repositorio, `demo-credenciales.json`, que **no se sube** (está en `.gitignore`).
- Forma: `[{"rol":"ADM","correo":"...","contrasena":"..."}, ...]`. Copia `demo-credenciales.example.json` y cambia los valores.
- Las contraseñas nunca van en commits, en `render.yaml`, en secretos de CI ni en registros.

## Cómo se activa en desarrollo

| Plataforma | Bandera (apagada por defecto) | De dónde salen las credenciales |
|---|---|---|
| Web | `VITE_DEMO_LOGIN=true` en `web/.env.local` | `vite.config.ts` lee `../demo-credenciales.json` al ejecutar `npm run dev`. |
| Android | `-PCLIMESA_DEMO_LOGIN=true` (propiedad de Gradle) | `demo-credenciales.json` de la raíz, copiado a `BuildConfig` solo en debug. |
| iOS | `sh ios/scripts/demo-login.sh` (en la Mac) | Genera `ios/DemoLogin.xcconfig` (no se sube); solo Debug lo incluye. `--off` lo borra. |

```powershell
cd android
.\gradlew.bat -PCLIMESA_DEMO_LOGIN=true assembleDebug
```

`android/gradle.properties` deja `CLIMESA_DEMO_LOGIN=false`.

## Antes de la entrega (acciones del responsable)

1. Render `sghu-web` → Environment: `VITE_DEMO_LOGIN=false` (o borrada) y `VITE_DEMO_CREDENTIALS` borrada; vuelve a desplegar.
2. GitHub → Settings → Secrets: borra `CLIMESA_DEMO_CREDENTIALS` si todavía existe.
3. En la máquina que compila el APK: `~/.gradle/gradle.properties` sin `CLIMESA_DEMO_LOGIN`. El APK de entrega es el release firmado.
4. En la Mac: `sh ios/scripts/demo-login.sh --off`.
5. Supabase → Authentication → Users: cambia las contraseñas de todas las cuentas que estuvieron en el selector (estuvieron dentro de builds de prueba) y **desactiva la cuenta ADM de prueba** desde la web (Personal → Desactivar) o bórrala en Supabase.
