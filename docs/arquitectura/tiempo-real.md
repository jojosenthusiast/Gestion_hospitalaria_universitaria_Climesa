# Tiempo real: catálogo de eventos

Requisitos: REQ-PLT-06 (nada de recargar), REQ-AMB-02 (ambulancia en tiempo real). Decisiones: D-027, D-060. ADR-0005.

> Este catálogo incluye eventos planificados para S3–S5. En S1/S2 están implementados eventos de pacientes, personal, espacios, turnos y usuarios. Solo la web tiene suscripción e invalidación automática en este corte.

## Cómo viaja un cambio

```mermaid
sequenceDiagram
  participant C1 as Cliente que actúa
  participant API as API NestJS / Fastify
  participant DB as PostgreSQL (Supabase)
  participant RT as Supabase Realtime
  participant C2 as Otros clientes suscritos
  C1->>API: POST /admisiones/{id}/cama (clave de idempotencia)
  API->>DB: BEGIN; ocupación + outbox; COMMIT
  DB-->>RT: disparador realtime.send(canal, evento delgado)
  API-->>C1: 200 con el resultado
  RT-->>C2: {tipo: "cama.ocupada", id, version}
  C2->>API: GET /camas/tablero (con su permiso)
  API-->>C2: estado actual filtrado por permiso
```

Reglas: si la transacción falla, no hay evento. El cliente ignora eventos con versión menor o igual a la que ya tiene. Al reconectarse, pide el estado completo en lugar de esperar mensajes perdidos.

Reconexión en la web: no hay sondeo periódico. Al volver un canal a `SUBSCRIBED` tras una caída, o al dispararse el evento `online` del navegador, la web hace una sola consulta de recuperación a `GET /eventos?after=<cursor>`, invalida todas las vistas (suben `version` y cada pantalla vuelve a pedir lo suyo) y refresca el perfil si cambió una cuenta de usuario. Si esa consulta falla, no se reintenta por reloj: queda pendiente hasta la siguiente reconexión. La banda muestra tres estados: en vivo (sin banda), recuperando la conexión y sin conexión.

## Canales

| Canal | Quién puede escuchar |
|---|---|
| `publico` | Cualquiera, incluida la pantalla pública sin sesión |
| `rol:<codigo>` | Usuarios con ese rol |
| `area:<espacio>` | Personal con turno en curso en esa área |
| `usuario:<id>` | Solo ese usuario (incluye al paciente) |
| `paciente:<id>` | Equipo con relación de atención con ese paciente |
| `ambulancia` | REC, JOP, PAR, y MED y ENF de Emergencia |

## Eventos

| Evento | Canales | Quién reacciona | Push con app cerrada | Spec |
|---|---|---|---|---|
| `cama.estado_cambiado` | `rol:REC`, `rol:JOP`, `area:<planta>`, `publico` (solo agregado) | Tablero de camas, árbol, pantalla pública | No | 104, 108 |
| `cama.limpieza_pendiente` | `area:<planta>` | Enfermería de la planta | No | 104 |
| `admision.creada` / `admision.cama_asignada` | `rol:REC`, `rol:JOP`, `paciente:<id>` | Admisiones, médico tratante | No | 108 |
| `turno.publicado` / `turno.cambiado` | `usuario:<persona>`, `rol:JOP`, `publico` (médicos de turno) | Mis turnos, planificador, pantalla pública | Sí, si cambia un turno propio | 103 |
| `fila.emitido` / `fila.llamado` / `fila.estado` | `rol:REC`, `area:<consultorio>`, `usuario:<paciente>`, `publico` (número) | Fila del día, mi turno, pantalla pública | Sí, al ser llamado | 105 |
| `cita.confirmada` / `cita.cancelada` | `usuario:<paciente>`, `usuario:<medico>`, `rol:REC` | Mis citas, agenda | Sí | 105 |
| `consulta.firmada` | `paciente:<id>`, `usuario:<paciente>` | Historial | No | 106 |
| `lab.orden_creada` | `rol:LAB` | Cola de laboratorio | No | 107 |
| `lab.estado_cambiado` | `rol:LAB`, `usuario:<medico>`, `usuario:<paciente>` | Cola, mis exámenes (solo estado) | No | 107 |
| `lab.valor_critico` | `usuario:<medico>`, `area:<area del paciente>` | Resultados por revisar | Sí, al médico | 107 |
| `lab.revisado` | `usuario:<paciente>` | Mis exámenes | Sí, "tienes un resultado revisado" | 107 |
| `ambulancia.estado_cambiado` | `ambulancia`, `publico` no | Centro de despacho, app del paramédico | Sí, al paramédico de turno al despachar | 109 |
| `ambulancia.solicitud_creada` | `ambulancia` | Despacho (con sonido) | Sí, a REC y JOP de turno | 109 |
| `ambulancia.hito` | `ambulancia`, `usuario:<paciente solicitante>` | Despacho, seguimiento del paciente | Sí, al paciente: "la ambulancia va en camino" | 109 |
| `ambulancia.prehospital` | `ambulancia`, `area:emergencia` | Recepción de ambulancia, médico de emergencia | Sí, a emergencia | 109 |
| `ambulancia.ubicacion` | `ambulancia` | Mapa del despacho | No (alta frecuencia: cada 10 s, se descarta lo viejo) | 109 |
| `vinculacion.solicitada` / `vinculacion.resuelta` | `rol:REC`, `usuario:<paciente>` | Bandeja de recepción, app del paciente | Sí, al paciente | 101 |
| `acceso.solicitado` / `acceso.resuelto` | `rol:DPD`, `usuario:<solicitante>` | Bandeja del delegado | Sí | 110 |
| `inventario.bajo_minimo` | `rol:JOP`, `rol:LAB` (reactivos) | Inventario, tablero | No | 111 |
| `aviso.publicado` | `publico` | Pantalla pública, app del paciente | No | 112 |
| `metricas.recalculadas` | `rol:ADM`, `rol:JOP` | Tablero | No | 113 |
