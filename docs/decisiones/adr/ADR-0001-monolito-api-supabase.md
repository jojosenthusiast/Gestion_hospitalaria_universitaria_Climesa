# ADR-0001. Monolito modular con API propia sobre Supabase

**Estado:** Aceptada (17-oct-2026). Reemplaza ADR-0001 del legado. Decisiones: D-021, D-022, D-023, D-061.

## Contexto
El curso exige iOS, Android y web contra un backend común, con privacidad evaluada, tiempo real y pruebas de concurrencia, en 5 semanas. El equipo eligió Supabase (PostgreSQL) y quiere una API propia. El legado tiene una plataforma .NET 10 probada: idempotencia, outbox, auditoría encadenada, políticas por fecha, reloj controlable.

## Opciones
| Opción | A favor | En contra |
|---|---|---|
| A. Solo Supabase (RLS, funciones SQL, sin API) | Menos código; privacidad en la base | El equipo pidió API; lógica en SQL más difícil de probar y explicar; reglas repartidas entre RLS y clientes |
| **B. API ASP.NET Core sobre Supabase** | Una sola entrada de negocio para los tres clientes; reutiliza la plataforma del legado; pruebas con herramientas comunes; contrato OpenAPI | Hay que desplegar la API aparte; una capa más |
| C. API en Node o Edge Functions | Mismo lenguaje que la web | Se pierde la plataforma .NET probada; Edge Functions limitadas para transacciones largas |

## Decisión
Opción B. Una API ASP.NET Core (.NET 10) organizada como monolito modular. Supabase aporta PostgreSQL, Auth, Realtime y Storage.

## Consecuencias
- Los clientes usan el SDK de Supabase solo para sesión (Auth) y suscripción (Realtime). Todo dato de negocio se lee y escribe por la API.
- Las tablas de negocio niegan acceso directo a los roles `anon` y `authenticated` de Supabase; la API se conecta con un rol propio de base de datos.
- La API se despliega en contenedor (ADR-0008).
- Las invariantes siguen en la base (restricciones, bloqueos); la API no las reemplaza.
