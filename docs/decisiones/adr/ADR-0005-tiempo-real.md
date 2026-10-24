# ADR-0005. Tiempo real y notificaciones

**Estado:** Aceptada (17-oct-2026). Decisiones: D-027, D-060. Requisitos REQ-PLT-06, REQ-AMB-02.

## Decisión
1. La API registra cada evento de dominio en `plataforma.outbox` dentro de la transacción del cambio.
2. Un disparador sobre el outbox llama a `realtime.send` de Supabase (Broadcast desde la base). El evento solo existe si el cambio se confirmó.
3. Mensaje delgado: `{tipo, entidad, id, version, ocurrido}`. Sin nombres, diagnósticos ni resultados.
4. Canales privados por audiencia: `publico`, `rol:<rol>`, `area:<area>`, `paciente:<id>` (solo su cuenta y su equipo tratante), `usuario:<id>`. La autorización de canal usa políticas RLS sobre `realtime.messages` con los canales permitidos en el token (ADR-0004).
5. El cliente, al recibir, invalida su caché y pide a la API. Si se perdió la conexión, al reconectar vuelve a pedir el estado actual: nunca depende de haber recibido todos los mensajes.
6. Con la app cerrada: notificación push (FCM en Android, APNs en iOS) solo para eventos que requieren acción (ambulancia asignada, valor crítico, resultado revisado, turno llamado). Lo envía un trabajador de la API que consume el outbox.

## Por qué no SignalR
SignalR obligaría a mantener conexiones en la API y clientes en tres plataformas; Supabase ya trae SDK oficial de Realtime para JavaScript, Kotlin y Swift, y el disparador garantiza que no se notifica nada que no se guardó.
