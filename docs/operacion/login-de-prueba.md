# Login de prueba (temporal)

Ayuda **temporal** para probar el sistema: en la pantalla de ingreso de web, Android e iOS aparece el aviso
"Modo de prueba: cuentas ficticias" y un selector **Cuenta de prueba** con los roles ADM, DPD, JOP, REC, AST, ENF,
MED, LAB, PAR y PAC. Al elegir un rol se llenan el correo y la contraseña de su cuenta ficticia; el usuario todavía
pulsa "Iniciar sesión". El dueño del proyecto lo pidió aceptando el riesgo: quien abra la pantalla puede entrar con
esas cuentas. Con la bandera apagada no se muestra nada y la app no lleva ninguna credencial.

## Credenciales

- Viven en un solo archivo en la raíz del repositorio, `demo-credenciales.json`, que **no se sube** (está en `.gitignore`).
- Forma: `[{"rol":"ADM","correo":"...","contrasena":"..."}, ...]`. Copia `demo-credenciales.example.json` y cambia los valores.
- Las contraseñas nunca van en commits, en `render.yaml` ni en registros.

## Cómo se activa

| Plataforma | Bandera (apagada por defecto) | De dónde salen las credenciales |
|---|---|---|
| Web | `VITE_DEMO_LOGIN=true` | `VITE_DEMO_CREDENTIALS` (el JSON como texto). En local, si falta, `vite.config.ts` lee `../demo-credenciales.json`. |
| Android | `CLIMESA_DEMO_LOGIN=true` (propiedad de Gradle) | `demo-credenciales.json` de la raíz, copiado a `BuildConfig` al compilar (debug y release). |
| iOS | `CLIMESA_DEMO_LOGIN = YES` (xcconfig) | `ios/DemoLogin.xcconfig` (no se sube), generado desde `demo-credenciales.json`. |

### Web

- Local: en `web/.env.local` pon `VITE_DEMO_LOGIN=true` y ejecuta `npm run dev` (lee `../demo-credenciales.json`).
- Render, sitio estático `sghu-web` (Environment): agrega estas dos variables y vuelve a desplegar:
  - `VITE_DEMO_LOGIN` = `true`
  - `VITE_DEMO_CREDENTIALS` = el contenido de `demo-credenciales.json` en una línea.
  `render.yaml` solo declara las claves con `sync: false`; los valores se escriben a mano en el panel.
- Con `VITE_DEMO_LOGIN` distinto de `true`, `vite.config.ts` define `VITE_DEMO_CREDENTIALS` como texto vacío: el
  paquete de `dist/` no contiene ninguna credencial aunque la variable exista.

### Android

```powershell
cd android
.\gradlew.bat -PCLIMESA_DEMO_LOGIN=true assembleRelease   # o assembleDebug
```

`android/gradle.properties` deja `CLIMESA_DEMO_LOGIN=false`. Con la bandera en `false` o sin el archivo, `BuildConfig.DEMO_LOGIN`
es `false`, `BuildConfig.DEMO_CREDENTIALS` queda vacío y no aparece el selector.

### iOS (en la Mac)

```sh
sh ios/scripts/demo-login.sh        # genera ios/DemoLogin.xcconfig; luego compila en Xcode
sh ios/scripts/demo-login.sh --off  # lo borra y apaga el selector
```

`Config/Debug.xcconfig` y `Config/Release.xcconfig` dejan `CLIMESA_DEMO_LOGIN = NO` e incluyen `../DemoLogin.xcconfig` solo si existe,
así que la integración continua compila sin el archivo. El JSON va en hexadecimal porque en xcconfig `//` inicia un comentario.

## Antes de la entrega

VITE_DEMO_LOGIN=false, CLIMESA_DEMO_LOGIN=false, cambiar contraseñas de las cuentas de prueba.

1. Render `sghu-web`: `VITE_DEMO_LOGIN=false` (y borra `VITE_DEMO_CREDENTIALS`), luego vuelve a desplegar.
2. Android: compila sin `-PCLIMESA_DEMO_LOGIN=true` (queda `false`).
3. iOS: `sh ios/scripts/demo-login.sh --off` y vuelve a compilar.
4. Cambia en Supabase las contraseñas de las cuentas de prueba: las anteriores estuvieron dentro de las apps de prueba.
