# Modelo de datos

Requisitos: diagrama de base de datos con modelos de doctores, pacientes, turnos, habitaciones (VIP y semiprivadas), administración, laboratorio y ambulancia (documentación del curso, punto 2). Decisiones: D-002, D-013, D-053, D-062, D-063. ADR-0004, ADR-0007.

Convenciones: un esquema PostgreSQL por módulo; llaves `uuid` generadas en la base; `version int` para concurrencia optimista en tablas editables; `creado_en`, `creado_por`; instantes `timestamptz`. Ningún módulo lee ni escribe tablas de otro. Un módulo puede publicar **vistas de solo lectura** con prefijo `v_` como parte de su contrato (por ejemplo `hospitalizacion.v_ocupacion_activa`); solo esas vistas se consultan desde otro esquema. El modelo completo contiene también módulos de semanas posteriores. El core S1/S2 usa vistas e información de relación de los esquemas vecinos para orquestar autorización, camas y turnos; conserva cada escritura en el esquema de su dominio. Las relaciones entre esquemas son llaves lógicas, sin llaves foráneas cruzadas. El cliente accede únicamente a la API; RLS impide el acceso directo a tablas de negocio.

Corte actual: 14 migraciones SQL, semilla con 17 camas (12 semiprivadas y 5 VIP), diez roles y 75 permisos. La revisión local carga todas las migraciones; el estado remoto de la nueva migración está pendiente de conexión al proyecto correcto.

## Vista general

```mermaid
flowchart LR
  acceso[acceso<br/>usuarios, roles, vinculación, accesos excepcionales]
  pacientes[pacientes<br/>paciente, identificadores, historial]
  personal[personal<br/>personal, inscripciones, turnos]
  infra[infra<br/>espacios en árbol, camas, equipo]
  atencion[atencion<br/>fila, citas, consultas, recetas]
  lab[laboratorio<br/>catálogo en árbol, órdenes, resultados]
  hosp[hospitalizacion<br/>admisiones, ocupaciones, alta]
  amb[ambulancia<br/>unidad, solicitudes, servicios, bitácora]
  inv[inventario<br/>artículos, lotes, movimientos]
  pub[publico<br/>avisos]
  plat[plataforma<br/>outbox, idempotencia, auditoría, políticas]
  acceso --> pacientes
  acceso --> personal
  atencion --> pacientes
  atencion --> personal
  atencion --> infra
  lab --> atencion
  hosp --> pacientes
  hosp --> infra
  amb --> pacientes
  amb --> personal
  inv --> infra
  pub --> personal
  plat -.-> acceso
```

## Plataforma y acceso

```mermaid
erDiagram
  USUARIO ||--o{ ASIGNACION_ROL : tiene
  ROL ||--o{ ASIGNACION_ROL : ""
  ROL ||--o{ ROL_PERMISO : ""
  PERMISO ||--o{ ROL_PERMISO : ""
  USUARIO ||--o| VINCULACION_PACIENTE : pide
  USUARIO ||--o{ ACCESO_EXCEPCIONAL : solicita
  USUARIO ||--o{ DISPOSITIVO_PUSH : registra
  USUARIO {
    uuid id PK "igual a auth.users.id de Supabase"
    uuid persona_personal_id FK "nulo si es paciente"
    uuid paciente_id FK "nulo hasta vincular"
    text estado "activo, desactivado"
  }
  ASIGNACION_ROL {
    uuid usuario_id FK
    text rol_codigo FK
    uuid asignado_por "distinto de usuario_id"
    tstzrange vigencia
  }
  VINCULACION_PACIENTE {
    uuid id PK
    uuid usuario_id FK
    text dui_declarado
    date nacimiento_declarado
    uuid paciente_candidato_id
    text estado "pendiente, aprobada, rechazada"
    uuid verificado_por
  }
  ACCESO_EXCEPCIONAL {
    uuid id PK
    uuid solicitante_id FK
    uuid paciente_id
    text motivo
    tstzrange vigencia
    text estado "pendiente, aprobado, negado, vencido"
    uuid aprobado_por "distinto de solicitante"
  }
```

