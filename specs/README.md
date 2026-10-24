# Especificaciones (SDD)

Cada módulo tiene su carpeta `NNN-nombre/` con tres archivos:

| Archivo | Qué contiene | Quién lo aprueba |
|---|---|---|
| `spec.md` | Qué y por qué: objetivo, alcance, requisitos EARS numerados con nivel y origen, escenarios de aceptación | Responsable del desarrollo principal |
| `plan.md` | Cómo: tablas, endpoints, eventos, pantallas, pruebas, riesgos | Responsable del desarrollo principal |
| `tasks.md` | Tareas atómicas en orden, con semana, requisitos que cubren, dependencia y "Hecho cuando" | Se marcan al terminar, con la verificación |

## Estados de una spec

`Borrador` → `En revisión` → `Aprobada` → `En construcción` → `Implementada` (o `Reemplazada`). Se cambia en la línea `**Estado:**` de `spec.md`. Nada se construye en estado `Borrador`.

## Niveles

- **R**: lo exige el curso. Sin esto no hay nota.
- **E**: extra de alto valor, se construye si R está completo en esa semana.
- **F**: especificado para producción CLIMESA; no se construye en el curso.

## Requisitos

Formato EARS en español: "Cuando…, el sistema debe…", "Mientras…", "Si…, entonces el sistema debe…", "Donde…". ID `FR-NNN-xx` (por ejemplo `FR-108-07`). Cada requisito cita su origen: `REQ-` (curso), `D-` (decisión), `RN-` (regla), `Rxx` (dossier), `ACxxx` (criterio V3 a V8) o artículo de ley.

## Tareas

```
- [ ] T03 · S2 · R · Título de la tarea
  - Cubre: FR-102-01, FR-102-02
  - Depende de: T01
  - Hecho cuando: comando o comprobación observable
```

`[x]` cuando está hecha. Agregar `- Verificado: comando y resultado observado` al marcarla. `python3 tools/progreso.py` recalcula `ESTADO.md`; `python3 tools/backlog.py` genera el backlog y el CSV de Jira en `docs/gestion/`.

## Cronograma

| Semana | Fechas | Objetivo del curso |
|---|---|---|
| S1 | 17 a 23 oct | Planificación y diseño: backend y BD, API, Figma, modelo de datos |
| S2 | 24 a 30 oct | Autenticación por roles, maquetación de las 3 plataformas, habitaciones y turnos, CRUD de pacientes y personal, tablero web |
| **Avance** | **31 oct** | **50% de la nota** |
| S3 | 31 oct a 6 nov | Consulta general, laboratorio, panel de administración básico |
| S4 | 7 a 13 nov | Asignación de habitaciones, ambulancia, permisos de privacidad |
| S5 | 14 a 20 nov | Integración de las 3 plataformas, pruebas de concurrencia, pulido |
| **Final** | **21 nov** | **Defensa en vivo, repositorio y documentación (50%)** |

## Mapa de specs

| Spec | Módulo | Depende de |
|---|---|---|
| [100](./100-plataforma-api/spec.md) | Plataforma de la API | ninguna |
| [101](./101-identidad-acceso/spec.md) | Identidad, cuentas y acceso | 100 |
| [102](./102-pacientes/spec.md) | Pacientes | 100, 101 |
| [103](./103-personal-turnos/spec.md) | Personal de salud y turnos | 100, 101, 104 |
| [104](./104-infraestructura-recursos/spec.md) | Edificio, camas y recursos | 100 |
| [105](./105-fila-citas/spec.md) | Fila del día y citas | 102, 103, 104 |
| [106](./106-consulta-general/spec.md) | Consulta general | 102, 105 |
| [107](./107-laboratorio/spec.md) | Laboratorio | 106 |
| [108](./108-admision-hospitalizacion/spec.md) | Admisión y hospitalización | 102, 104, 106 |
| [109](./109-ambulancia/spec.md) | Ambulancia | 102, 103 |
| [110](./110-privacidad-auditoria/spec.md) | Privacidad y auditoría | 100, 101 |
| [111](./111-inventario/spec.md) | Inventario de insumos | 104 |
| [112](./112-informacion-publica/spec.md) | Información pública y avisos | 103, 104, 105 |
| [113](./113-metricas-tablero/spec.md) | Métricas y tablero | todas las anteriores |
| [114](./114-avisos-alarmas/spec.md) | Avisos y alarmas | 100, 120 a 122 |
| [120](./120-cliente-web/spec.md) | Cliente web | 100, 101 |
| [121](./121-cliente-android/spec.md) | Cliente Android | 100, 101 |
| [122](./122-cliente-ios/spec.md) | Cliente iOS | 100, 101 |
| [130](./130-calidad-concurrencia/spec.md) | Calidad y pruebas de concurrencia | todas |
| [131](./131-documentacion-entrega/spec.md) | Documentación y entrega | todas |

Specs de la base CLIMESA (nivel F, no se construyen en el curso; ver `docs/legado/climesa-his-v0/specs`): cuenta del paciente y cargos (006), DTE (007), registro contable (008), aseguradoras (009), documentos clínicos completos (003), migración de papel (004), retención y solicitudes de datos (005), quejas (010), farmacia y dispensación, contabilidad de la contadora (R22).

Estado y avance: [ESTADO.md](./ESTADO.md) (generado).
