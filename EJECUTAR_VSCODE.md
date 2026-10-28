# Ejecutar CLIMESA desde VS Code

Abre `SGHU-CLIMESA.code-workspace`. Requiere Node.js 22; para Android, JDK 17 y SDK 35. iOS requiere una Mac con Xcode.

## Configuración inicial en PowerShell

Desde la raíz:

```powershell
Copy-Item api/.env.example api/.env
Copy-Item web/.env.example web/.env
npm ci --prefix api
npm ci --prefix web
```

Completa `api/.env`: `DATABASE_URL` con acceso al rol `sghu_api` del proyecto CLIMESA y `SUPABASE_SECRET_KEY` o `SUPABASE_SERVICE_ROLE_KEY` para invitaciones. Usa TLS con verificación del certificado en la nube. No distribuyas esas variables a web o apps. `WEB_APP_URL=http://localhost:5173` configura CORS y la redirección de invitaciones.

Para una base nueva aplica las migraciones y semilla mediante la CLI del proyecto correcto; consulta [deployment/README.md](deployment/README.md). La migración del 24 de octubre aún no se aplicó remotamente en esta revisión.

En Supabase Auth configura Site URL `http://localhost:5173` y la redirección `http://localhost:5173/aceptar-invitacion`. Un usuario REC/MED/etc. necesita la persona del directorio vinculada y sus roles asignados desde administración. Un registro público recibe únicamente PAC.

## Ejecución

Terminal → Run Task → **CLIMESA: Web + API**. También puedes usar dos terminales:

```powershell
npm run start:dev --prefix api
```

```powershell
npm run dev --prefix web
```

- Web: http://localhost:5173
- API: http://localhost:3000/api/v1
- OpenAPI/Swagger: http://localhost:3000/api/v1/docs
- Readiness de PostgreSQL: http://localhost:3000/salud
- Revisión visual sin cuenta: http://localhost:5173/work-preview.html

## Comprobar

```powershell
npm test --prefix api
npm run build --prefix api
npm run build --prefix web
```

El flujo del producto necesita una cuenta confirmada y el backend conectado; no hay fallback a roles locales. Las galerías de diseño contienen exclusivamente datos ficticios y no prueban la conexión remota. Android e iOS se preparan en [EMPEZAR_ANDROID.md](EMPEZAR_ANDROID.md) e [ios/README.md](ios/README.md).
