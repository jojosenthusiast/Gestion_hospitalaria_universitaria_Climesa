# Base investigativa

Todo lo investigado para CLIMESA y para el proyecto del curso, en un solo lugar y desempacado. Nada se resume aquí con más autoridad que la fuente original: este índice dice qué hay, de dónde viene y qué módulo lo usa.

## Capas, de la más antigua a la más nueva

| Carpeta | Qué es | Fecha | Estado |
|---|---|---|---|
| `base-v1-v9/` | Paquete de investigación V1 a V9 entregado por el equipo: hallazgos, 316 criterios de aceptación (AC3xx a AC8xx), 104 tareas candidatas, 206 registros de fuentes (198 URL distintas), circuitos transversales, evaluación continuar o reconstruir. `historial/v1` a `v8` conserva cada versión. | hasta 12-oct-2026 | Cerrado como base; criterios en `NO_EJECUTADO` hasta que una spec los adopte |
| `p01/` | Especificación del núcleo P01: modelo de dominio, ficha institucional INS01 a INS12, criterios de refinamiento T309 y T310. | 12-oct-2026 | Propuesta institucional |
| `dossiers/` | Dossiers R01 a R22 por módulo, con base legal salvadoreña, referencias de sistemas y reglas propuestas. R08, R10 a R13, R18 y R19 no se escribieron (diferidos: su contenido está en V1 a V9). | 12 a 13-oct-2026 | Vigentes |
| `notas/` | Notas de lectura con URL: ley salvadoreña (Norma 1616, LDDPPSS, LPDP, SNIS, firma electrónica, ciberseguridad, VIGEPES, estupefacientes, IVA, DTE, planilla), sistemas de referencia y estándares. | 12-oct-2026 | Fuente primaria de citas |
| `aldara/` | Propuesta Aldara (3-sep-2026), primer proyecto académico del equipo, y su documentación de flujo. | sep-2026 | Antecedente |
| `curso-materiales/` | Material de clase extraído a texto (ASP.NET Core, Identity, roles, EF Core, concurrencia, validaciones). | 2026 | Referencia técnica |
| `../curso/` | Requisitos formales del Proyecto Final DAMA y su registro numerado. | 17-oct-2026 | Requisitos vigentes del curso |
| `../legado/climesa-his-v0/` | Repositorio anterior: constitución v0.1, ADR-0001 y 0002, specs 000 a 006 (en inglés), demo .NET 10 con 37 pruebas. | 12 a 13-oct-2026 | Reemplazado; se reutilizan reglas, SQL y código de plataforma |

## Qué investigación alimenta cada módulo del sistema

| Spec | Módulo | Investigación de base |
|---|---|---|
| 100 | Plataforma API | R20; legado 000 (idempotencia, outbox, auditoría encadenada); notas/02, 03 |
| 101 | Identidad y acceso | R17 (credenciales), R20; legado 000; Norma 1616 Art. 23, 55-56 |
| 102 | Pacientes | R01; legado 001 (buscar antes de crear, DUI, identidad provisional); V3 ID01-ID06, AC301-AC312 |
| 103 | Personal y turnos | R17; Código de Trabajo Art. 161 y siguientes |
| 104 | Infraestructura y recursos | R03 (camas, limpieza); R06 (inventario); legado 002 |
| 105 | Fila del día y citas | R03; Aldara 3.3 |
| 106 | Consulta general | R05 (órdenes, recetas); LDDPPSS Art. 13-18; Norma 1616 Art. 16-17 |
| 107 | Laboratorio | R07 (estados, valores críticos, validación) |
| 108 | Admisión y hospitalización | R03, R04; legado 002 y 006 (forma robusta de "ingresos") |
| 109 | Ambulancia | R04 (prehospital, transferencias) |
| 110 | Privacidad y acceso clínico | R21, legado 005; LPDP Art. 4, 15-25; Norma 1616 Art. 41-43, 55-57 |
| 111 | Inventario de insumos | R06; Código Tributario Art. 142-143 |
| 112 | Información pública y avisos | Requisito DAMA 4; LPDP (minimización) |
| 113 | Métricas | R03, R07, R04 (indicadores) |
| 120 a 122 | Clientes web, Android, iOS | Requisitos DAMA 1, 3; ADR-0006 |
| Base CLIMESA (fuera del curso) | Cuenta del paciente, DTE, contabilidad, documentos clínicos, migración de papel, quejas, farmacia | R02, R05, R14, R15, R16, R21, R22; legado 003, 004, 006 |

## Reglas de uso

1. Una spec cita la fuente con su versión o fecha (artículo, criterio ACxxx, dossier Rxx).
2. Un dato institucional de CLIMESA que no esté confirmado se marca `PENDIENTE-INSnn` y se implementa como configuración con valor seguro, nunca como supuesto escondido.
3. En el curso todo dato es ficticio (Norma 1616 Art. 50). Ningún dato real de CLIMESA entra al repositorio.
