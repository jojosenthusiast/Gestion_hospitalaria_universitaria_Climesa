# Arquitectura de CLIMESA · corte S1/S2

Implementación vigente: Node.js + TypeScript según ADR-024. Las referencias ASP.NET/Npgsql de documentos históricos describen el punto de partida, no el código actual.

## Interacción de plataformas

```mermaid
flowchart TB
  W["Web · React"] --> A["API · NestJS / Fastify"]
  K["Android · Compose"] --> A
  I["iOS · SwiftUI"] --> A
  W --> S["Supabase Auth"]
  K --> S
  I --> S
  A --> S
  A --> P["PostgreSQL · node-postgres"]
  P --> R["Realtime Broadcast"]
  R --> W
```

Los tres clientes obtienen tokens de Supabase Auth. La API comprueba emisor, audiencia y vencimiento y valida la identidad con `auth.getUser`. Después resuelve cuenta activa, roles, permisos, plataformas y canales en la base. Ningún permiso se toma de `user_metadata`.

En este corte, Realtime se consume en web; Android e iOS actualizan por consulta y refresco. Sus suscripciones nativas corresponden a S3. La web usa Broadcast sin sondeo periódico (regla 9): solo tras una caída del canal o al volver la red pide una vez los eventos pendientes a `GET /eventos?after=` y vuelve a consultar (ver `web/src/lib/live.ts` y `tiempo-real.md`). `publico` es un Broadcast público sin datos personales; los canales de rol y usuario son privados. Su política de autorización consulta la cuenta vigente.

## API modular

```mermaid
flowchart TB
  H["Guardas de identidad y permiso"] --> C["Controladores por módulo"]
  C --> S["Servicios de aplicación"]
  S --> X["CommandService / transacción"]
  X --> D["Datos de negocio"]
  X --> U["Auditoría encadenada"]
  X --> O["Outbox delgado"]
  S --> Q["PolicyRegistry y Clock"]
```

- `auth`: identidad y perfil efectivo.
- `users`: invitaciones, directorio de cuentas, roles y estado.
- `patients`: búsqueda fonética, constancia previa al registro, identificadores, historial y privacidad.
- `operations`: personal, turnos, espacios, camas, resumen, metadatos de auditoría y recuperación de eventos.
- `platform`: conexiones `pg`, transacciones, Clock, PolicyRegistry, idempotencia, auditoría y errores uniformes.

La base conserva un esquema por dominio. El core S1/S2 orquesta lecturas entre acceso, personal, pacientes, infraestructura y relaciones asistenciales para resolver permisos y operaciones compartidas; no es un conjunto de servicios desplegados por separado. Las transacciones usan el mismo `PoolClient`, con `SET LOCAL ROLE sghu_api` y tiempo máximo de consulta. Las invariantes concurrentes también están en SQL: índices únicos, exclusiones GiST y validadores del árbol.

## Escrituras

```mermaid
sequenceDiagram
  participant C as Cliente
  participant A as API
  participant D as PostgreSQL
  participant R as Realtime
  C->>A: JWT, operación, versión y Idempotency-Key
  A->>D: BEGIN y permisos vigentes
  A->>D: Idempotencia y bloqueo del registro
  A->>D: Cambio + auditoría + outbox
  A->>D: COMMIT
  D-->>R: Evento con entidad, ID y versión
  A-->>C: Resultado de la operación
```

La clave de idempotencia se particiona por actor y operación, vincula el hash del cuerpo y conserva la respuesta completada. Una clave repetida con otro cuerpo devuelve 409. Una versión antigua devuelve 409. El último ADM activo está protegido en la API y mediante triggers SQL. La auditoría admite solo inserciones y cada hash incluye el anterior y el JSON canónico del evento. Los errores incluyen un código y un identificador de solicitud; no se registran contraseñas, tokens, cuerpos o criterios de búsqueda originales.

La invitación necesita dos sistemas: correo/Auth y la transacción de la aplicación. Su proveedor externo no participa en una transacción distribuida. Si Auth envía el enlace y luego falla el registro SQL, el administrador debe revisar la cuenta creada antes de reintentar; no se elimina automáticamente una identidad remota. Los reintentos de una operación completada son idempotentes.

## Clientes y secretos

Web: React, estado de sesión, módulos condicionados por rol, tipos de escritura generados desde OpenAPI y componentes responsive. Android: MVVM con ViewModels Hilt, repositorios HTTP y tokens cifrados mediante Keystore. iOS: SwiftUI/MVVM, servicios actor, URLSession y Keychain con accesibilidad solo en el dispositivo desbloqueado. Las tres plataformas verifican `/auth/me` antes de habilitar datos. Las contraseñas no se guardan; los pacientes remotos no se almacenan en disco.

