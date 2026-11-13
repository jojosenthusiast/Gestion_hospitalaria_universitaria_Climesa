# Bloque clínico CLIMESA

## Implementado

- Agenda propia de MED y apertura de consulta desde una cita confirmada.
- Borrador y firma clínica con control de versión.
- Registro de signos vitales para AST, ENF, MED y PAR.
- Diagnóstico CIE-10 y marcado de diagnóstico principal para MED.
- Emisión de recetas con uno o varios medicamentos para MED.
- Detalle clínico protegido por permisos y relación de atención.

## API

- GET `/api/v1/consultas/agenda`
- POST `/api/v1/consultas`
- PATCH `/api/v1/consultas/:id`
- POST `/api/v1/consultas/:id/firmar`
- GET `/api/v1/consultas/:id/detalle`
- POST `/api/v1/consultas/:id/signos`
- POST `/api/v1/consultas/:id/diagnosticos`
- POST `/api/v1/consultas/:id/receta`

Este bloque usa las tablas existentes de `atencion`; no agrega una migración nueva. Antes de probar en Render hay que desplegar el último commit de GitHub.
