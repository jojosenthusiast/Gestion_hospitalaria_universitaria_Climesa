# Invitaciones y jerarquía administrativa

## Regla vigente

- El administrador principal puede invitar cualquier rol, incluido `ADM`.
- Un administrador secundario puede invitar roles operativos y pacientes, pero no `ADM`.
- La API Node.js aplica la regla aunque se manipule el frontend.
- `GET /auth/me` devuelve `canInviteAdmin`. La aplicación web muestra la opción `ADM` solamente cuando el API confirma que la cuenta es principal.
- Cada invitación se registra en `acceso.invitacion` con actor, correo, nombre, rol y estado.

## Activación de base de datos

Antes de utilizar el módulo ampliado en Supabase debe aplicarse la migración (y su complemento de RLS, que no proviene de la v11 y sigue ADR-0004):

```text
supabase/migrations/20261024000100_invitaciones_jerarquia.sql
supabase/migrations/20261024000110_invitaciones_rls.sql
```

La migración toma como administrador principal al primer `ADM` activo si ya existe. Si no existe todavía la fila, el API puede inicializarla cuando el único administrador activo realice la primera operación.

## Seguridad

La lista de roles se valida en `class-validator`, pero esa validación del formulario no es la frontera de seguridad. La autorización definitiva ocurre en Node.js con el JWT de Supabase, el catálogo de roles y la fila única de `administrador_principal`.