Solo el servidor recibe `DATABASE_URL` y la clave privada necesaria para invitaciones. Web y apps usan la clave publicable. Docker empaqueta la API y expone un puerto local para colocarlo detrás de HTTPS. La web se compila con las URL públicas de Auth y API. La configuración de Release de las apps requiere el backend remoto.

## Validación y estado remoto

Las pruebas locales cubren HTTP, roles, migraciones, RLS, comandos y reglas de negocio con PGlite. PGlite usa un motor PostgreSQL con una sola conexión y no demuestra carreras multisesión; `compose.test.yaml` y el workflow `postgres-native` cubren ese entorno cuando se ejecuten con Docker. No hay Docker ni SDK móviles en este entorno. La cuenta conectada de Supabase no expone el proyecto CLIMESA: la migración nueva no fue aplicada en la nube y no hay una URL de API desplegada verificada.

FCM, APNs, Storage clínico y operaciones clínicas de S3–S5 siguen fuera del corte construido. Figma se sincronizará después de cerrar la implementación, según el orden solicitado.

---

# Diseño objetivo del conjunto (planificación, ADR-0001 a ADR-0008)

Las secciones siguientes describen el diseño completo del sistema, incluidos los módulos de semanas posteriores. Aplican a la API actual en Node.js + NestJS (ADR-024); CommandRunner en los textos de diseño corresponde a CommandService y las pruebas de arquitectura viven en pi/tests/architecture.spec.ts.

## Diseño objetivo 1. Clientes con MVVM

```mermaid
flowchart LR
  V[Vista<br/>Compose / SwiftUI / React] -- intenciones --> VM[ViewModel<br/>StateFlow / @Observable / hook]
  VM -- estado inmutable --> V
  VM --> R[Repositorio]
  R -- async --> API2[Cliente HTTP de la API]
  R -- suscripción --> RT2[Cliente Realtime de Supabase]
  RT2 -- evento delgado --> R
  R -- invalida y vuelve a pedir --> API2
```

- Android: corrutinas y `Flow`; Hilt para inyección; Room solo para la cola sin conexión del paramédico.
- iOS: `async/await`, `@MainActor @Observable` en view models; protocolos para simular repositorios en pruebas.
- Web: TanStack Query como caché; el evento de Realtime invalida la consulta correspondiente.

## Diseño objetivo 2. Flujos clave de la defensa

### Asignación concurrente de la última cama

```mermaid
sequenceDiagram
  participant R1 as Recepción Android
  participant R2 as Jefe Op. Web
  participant API
  participant DB
  R1->>API: POST /admisiones/A/cama {cama: HAB-203-B}
  R2->>API: POST /admisiones/B/cama {cama: HAB-203-B}
  API->>DB: INSERT ocupación A (EXCLUDE)
  API->>DB: INSERT ocupación B (EXCLUDE)
  DB-->>API: A confirma
  DB-->>API: B falla: conflicto de exclusión
  API-->>R1: 200 asignada
  API-->>R2: 409 "otra persona tomó esta cama" + siguiente sugerencia
  DB-->>R2: Realtime cama.estado_cambiado (el tablero ya la muestra ocupada)
```

### Despacho de la única ambulancia con aviso previo a la llegada

```mermaid
sequenceDiagram
  participant P as Paciente iOS
  participant D as Despacho Web
  participant A as Paramédico Android
  participant E as Emergencia Android
  participant API
  P->>API: POST /ambulancia/solicitudes (por confirmar)
  API-->>D: Realtime + sonido
  D->>API: POST /ambulancia/servicios (bloqueo de la unidad)
  API-->>A: push "servicio asignado"; estado En Servicio
  A->>API: hitos: salida, en escena, trasladando
  A->>API: POST prehospital (si no hay señal, se encola y se reenvía con la misma clave)
  API-->>E: Realtime + push "llega en 8 min"
  A->>API: hito en hospital, finalizado
  API-->>D: Disponible
  API-->>P: "la ambulancia llegó"
```

## Diseño objetivo 3. Seguridad en capas

| Capa | Control |
|---|---|
| Transporte | HTTPS en todo; JWT de corta duración con renovación |
| API | Permiso por endpoint, contexto de atención, filtrado de campos, idempotencia, límite de intentos de búsqueda |
| Base de datos | RLS que niega acceso directo a `anon` y `authenticated`; rol de la API con mínimos privilegios; auditoría solo inserción |
| Realtime | Canales privados autorizados por políticas sobre `realtime.messages`; mensajes sin datos personales |
| Clientes | Sin llaves de servicio; sesión con cierre por inactividad; sin datos clínicos en disco salvo la cola cifrada del paramédico |
