> Documento importado de la transferencia v11 (previa al corte 0.3.0). Es contexto histórico: el estado vigente está en specs/ESTADO.md, README.md y docs/gestion/. La carpeta ackend/ de la v11 es hoy pi/; las rutas de este texto se actualizaron. Se retiró el correo personal y no contiene claves.

# SGHU-CLIMESA · Guía de continuidad del desarrollo

Documento de transferencia para continuar el proyecto sin perder decisiones ni romper el flujo de autenticación.

## 1. Identidad del proyecto

- Nombre: SGHU-CLIMESA / Hospital Universitario.
- Backend: Node.js + NestJS + Fastify + TypeScript.
- Web: React + Vite + TypeScript.
- Android: Kotlin + Jetpack Compose.
- Base de datos y autenticación: Supabase.
- Proyecto Supabase: `Gestion hospitalaria universitaria (Climesa)`.
- Supabase URL: `https://gvmvmrusscsfbndnbvbr.supabase.co`.
- Cuenta administrativa principal: el administrador principal.
- Figma oficial: archivo `Hospital Universitario — Sistema de Gestión`.

## 2. Estado implementado

### Supabase y autenticación

- Autenticación por correo y contraseña activa.
- Confirmación de correo y SMTP configurados.
- Usuario inicial activo y confirmado con rol `ADM`.
- Roles y permisos base creados en el esquema `acceso`.
- La migración de jerarquía de invitaciones ya existe en el proyecto remoto.
- La fila `acceso.administrador_principal` ya identifica a el administrador principal.
- Las tablas `acceso.administrador_principal` y `acceso.invitacion` ya están creadas.

### Invitaciones

- Node.js valida el JWT de Supabase.
- Existe `POST /api/v1/usuarios/invitaciones`.
- Se puede enviar invitación por SMTP mediante Supabase.
- Se asigna un rol de catálogo, no un texto libre.
- El administrador principal puede invitar cualquier rol, incluido `ADM`.
- Un administrador secundario puede invitar roles no administrativos.
- Un administrador secundario no puede crear otro `ADM`.
- Cada invitación se registra en `acceso.invitacion`.
- La clave secreta de Supabase permanece únicamente en el backend.

### Web

- Login real con Supabase.
- Validación del perfil mediante `/api/v1/auth/me`.
- Activación de cuenta desde `/aceptar-invitacion`.
- Selector de roles en el formulario de invitación.
- La opción `ADM` solo se muestra al administrador principal.
- La interfaz actual es funcional, pero todavía debe adaptarse visualmente al diseño final de Figma.

### Android

- Login real contra Supabase.
- Sesión persistente protegida con Android Keystore.
- Cierre de sesión y renovación de sesión.
- Enrutamiento por rol.
- Portal inicial del paciente.
- Módulo local de demostración de recepción.
- Bloqueo de módulos cuando el API no puede verificar el rol.

### Verificaciones realizadas

- Backend: 4 suites y 5 pruebas unitarias aprobadas.
- Backend: compilación TypeScript aprobada.
- Web: compilación Vite aprobada.
- APK nueva: todavía no generada en este entorno porque Gradle necesita descargar componentes.

## 3. Lo que falta desarrollar, en orden

### Fase 1 · Diseño visual oficial

1. Revisar el sistema de diseño de Figma.
2. Crear tokens CSS para colores, tipografía, bordes, sombras y espaciado.
3. Implementar layout común: sidebar, topbar, breadcrumbs, búsqueda y modo oscuro.
4. Sustituir la interfaz provisional de login y administración.
5. Validar la pantalla a 1440 px y en tamaños responsive.

El diseño de Figma ya está accesible mediante la cuenta `la cuenta de diseño del equipo`. Las páginas identificadas son:

- `01 · Sistema y administración`.
- `02 · Médico y personal`.
- `03 · Paciente y recepción`.

La primera pantalla recomendada es `01 · Administración · Panel general · Claro`.

### Fase 2 · Administración real

1. Panel general con métricas reales.
2. Gestión de usuarios.
3. Historial de invitaciones.
4. Reenvío y expiración de invitaciones.
5. Activar, desactivar y consultar cuentas.
6. Gestión de roles respetando la jerarquía del administrador principal.
7. Auditoría de acciones.

### Fase 3 · Primer módulo clínico funcional

1. Pacientes: búsqueda y registro.
2. Expediente mínimo y vinculación de cuenta del paciente.
3. Habitaciones y camas.
4. Recepción y admisión.
5. API con permisos y RLS verificados.

### Fase 4 · Android

