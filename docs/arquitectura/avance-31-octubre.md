# Documento de arquitectura para el avance del 31 de octubre

Resumen visual del estado construido a la fecha (corte S1/S2, 29-oct-2026): diagrama de arquitectura, diagrama entidad-relación del esquema real, matriz de acceso (RBAC) y privacidad. Cubre FR-131-02 (parte HTML/Markdown; el PDF es la tarea 131-T05).

Este documento resume; la fuente de cada tema es:

| Tema | Fuente completa |
|---|---|
| Arquitectura y flujos de escritura | [arquitectura.md](arquitectura.md) |
| Modelo de datos del diseño completo (S1 a S5) | [modelo-datos.md](modelo-datos.md) |
| Esquema real (verdad) | `supabase/migrations/*.sql` |
| Matriz RBAC (generada, no editar) | [roles-y-permisos.md](roles-y-permisos.md), datos en `datos/permisos.csv` y `datos/roles.csv` |
| Privacidad por campo y por rol | [privacidad.md](privacidad.md) |
| Eventos y canales de tiempo real | [tiempo-real.md](tiempo-real.md) |
| Decisiones (ADR) | `docs/decisiones/adr/` y `docs/decisiones/registro-decisiones.md` |

## 1. Arquitectura

```mermaid
flowchart TB
  subgraph Clientes
    W["Web · React + Vite"]
    K["Android · Kotlin + Compose"]
    I["iOS · SwiftUI"]
  end
  subgraph Servidor["API · Node.js 22 + NestJS (Fastify)"]
    G["Guardas: JWT de Supabase + permiso por endpoint"]
    M["Módulos: auth, users, patients, operations, health"]
    CS["CommandService: permiso, transacción, idempotencia, auditoría, outbox"]
    G --> M --> CS
  end
  subgraph Supabase
    AU["Supabase Auth"]
    DB[("PostgreSQL · un esquema por dominio · RLS")]
    RT["Realtime · Broadcast"]
  end
  W -- "inicio de sesión" --> AU
  K -- "inicio de sesión" --> AU
  I -- "inicio de sesión" --> AU
  W -- "REST + JWT" --> G
  K -- "REST + JWT" --> G
  I -- "REST + JWT" --> G
  G -- "auth.getUser" --> AU
  CS -- "rol sghu_api, SET LOCAL ROLE" --> DB
  DB -- "outbox: disparador realtime.send" --> RT
  RT -- "evento delgado (canal autorizado)" --> W
  W -. "tras una caída: GET /eventos?after=" .-> G
```

Puntos que el diagrama resume (detalle en [arquitectura.md](arquitectura.md)):

- Los clientes nunca consultan tablas de negocio: Supabase solo les da inicio de sesión y Realtime. La API es la única que escribe (regla 4 de `AGENTS.md`).
- Toda escritura pasa por `CommandService` en una sola transacción: cambio, auditoría encadenada y fila en `plataforma.outbox`. Si la transacción falla no hay evento.
- Tiempo real sin sondeo (regla 9): el evento llega por Broadcast, el cliente invalida y vuelve a pedir lo suyo. Solo tras una caída o al volver la red se hace una consulta de recuperación a `/eventos`. En este corte solo la web tiene suscripción; Android e iOS la incorporan en S3 (ver [arquitectura.md](arquitectura.md)).
- Secretos: `DATABASE_URL` y la clave privada solo en el servidor; los clientes usan la clave publicable.

### Flujo de una escritura con tiempo real

```mermaid
sequenceDiagram
  participant C as Cliente
  participant A as API
  participant D as PostgreSQL
  participant R as Realtime
  participant O as Otro cliente
  C->>A: JWT + operación + versión + Idempotency-Key
  A->>D: BEGIN, permisos vigentes, idempotencia
  A->>D: cambio + auditoría + outbox
  A->>D: COMMIT
  D-->>R: realtime.send (evento delgado, sin datos personales)
  A-->>C: resultado
  R-->>O: evento en su canal
  O->>A: vuelve a pedir lo que le toca
```

## 2. Diagrama entidad-relación del esquema real

Verificado contra `supabase/migrations/` (16 archivos: 13 base, 2 de invitaciones y `core_semanas_1_2`). Un esquema PostgreSQL por dominio; las referencias entre esquemas son llaves lógicas sin llave foránea (convención de [modelo-datos.md](modelo-datos.md)), por eso aparecen como `uuid` sin relación dibujada. Solo se listan columnas clave. `modelo-datos.md` conserva el diseño objetivo completo; donde difiere de las migraciones, manda la migración.

