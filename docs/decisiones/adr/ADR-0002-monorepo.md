# ADR-0002. Repositorio único y estructura

**Estado:** Aceptada (17-oct-2026). Requisito REQ-PLT-07.

```
sghu-climesa/
  backend/      API ASP.NET Core (.NET 10), módulos, pruebas
  supabase/     config, migraciones SQL, semillas ficticias, políticas de Realtime
  web/          React + TypeScript + Vite
  android/      Kotlin + Jetpack Compose + Gradle
  ios/          SwiftUI, proyecto Xcode
  specs/        SDD: una carpeta por módulo, ESTADO.md generado
  docs/         constitución, decisiones, arquitectura, diseño, investigación, curso, legado
  tools/        progreso.py (estado y CSV para Jira)
```

Reglas: una rama principal protegida; ramas por tarea `NNN-Tnn-descripcion`; cada PR cita la tarea y el requisito; el README raíz explica instalación, variables de entorno y ejecución de las tres plataformas (requisito del curso).