1. Vinculación segura de la cuenta con expediente.
2. Citas.
3. Fila de atención.
4. Resultados de laboratorio revisados.
5. Ambulancia para pacientes y paramédicos.
6. Realtime y modo sin conexión donde lo exija el flujo.

### Fase 5 · Producción

1. Publicar web con dominio/URL pública.
2. Publicar backend Node.js con HTTPS.
3. Configurar variables de entorno en el servidor.
4. Cambiar las URL de redirección de Supabase a las URL públicas.
5. Compilar Android apuntando al API público.
6. Configurar copias de seguridad, monitoreo y logs.

## 4. Instalación local en Windows

### Backend

```powershell
cd api
Copy-Item .env.example .env
npm install
```

Editar `api/.env` y colocar una sola clave privada del backend:

```env
SUPABASE_SECRET_KEY=sb_secret_...
```

Nunca subir `.env` a Git ni copiar la clave en web o Android.

Ejecutar:

```powershell
npm test -- --runInBand
npm run build
npm run start:dev
```

### Web

En otra terminal:

```powershell
cd web
Copy-Item .env.example .env
npm install
npm run dev
```

Abrir `http://localhost:5173`.

### Android

Requiere JDK 17, Android SDK 35, Platform Tools y un emulador o teléfono:

```powershell
cd android
adb devices
.\gradlew.bat testDebugUnitTest
.\gradlew.bat assembleDebug
.\gradlew.bat installDebug
```

## 5. Prueba funcional mínima

1. Encender el backend.
2. Encender la web.
3. Iniciar sesión con el administrador principal.
4. Invitar un correo de prueba con rol `PAC`.
5. Abrir el enlace recibido por SMTP.
6. Crear la contraseña.
7. Iniciar sesión como paciente.
8. Repetir con un correo de prueba para un rol operativo.
9. Probar que un administrador secundario no pueda invitar `ADM`.
10. Revisar la invitación creada en `acceso.invitacion`.

## 6. Reglas que no deben romperse

- No usar `user_metadata` para autorización.
- No colocar `SUPABASE_SECRET_KEY` ni `service_role` en frontend o Android.
- No permitir que el frontend decida por sí solo quién es administrador principal.
- No eliminar al último administrador activo.
- No enviar invitaciones con roles que no existan en `acceso.rol`.
- No inventar datos clínicos para reemplazar respuestas reales del API.
- Toda tabla nueva debe tener RLS y permisos explícitos.
- Toda operación sensible debe pasar por Node.js y quedar auditada.
- No volver a ejecutar la migración `20261024000100_invitaciones_jerarquia.sql`; sus tablas ya existen remotamente.

## 7. Archivos importantes

- `api/src/users/invitations.service.ts`: reglas de invitaciones.
- `api/src/users/invitation.dto.ts`: catálogo y validación de roles.
- `api/src/auth/auth.controller.ts`: perfil y capacidad de invitar administradores.
- `web/src/App.tsx`: login, activación y portal web inicial.
- `web/src/lib/api.ts`: cliente del API.
- `android/app/src/main/java/sv/edu/catolica/climesa/ui/ClimesaApp.kt`: navegación Android por rol.
- `supabase/migrations/20261024000100_invitaciones_jerarquia.sql`: estructura de jerarquía e invitaciones.
- `docs/desarrollo/invitaciones-jerarquia.md`: reglas de seguridad del módulo.

## 8. Transferencia de accesos recomendada

No se recomienda entregar la propiedad de la organización o del proyecto al nuevo integrante.

La opción recomendada es invitarlo con acceso individual y mínimo privilegio:

- **Developer** con alcance únicamente al proyecto CLIMESA si necesita modificar código, SQL, tablas, Auth y Storage.
- **Read-Only** si solo revisará estructura, datos y configuración.
- **Administrator** únicamente si debe administrar miembros, facturación o configuración crítica del proyecto.
- **Owner** no es necesario para el desarrollo diario y no debe utilizarse como acceso normal.

Nunca compartir la contraseña del propietario, tokens personales ni claves `sb_secret` o `service_role`. Cada integrante debe usar su propia cuenta y el acceso debe revocarse cuando deje el proyecto.

## 9. Primera tarea del nuevo integrante

1. Descargar esta entrega y abrir `SGHU-CLIMESA.code-workspace`.
2. Leer este documento completo.
3. Configurar `.env` sin subir secretos.
4. Ejecutar pruebas y compilaciones.
5. Confirmar acceso al proyecto Supabase.
6. Revisar el archivo Figma con la cuenta `la cuenta de diseño del equipo`.
7. Implementar el layout del dashboard administrativo antes de agregar nuevos módulos.
8. Mantener una prueba y una nota de decisión por cada cambio importante.
