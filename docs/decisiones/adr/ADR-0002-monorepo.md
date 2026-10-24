# ADR-0002. Repositorio único y estructura

**Estado:** Aceptada (17-oct-2026). Requisito REQ-PLT-07.

```
sghu-climesa/
  api/          API Node.js 22 + NestJS (ADR-024), módulos, pruebas
  supabase/     config, migraciones SQL, semillas ficticias, políticas de Realtime
  web/          React + TypeScript + Vite
  android/      Kotlin + Jetpack Compose + Gradle
  ios/          SwiftUI, proyecto Xcode
  specs/        SDD: una carpeta por módulo, ESTADO.md generado
  contrato/     openapi.json generado por la API
  docs/         constitución, decisiones, arquitectura, diseño, curso, gestión, legado
  tools/        generadores y verificadores del SDD y del backlog
  .github/      workflows por plataforma con filtro por ruta, plantilla de PR
```

Reglas: una rama principal protegida; ramas con la clave de Jira (`SCRUM-44-hu-102-1`, columna `rama_sugerida` de `docs/gestion/backlog.csv`; actualizado por D-081); cada PR cita la tarea y el requisito; el README raíz explica instalación, variables de entorno y ejecución de las tres plataformas (requisito del curso).

**Actualización (24-oct-2026, D-081):** la investigación de base salió del repositorio; cada carpeta de plataforma tiene su `AGENTS.md`; el contrato OpenAPI se versiona en `contrato/`.

**Actualización (ADR-024):** la carpeta de la API se llama `api/` (antes `backend/`) y el stack es Node.js + NestJS en lugar de ASP.NET Core.
