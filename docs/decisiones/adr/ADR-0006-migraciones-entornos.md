# ADR-0006. Migraciones, semillas y entornos

**Estado:** Aceptada (17-oct-2026).

1. Una sola fuente de esquema: `supabase/migrations/*.sql`, aplicadas con Supabase CLI (`supabase db push`) en la nube y con el mismo archivo en el PostgreSQL de pruebas.
2. Semillas ficticias en `supabase/seed/`: edificio (planta 1 a 3, 17 camas), catálogos de laboratorio con rangos, personal y turnos de ejemplo, pacientes ficticios. Nunca datos reales.
3. Entornos: `local` (PostgreSQL 16 o superior para pruebas), `nube-dev` (proyecto Supabase del equipo), `demo` (proyecto Supabase congelado para la defensa, restaurable desde semillas en un comando).
4. Variables de entorno documentadas en `.env.example` de cada cliente y de la API. Ninguna llave de servicio en el repositorio ni en los clientes.
5. Riesgo conocido: el plan gratuito de Supabase pausa proyectos inactivos; el entorno `demo` se usa al menos una vez por semana hasta la defensa.