### 2.1 Mapa de esquemas

```mermaid
flowchart LR
  acceso["acceso<br/>rol, permiso, rol_permiso, usuario, asignacion_rol,<br/>vinculacion_paciente, acceso_excepcional,<br/>dispositivo_push, invitacion, administrador_principal"]
  pacientes["pacientes<br/>paciente, identificador, tipo_identificador,<br/>historial_demografico, busqueda_registro, caso_duplicado"]
  personal["personal<br/>persona, inscripcion, turno"]
  infra["infra<br/>espacio, bloqueo_cama, limpieza_cama,<br/>tipo_equipo, equipo"]
  atencion["atencion<br/>contador_fila, ticket_fila, cita, consulta, cie10,<br/>signos_vitales, diagnostico, receta, receta_item,<br/>addendum, relacion_atencion"]
  laboratorio["laboratorio<br/>examen, examen_componente, rango_referencia,<br/>orden, orden_item, resultado, resultado_historial"]
  hosp["hospitalizacion<br/>admision, ocupacion_cama, reserva_cama,<br/>traslado, alta, nota_enfermeria"]
  amb["ambulancia<br/>unidad, cambio_estado, solicitud, servicio,<br/>tripulacion, hito, reporte_prehospital, ubicacion"]
  inv["inventario<br/>articulo, lote, existencia, movimiento"]
  pub["publico<br/>aviso + vistas v_ocupacion,<br/>v_avisos_vigentes, v_medicos_de_turno"]
  plat["plataforma<br/>idempotencia, outbox, inbox,<br/>auditoria, politica"]
  acceso -.-> pacientes
  acceso -.-> personal
  atencion -.-> pacientes
  atencion -.-> personal
  hosp -.-> pacientes
  hosp -.-> infra
  amb -.-> pacientes
  amb -.-> personal
  inv -.-> infra
  pub -.-> personal
```

Operaciones de API implementadas en este corte: `acceso`, `pacientes`, `personal`, `infra` (espacios, camas) y la lectura de estado de `ambulancia`. Las tablas de `atencion`, `laboratorio`, `hospitalizacion`, `inventario`, el resto de `ambulancia` y `publico` ya existen en el esquema, pero sus operaciones corresponden a S3 a S5.

### 2.2 Acceso y plataforma

```mermaid
erDiagram
  usuario ||--o{ asignacion_rol : tiene
  rol ||--o{ asignacion_rol : ""
  rol ||--o{ rol_permiso : ""
  permiso ||--o{ rol_permiso : ""
  usuario ||--o{ vinculacion_paciente : solicita
  usuario ||--o{ acceso_excepcional : solicita
  usuario ||--o{ dispositivo_push : registra
  usuario ||--o{ invitacion : recibe
  rol ||--o{ invitacion : "rol invitado"
  usuario ||--o| administrador_principal : "es"
  usuario {
    uuid id PK "igual a auth.users.id"
    text correo
    uuid persona_personal_id "personal.persona, opcional"
    uuid paciente_id "pacientes.paciente, opcional"
    text estado
    int version
  }
  rol {
    text codigo PK "ADM, JOP, REC, AST, ENF, MED, LAB, PAR, DPD, PAC"
    text plataformas
  }
  permiso {
    text codigo PK
  }
  rol_permiso {
    text rol_codigo FK
    text permiso_codigo FK
    text contexto
  }
  asignacion_rol {
    uuid usuario_id FK
    text rol_codigo FK
    uuid asignado_por
  }
  acceso_excepcional {
    uuid id PK
    uuid solicitante_id FK
    uuid paciente_id
    tstzrange vigencia
    text estado
    uuid resuelto_por FK
  }
  invitacion {
    uuid id PK
    uuid usuario_id FK
    text rol_codigo FK
    uuid invitado_por FK
    text estado
  }
```

```mermaid
erDiagram
  outbox {
    bigint seq PK
    uuid evento_id
    text tipo
    text entidad
    uuid entidad_id
    int version
    text_array canales
    timestamptz publicado_en
  }
  auditoria {
    bigint seq PK
    uuid actor_id
    text permiso
    text accion
    text entidad
    uuid paciente_id
    text resultado
    bytea hash_previo
    bytea hash
  }
  idempotencia {
    text alcance PK
    text clave PK
    text huella
    text estado
    jsonb respuesta
  }
  politica {
    uuid id PK
    text clave
    tstzrange vigencia "sin traslape por clave"
  }
  inbox {
    text consumidor PK
    uuid evento_id PK
  }
```

