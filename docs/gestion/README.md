# Gestión del proyecto

| Archivo | Qué es | Cómo se genera |
|---|---|---|
| `Backlog-Jira-SGHU.docx` | Documento con equipo, reglas del tablero, tabla pivote de carga, lo del avance y el backlog completo por épica e historia | `python3 tools/backlog.py && node tools/documento_backlog.js` |
| `jira-import.csv` | Épicas, historias y subtareas enlazadas para el importador CSV de Jira | `python3 tools/backlog.py` |
| `backlog.csv` | Tabla plana de subtareas para revisar o filtrar | `python3 tools/backlog.py` |
| `backlog.json` | Insumo del documento Word | `python3 tools/backlog.py` |

Qué hay que hacer sale de `specs/*/tasks.md`. Quién, cuántos puntos y en qué historia, de `tools/backlog_def.py`. Para cambiar una asignación se edita ese archivo y se regenera; nunca el Word a mano.
