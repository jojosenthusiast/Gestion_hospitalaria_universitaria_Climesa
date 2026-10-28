# Gestión del proyecto

| Archivo | Qué es | Cómo se genera |
|---|---|---|
| `backlog.csv` | **Backlog de trabajo.** Una fila por historia y debajo sus subtareas, en el orden del tablero de Jira, con clave de Jira, spec, componente, dependencias, "hecho cuando" y rama sugerida. Es lo que se le da a un agente de IA junto con `AGENTS.md` | `python3 tools/backlog.py` |
| `Backlog-Jira-SGHU.docx` | Plan de sprints, historia pivote, importancia, módulos por sprint, backlog por épica y consideraciones de Jira | `python3 tools/backlog.py && node tools/documento_backlog.js` |
| `jira-claves.json` | Correspondencia entre historias (HU-xxx) y claves de Jira (SCRUM-xx). Se edita a mano si se crea una historia nueva en Jira | a mano |
| `jira-import.csv` | Importación inicial a Jira. **Ya se importó el 24-oct-2026: no volver a importar** o se duplica todo | `python3 tools/backlog.py` |
| `backlog.json` | Insumo del documento Word | `python3 tools/backlog.py` |

Qué hay que hacer y cuándo está hecho sale de `specs/*/tasks.md`. Historias, puntos, importancia, sprint y orden, de `tools/backlog_def.py`. Para mover una historia de sprint: se edita `backlog_def.py` (`H` y `ORDEN`), se corre `python3 tools/backlog.py --sincronizar` y se mueve también en Jira. Nunca el Word ni el CSV a mano.