`plataforma` no tiene llaves foráneas hacia los demás esquemas: el actor y la entidad se guardan como identificadores. La auditoría solo admite inserciones y cada hash incluye el anterior.

### 2.3 Pacientes, personal y edificio

```mermaid
erDiagram
  paciente ||--o{ identificador : tiene
  tipo_identificador ||--o{ identificador : tipifica
  paciente ||--o{ historial_demografico : versiona
  persona ||--o{ inscripcion : tiene
  persona ||--o{ turno : cubre
  espacio ||--o{ espacio : contiene
  espacio ||--o{ bloqueo_cama : bloquea
  espacio ||--o{ limpieza_cama : limpia
  espacio ||--o{ equipo : aloja
  tipo_equipo ||--o{ equipo : tipifica
  paciente {
    uuid id PK
    text expediente
    text estado
    text nombres
    text primer_apellido
    date nacimiento
    text fon_apellido "búsqueda fonética"
    int version
  }
  identificador {
    uuid id PK
    uuid paciente_id FK
    text tipo FK
    text valor_normalizado "único por tipo y emisor"
    text estado
  }
  persona {
    uuid id PK
    text nombres
    text tipo
    text especialidad
    uuid area_id "infra.espacio"
    bool activo
    int version
  }
  turno {
    uuid id PK
    uuid persona_id FK
    uuid area_id "infra.espacio"
    tstzrange periodo "EXCLUDE por persona"
    text tipo
    text estado
    int version
  }
  espacio {
    uuid id PK
    uuid padre_id FK "árbol"
    text tipo
    text codigo
    text categoria "vip, semiprivada"
    int capacidad
    int version
  }
  limpieza_cama {
    uuid cama_id FK
    uuid limpiada_por
    uuid verificada_por
  }
```

`pacientes.busqueda_registro` (constancia de búsqueda previa al registro) y `pacientes.caso_duplicado` complementan el módulo sin llaves foráneas.

### 2.4 Hospitalización y ambulancia

```mermaid
erDiagram
  admision ||--o{ ocupacion_cama : ocupa
  admision ||--o{ reserva_cama : reserva
  admision ||--o{ traslado : traslada
  admision ||--o| alta : cierra
  admision ||--o{ nota_enfermeria : registra
  unidad ||--o{ cambio_estado : historial
  unidad ||--o{ servicio : atiende
  solicitud ||--o| servicio : origina
  servicio ||--o{ hito : tiene
  servicio ||--o{ tripulacion : lleva
  servicio ||--o| reporte_prehospital : genera
  servicio ||--o{ ubicacion : reporta
  admision {
    uuid id PK
    uuid paciente_id
    text estado
    int version
  }
  ocupacion_cama {
    uuid id PK
    uuid admision_id FK
    uuid cama_id "infra.espacio"
    tstzrange periodo "EXCLUDE por cama"
  }
  unidad {
    uuid id PK
    text placa
    text estado
    int version
  }
  servicio {
    uuid id PK
    uuid unidad_id FK
    uuid solicitud_id FK
    timestamptz finalizado_en "único parcial: un servicio activo por unidad"
  }
```

### 2.5 Invariantes verificadas en las migraciones

| Invariante | Mecanismo encontrado |
|---|---|
| Una cama, un paciente a la vez | `exclude using gist (cama_id with =, periodo with &&)` en `hospitalizacion.ocupacion_cama` (y en `reserva_cama` activa) |
| Una admisión activa por paciente | índice único parcial `admision_activa_unica` |
| Una persona sin turnos traslapados | `exclude using gist (persona_id with =, periodo with &&) where (estado <> 'cancelado')` en `personal.turno` |
| Un médico sin dos citas a la vez | `exclude using gist (medico_id with =, horario with &&)` en `atencion.cita` |
| Un servicio activo por ambulancia | índice único parcial `servicio_activo_unico` sobre `ambulancia.servicio (unidad_id) where finalizado_en is null` |
| Una limpieza abierta por cama | índice único parcial `limpieza_abierta_unica` |
| DUI y demás identificadores únicos | índice único `identificador_exclusivo (tipo, emisor, valor_normalizado)` |
| Un diagnóstico principal por consulta | índice único parcial `diagnostico_principal_unico` |
| Último administrador protegido | triggers `proteger_ultimo_admin` y `proteger_desactivacion` en `acceso.usuario` |
| Políticas sin traslape | `exclude using gist (clave with =, vigencia with &&)` en `plataforma.politica` |
| RLS en las tablas de negocio | migración `..._seguridad.sql` habilita RLS por esquema; Realtime autoriza canales con la política `sghu_escuchar_canales` en `realtime.messages` |

