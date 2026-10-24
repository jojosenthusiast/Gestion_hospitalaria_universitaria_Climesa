# Entrega 03 del backend: autenticación y permisos

La API ahora separa autenticación y autorización:

- `SupabaseAuthGuard` valida el JWT contra Supabase Auth y coloca el usuario autenticado en la petición.
- `PermissionGuard` consulta `acceso.v_permisos_usuario` y exige el permiso declarado por cada ruta.
- `RequirePermission('codigo')` deja visible en el controlador qué capacidad necesita cada operación.
- `GET /api/v1/auth/me` devuelve la cuenta autenticada, sus roles y sus permisos efectivos.
- Las rutas de pacientes exigen autenticación y `pacientes.buscar`.

La base remota ya contiene los catálogos de 10 roles y 75 permisos, pero todavía no tiene usuarios. Por eso ningún permiso puede resolverse hasta crear el primer usuario y asignarle un rol en `acceso.asignacion_rol`.

## Verificación

```text
npm test -- --runInBand
npm run build
```

Resultado: 3 suites aprobadas, 3 pruebas aprobadas y compilación TypeScript exitosa.

El SMTP y el primer administrador siguen siendo tareas de configuración de Supabase; no se inventan cuentas ni credenciales dentro del repositorio.