Tablas de plataforma (heredadas del legado, `docs/legado/climesa-his-v0/src/Climesa.Platform/Sql/0001_platform.sql`): `outbox` (evento, canal, carga delgada, publicado_en), `idempotencia` (alcance, clave, huella del contenido, resultado), `auditoria` (actor, acción, paciente, resultado, motivo, hash previo, hash; solo inserción), `politica` (clave, valor json, vigencia `tstzrange` sin traslape, fuente, aprobador).

## Pacientes y personal

```mermaid
erDiagram
  PACIENTE ||--o{ IDENTIFICADOR : tiene
  PACIENTE ||--o{ HISTORIAL_DEMOGRAFICO : versiona
  PACIENTE ||--o{ CASO_DUPLICADO : participa
  PERSONA_PERSONAL ||--o{ INSCRIPCION : tiene
  PERSONA_PERSONAL ||--o{ TURNO : cubre
  TIPO_PERSONAL ||--o{ PERSONA_PERSONAL : clasifica
  PACIENTE {
    uuid id PK
    text expediente UK "con dígito ISO 7064"
    text nombres
    text apellidos
    text sexo "F, M, indeterminado"
    date nacimiento
    text precision_nacimiento "exacta, estimada"
    bool provisional
    text estado "activo, inactivo"
    int version
  }
  IDENTIFICADOR {
    uuid paciente_id FK
    text tipo "DUI, pasaporte, NUI, carné de minoridad"
    text valor "DUI único por índice parcial"
    text verificacion
  }
  PERSONA_PERSONAL {
    uuid id PK
    text nombres
    text tipo "médico, enfermero, asistente, recepcionista, laboratorista, paramédico, motorista, limpieza, otro"
    text especialidad "alergista, emergencias, medicina general..."
    uuid area_id "espacio donde trabaja"
    bool activo
    int version
  }
  INSCRIPCION {
    uuid persona_id FK
    text junta "JVPM, JVPE, JVPL"
    text numero
    daterange vigencia
  }
  TURNO {
    uuid id PK
    uuid persona_id FK
    uuid area_id
    tstzrange periodo "EXCLUDE por persona y periodo"
    text tipo "diurno, nocturno, guardia"
    text estado "borrador, publicado, en curso, completado, cancelado"
    int version
  }
```

## Infraestructura y recursos (árbol)

```mermaid
erDiagram
  ESPACIO ||--o{ ESPACIO : contiene
  ESPACIO ||--o{ BLOQUEO_CAMA : ""
  ESPACIO ||--o{ LIMPIEZA_CAMA : ""
  ESPACIO ||--o{ EQUIPO : aloja
  TIPO_EQUIPO ||--o{ EQUIPO : ""
  ESPACIO {
    uuid id PK
    uuid padre_id FK "nulo solo en la raíz"
    text tipo "hospital, planta, area, habitacion, cama, consultorio, cubiculo, bodega, bahia"
    text codigo UK "VIP-301, HAB-201, HAB-201-A, C-101"
    text categoria "vip, semiprivada (solo habitación)"
    int capacidad "camas por habitación: 1 VIP, 2 semiprivada"
    bool activo
  }
  LIMPIEZA_CAMA {
    uuid cama_id FK
    uuid limpiada_por
    uuid verificada_por "distinto de limpiada_por"
    jsonb lista
  }
```

La semilla crea: Hospital > Planta 1 (recepción, sala de espera, C-101 a C-104, Emergencia con E-01 a E-03, Laboratorio, bahía de ambulancia, bodega) > Planta 2 (HAB-201 a HAB-206, cada una con camas A y B: 12 camas) > Planta 3 (VIP-301 a VIP-305, una cama cada una). La capacidad la impone un disparador: una habitación no puede tener más camas activas que su `capacidad`.

Consulta recursiva típica (disponibilidad por planta):

