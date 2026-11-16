# Manual del Asistente (AST)

**Plataforma:** app Android. La web muestra "Tu rol no usa esta aplicación".
**Qué hace:** apoya la consulta: prepara al paciente, toma signos vitales, llama y mueve la fila del consultorio.

Antes de leer esta página, revisa [lo que vale para todos los roles](README.md#lo-que-vale-para-todos-los-roles).

## Secciones

AST y ENF comparten un catálogo de estación de cuidado; cada cuenta ve solo las secciones que permiten sus permisos. Para AST: Inicio, Signos vitales, Mi consultorio, Mis turnos, Hospital y Perfil.

## Mi consultorio

- **Llamar siguiente** → **Llamar**: llama al primer número en espera. El paciente lo ve en su app.
- En cada número, según lo que permita el servidor: **Llamar** o **Llamar de nuevo**, **Atender**, **Completar** y **No se presentó**.
- **No se presentó** solo se permite después de los llamados exigidos (3 por omisión). Antes, la app explica: "Todavía no se completan los llamados necesarios para marcar la ausencia."

## Signos vitales

- Elige al paciente (o **Cambiar paciente**), registra los signos y pulsa **Guardar signos**.
- Ves los datos del paciente de tu área de turno, no su historial clínico.

## Mis turnos

Tus turnos publicados. **Marcar mi entrada** aparece cuando el turno lo permite. Si no la marcas a tiempo, Jefatura recibe una alerta.

## Inicio y Hospital

- **Inicio** muestra "Acciones rápidas" y los avisos internos.
- **Hospital** muestra la información pública: ocupación, médicos de turno y avisos.