El número de fila (`atencion.ticket_fila`) y la existencia de inventario también tienen restricciones en sus migraciones; sus operaciones llegan en S3 a S5.

## 3. Control de acceso (RBAC)

La matriz completa, con los 10 roles y cada permiso, se **genera** desde `datos/permisos.csv` y `datos/roles.csv`: [roles-y-permisos.md](roles-y-permisos.md). Aquí solo el mecanismo y el resumen de roles.

```mermaid
flowchart LR
  U["acceso.usuario"] --> AR["acceso.asignacion_rol"]
  AR --> R["acceso.rol"]
  R --> RP["acceso.rol_permiso<br/>(contexto: relación, propio, área...)"]
  RP --> P["acceso.permiso"]
  RP --> V["acceso.v_permisos_usuario"]
  V --> API["API: @RequirePermission('camas.bloquear')"]
  V --> H["acceso.hook_token / canales_actuales<br/>(roles y canales de Realtime)"]
```

- El código pregunta por **permiso**, nunca por rol (regla 8). El permiso se resuelve en la base con la cuenta vigente; nada se toma de `user_metadata`.
- Nadie se asigna roles a sí mismo ni aprueba su propio acceso excepcional; el último administrador activo no se puede desactivar.
- Pruebas de arquitectura (`api/tests/architecture.spec.ts`) verifican que cada endpoint de negocio tenga guarda y permiso.

| Rol | Plataformas | Función |
|---|---|---|
| ADM | Web | Usuarios, roles, edificio y catálogos; no ve contenido clínico |
| JOP | Web | Opera el día: camas, turnos, ambulancia, inventario |
| REC | Android; Web | Registro de pacientes, fila, citas, admisión, camas |
| AST | Android | Apoyo de consulta y signos vitales |
| ENF | Android | Cuidado del hospitalizado, limpieza de cama |
| MED | iOS; Android | Consulta, diagnósticos, órdenes, alta |
| LAB | Web; Android | Órdenes y resultados de laboratorio |
| PAR | Android | Tripulación de la ambulancia |
| DPD | Web | Accesos excepcionales y auditoría |
| PAC | Android; iOS | Su propio expediente, citas y resultados revisados |

La web del corte actual atiende ADM, JOP, REC, LAB y DPD; los demás roles ingresan por móvil.

## 4. Privacidad

Política técnica completa: [privacidad.md](privacidad.md). Resumen:

| Clase | Quién la ve |
|---|---|
| Pública | Cualquiera, sin sesión (ocupación agregada, médicos de turno, avisos, números de fila llamados) |
| Interna | Personal con sesión según permiso (estado de camas sin ocupante, ambulancia, turnos) |
| Personal | Paciente dueño y personal que lo atiende o registra |
| Clínica (sensible) | Paciente dueño (lo revisado), equipo con relación de atención, o acceso excepcional aprobado |

- ADM y JOP ven lo necesario para operar, **nunca** lo clínico por su rol; para verlo piden un acceso excepcional que aprueba el DPD (otra persona), vence solo y queda auditado.
- Toda lectura de datos de paciente queda auditada (regla 7). Los eventos de Realtime son delgados: entidad, identificador y versión, sin datos personales.
- Sesión web: cierre a los 15 minutos de inactividad. Sesión móvil: cierre al volver tras 5 minutos en segundo plano.
- Las búsquedas de pacientes guardan una huella de los criterios, no el texto original, y exigen buscar antes de registrar.
- Datos de prueba siempre ficticios.

## 5. Estado del corte y límites

- Construido y probado localmente: API con PGlite (ver el [README raíz](../../README.md#validación)), web, fuentes Android e iOS.
- Entorno demo desplegado en Render sobre Supabase; los pendientes de configuración remota están en [ges-15-supabase-remoto.md](../desarrollo/ges-15-supabase-remoto.md).
- Pendiente de S3 a S5: operaciones clínicas, suscripciones nativas de Realtime, notificaciones push, Storage clínico.
- Este documento no incluye el enlace a Figma (131-T03); la sincronización de Figma está diferida por indicación del equipo.
- Fuera de este documento: el PDF de arquitectura (131-T05) y la trazabilidad requisito, spec, prueba (FR-131-06).