```sql
with recursive arbol as (
  select id, padre_id, tipo, codigo, id as planta_id
  from infra.espacio where tipo = 'planta'
  union all
  select e.id, e.padre_id, e.tipo, e.codigo, a.planta_id
  from infra.espacio e join arbol a on e.padre_id = a.id
)
select planta_id,
       count(*) filter (where tipo = 'cama') as camas,
       count(*) filter (where tipo = 'cama' and id not in (select cama_id from hospitalizacion.v_ocupacion_activa)) as libres
from arbol group by planta_id;
```

## Atención: fila, citas, consulta

```mermaid
erDiagram
  TICKET_FILA }o--|| CONTADOR_FILA : numera
  CITA ||--o| CONSULTA : origina
  TICKET_FILA ||--o| CONSULTA : origina
  CONSULTA ||--o{ SIGNOS_VITALES : ""
  CONSULTA ||--o{ DIAGNOSTICO : ""
  CONSULTA ||--o{ RECETA : ""
  RECETA ||--o{ RECETA_ITEM : ""
  CONSULTA ||--o{ RELACION_ATENCION : crea
  CONTADOR_FILA {
    text servicio PK
    date fecha PK
    int ultimo "bloqueo de fila al emitir"
  }
  TICKET_FILA {
    uuid id PK
    text servicio
    date fecha
    int numero "UNIQUE servicio, fecha, numero"
    uuid paciente_id "opcional"
    text estado "en espera, llamado, en atención, atendido, no se presentó"
    uuid consultorio_id
  }
  CITA {
    uuid id PK
    uuid paciente_id
    uuid medico_id
    tstzrange horario "EXCLUDE por médico"
    text estado "solicitada, confirmada, atendida, cancelada, no asistió"
  }
  CONSULTA {
    uuid id PK
    uuid paciente_id
    uuid medico_id
    text motivo
    text examen_fisico
    text plan
    text estado "abierta, firmada, corregida"
    timestamptz firmada_en
  }
  RELACION_ATENCION {
    uuid paciente_id
    uuid profesional_id
    text origen "consulta, admisión, servicio de ambulancia"
    tstzrange vigencia
  }
```

## Laboratorio (catálogo en árbol)

```mermaid
erDiagram
  EXAMEN ||--o{ EXAMEN_COMPONENTE : "panel contiene"
  EXAMEN ||--o{ RANGO_REFERENCIA : ""
  ORDEN_LAB ||--o{ ORDEN_ITEM : ""
  ORDEN_ITEM ||--o| RESULTADO : ""
  EXAMEN {
    uuid id PK
    text codigo UK
    text nombre
    bool es_panel
    text unidad
  }
  EXAMEN_COMPONENTE {
    uuid panel_id FK
    uuid componente_id FK "sin ciclos (CTE con ruta)"
  }
  RANGO_REFERENCIA {
    uuid examen_id
    text sexo
    int4range edad_anios
    numeric minimo
    numeric maximo
    numeric critico_bajo
    numeric critico_alto
    daterange vigencia
  }
  ORDEN_LAB {
    uuid id PK
    uuid consulta_id
    uuid paciente_id
    uuid medico_id
    text prioridad "rutina, urgente"
    text estado "pendiente, en_proceso, completado, cancelado"
    timestamptz revisada_en "D-040"
    uuid revisada_por
  }
  RESULTADO {
    uuid orden_item_id
    numeric valor
    text texto
    text marca "normal, alto, bajo, critico"
    uuid capturado_por
  }
```

## Hospitalización

```mermaid
erDiagram
  ADMISION ||--o{ OCUPACION_CAMA : ""
  OCUPACION_CAMA ||--o| TRASLADO : ""
  ADMISION ||--o| ALTA : ""
  ADMISION ||--o{ NOTA_ENFERMERIA : ""
  ADMISION {
    uuid id PK
    uuid paciente_id
    text origen "consulta, emergencia, ambulancia, programada"
    uuid origen_id
    text categoria_pedida "vip, semiprivada"
    bool aislamiento
    uuid medico_tratante_id
    text estado "pendiente de cama, hospitalizado, alta firmada, egresado"
    int version
  }
  OCUPACION_CAMA {
    uuid id PK
    uuid admision_id
    uuid cama_id
    tstzrange periodo "EXCLUDE cama con periodo"
    text motivo_fin "traslado, egreso"
  }
  ALTA {
    uuid admision_id
    text tipo "médica, voluntaria, traslado, defunción"
    uuid firmada_por
    jsonb pendientes "cada uno con responsable"
  }
```

## Ambulancia

```mermaid
erDiagram
  UNIDAD ||--o{ CAMBIO_ESTADO_UNIDAD : ""
  UNIDAD ||--o{ SERVICIO : ""
  SOLICITUD_AMBULANCIA ||--o| SERVICIO : origina
  SERVICIO ||--o{ HITO : ""
  SERVICIO ||--o| REPORTE_PREHOSPITAL : ""
  SERVICIO ||--o{ UBICACION : ""
  SERVICIO ||--o{ TRIPULACION : ""
  UNIDAD {
    uuid id PK
    text placa
    text estado "disponible, en_servicio, en_mantenimiento"
    int version
  }
  SOLICITUD_AMBULANCIA {
    uuid id PK
    text canal "app paciente, teléfono"
    uuid paciente_id
    text direccion
    point ubicacion
    text motivo
    text estado "por confirmar, confirmada, descartada, cancelada"
  }
  SERVICIO {
    uuid id PK
    uuid unidad_id "UNIQUE parcial: un servicio activo por unidad"
    text tipo "emergencia domicilio, traslado interhospitalario"
    text prioridad
    text estado_final "completado, cancelado, sin traslado, rechaza traslado"
    timestamptz despachado_en
    timestamptz finalizado_en
  }
  HITO {
    uuid servicio_id
    text tipo "salida, en escena, trasladando, en hospital, finalizado"
    timestamptz ocurrido_en
    text clave_idempotencia
  }
```

## Inventario y avisos

```mermaid
erDiagram
  ARTICULO ||--o{ LOTE : ""
  LOTE ||--o{ EXISTENCIA : ""
  LOTE ||--o{ MOVIMIENTO : ""
  ARTICULO {
    uuid id PK
    text codigo UK
    text nombre
    text tipo "insumo, reactivo, equipo menor"
    numeric minimo
  }
  EXISTENCIA {
    uuid lote_id
    uuid bodega_id "espacio tipo bodega"
    numeric cantidad "CHECK mayor o igual a 0"
  }
  MOVIMIENTO {
    uuid id PK
    text tipo "entrada, salida, ajuste, traslado, consumo"
    numeric cantidad
    text motivo
    uuid paciente_id "opcional en consumo"
  }
  AVISO {
    uuid id PK
    text titulo
    text cuerpo
    tstzrange vigencia
    uuid publicado_por
  }
```

## Invariantes garantizadas por la base de datos

| Invariante | Mecanismo |
|---|---|
| Una cama, un paciente a la vez | `EXCLUDE USING gist (cama_id with =, periodo with &&)` en `ocupacion_cama` |
| Habitación no supera su capacidad | Disparador sobre `espacio` (camas activas por habitación menores o iguales a capacidad) |
| Una persona no tiene turnos traslapados | `EXCLUDE USING gist (persona_id with =, periodo with &&)` en `turno` donde estado no es cancelado |
| Un médico no tiene dos citas a la vez | `EXCLUDE` sobre `(medico_id, horario)` en citas activas |
| Un servicio activo por ambulancia | Índice único parcial sobre `servicio(unidad_id)` donde `finalizado_en is null` |
| Número de fila único y sin huecos | `UNIQUE (servicio, fecha, numero)` y contador con `FOR UPDATE` |
| Existencia no negativa | `CHECK (cantidad >= 0)` y movimiento en la misma transacción |
| DUI único entre identificadores vigentes, incluso de pacientes inactivos | Índice único parcial en `identificador` |
| Auditoría inmutable | Rol de la API solo con `INSERT` y `SELECT`; hash encadenado |
| Quien verifica la limpieza no es quien limpió | `CHECK (verificada_por <> limpiada_por)` |
| Nadie se asigna roles ni aprueba su propio acceso | `CHECK` sobre `asignado_por` y `aprobado_por` |
