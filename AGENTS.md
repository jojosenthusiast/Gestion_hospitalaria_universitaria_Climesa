# Instrucciones para agentes de IA

Este archivo es para cualquier agente (Claude Code, Cursor, Codex, Copilot, Gemini u otro). Léelo completo antes de tocar el repositorio. Después lee el `AGENTS.md` de la carpeta donde vas a trabajar (`api/`, `web/`, `android/` o `ios/`).

## 1. Qué es esto

Sistema de Gestión Hospitalaria Universitaria (CLIMESA): web administrativa en React, app Android en Kotlin, app iOS en SwiftUI, sobre una API Node.js 22 con NestJS (ADR-024) y PostgreSQL en Supabase. Los cambios se empujan en tiempo real; ningún cliente recarga ni consulta cada cierto tiempo. Es un proyecto universitario con entrega el 21 de noviembre de 2026. Todos los datos son ficticios.

## 2. Cómo recibir una tarea

Te van a dar una clave de Jira (`SCRUM-44`) o de historia (`HU-102-1`), y a veces una subtarea concreta (`102-T05-WEB`).

1. Busca la fila en `docs/gestion/backlog.csv`. La fila `Historia` tiene los criterios de aceptación y la carpeta de la spec; las filas `Subtarea` debajo tienen qué hacer, el componente, las dependencias y la condición de "hecho cuando".
2. Lee, en este orden y nada más:
   1. `docs/constitucion.md` (reglas que no se negocian; es corta).
   2. `specs/<carpeta>/spec.md`: los requisitos `FR-...` que tu subtarea cubre (columna `requisitos`) y sus escenarios de aceptación.
   3. `specs/<carpeta>/plan.md`: cómo se construye.
   4. `specs/<carpeta>/tasks.md`: tu tarea (`Tnn`), de qué depende y cuándo está hecha.
   5. Solo lo que la spec o el plan citen: decisiones `D-xxx` en `docs/decisiones/registro-decisiones.md`, reglas `RN-xx` en `docs/arquitectura/reglas-negocio.md`, etc.
3. Revisa la columna `depende_de`. Si una dependencia no está hecha (`- [ ]` en su `tasks.md`), detente y dilo. No la implementes por tu cuenta salvo que te lo pidan.

## 3. Dónde está cada cosa

| Necesitas | Archivo |
|---|---|
| Rutas, métodos y permiso de cada endpoint | `docs/arquitectura/datos/endpoints.csv` |
| Qué permiso tiene cada rol | `docs/arquitectura/datos/permisos.csv` (vista legible: `docs/arquitectura/roles-y-permisos.md`) |
| Qué campo ve cada rol (privacidad) | `docs/arquitectura/privacidad.md` |
| Tablas y columnas | `supabase/migrations/*.sql` (verdad) y `docs/arquitectura/modelo-datos.md` (diagrama) |
| Eventos de tiempo real y canales | `docs/arquitectura/tiempo-real.md` |
| Reglas de negocio | `docs/arquitectura/reglas-negocio.md` |
| Pantallas: qué muestra, acciones, roles | `docs/arquitectura/datos/pantallas.csv` (códigos W, A, I) |
| Cómo se ve cada pantalla | `docs/diseno/claude-design/*.html` (abre el archivo del rol y plataforma; cada pantalla lleva su código) |
| Colores, tipografía, estados de pantalla | `docs/diseno/claude-design/01-sistema-claro.html`, `02-sistema-oscuro.html`, `04-estados-y-avisos.html` |
| Contrato de la API para clientes | `contrato/openapi.json` (lo exporta la API) |
| Por qué se decidió algo | `docs/decisiones/registro-decisiones.md` y `docs/decisiones/adr/` |

`docs/legado/` es código de un sistema anterior. Solo se usa en tareas cuyo título empieza con "Portar". No lo tomes como referencia de estilo ni de estructura del sistema actual.

## 4. Reglas que no se rompen

1. **Idioma.** Base de datos, rutas y JSON de la API, textos de interfaz, specs y documentación en español. Identificadores del código (clases, funciones, variables) en inglés. DUI, expediente y DTE se quedan con su nombre.
2. **Datos ficticios siempre.** Nunca nombres, DUI ni teléfonos reales, ni en pruebas ni en semillas.
3. **Secretos fuera del repo.** La llave `service_role` de Supabase y la contraseña del rol `sghu_api` solo existen en el `.env` de la API (`api/.env`) en el servidor. Los clientes solo usan `SUPABASE_URL`, `SUPABASE_ANON_KEY` y `API_URL`. Nunca subas `.env`, `local.properties` ni `Config.xcconfig`.
4. **La API es la única que escribe datos de negocio.** Los clientes nunca consultan tablas de Supabase directo: Supabase solo les da inicio de sesión y Realtime.
5. **Las invariantes viven en la base.** Cama sin doble ocupación, ambulancia única, turnos sin traslape, número de fila sin repetir: lo garantiza PostgreSQL con restricciones. Validar en el cliente es comodidad, no garantía.
6. **Nada clínico se borra.** Se corrige con versión nueva, autor y motivo.
7. **Toda escritura lleva clave de idempotencia** (cabecera `Idempotency-Key`), y toda lectura de datos de paciente queda auditada.
8. **Permisos por nombre de permiso, no por rol.** En el código se pregunta `camas.asignar`, nunca `if rol == "REC"`.
9. **Tiempo real, no recarga.** Al llegar un evento, el cliente invalida y vuelve a pedir lo que le toca. Prohibido el sondeo periódico.
10. **Migraciones aplicadas no se editan.** Un cambio de base es un archivo nuevo en `supabase/migrations/` con fecha posterior.
11. **No inventes.** Si un endpoint, campo, permiso o pantalla no está en los archivos de la sección 3, no lo crees. Detente y pregunta, o agrégalo a `docs/preguntas-abiertas.md` y avisa.

## 5. Qué no tocar

- `docs/constitucion.md` y `specs/*/spec.md`: solo cambian con una decisión registrada. Si la tarea parece contradecir la spec, avisa; no la cambies.
- Archivos generados (se regeneran con `tools/`, nunca se editan a mano): `specs/ESTADO.md`, `docs/arquitectura/roles-y-permisos.md`, `docs/diseno/inventario-pantallas.*`, `supabase/migrations/20261017000210_acceso_semilla.sql`, todo `docs/gestion/` excepto `jira-claves.json`.
- Carpetas de otras plataformas. Una tarea de Android no toca `web/` ni `api/`. Si necesitas algo de la API que no existe, dilo.

## 6. Ramas, commits y PR

- Rama: la columna `rama_sugerida` del CSV, por ejemplo `SCRUM-44-hu-102-1`. Una rama por historia, o por subtarea si la historia es grande.
- Commits: `SCRUM-44: qué cambia, en presente` (por ejemplo `SCRUM-44: agrega búsqueda fonética de pacientes`).
- PR hacia `main`, llenando la plantilla de `.github/pull_request_template.md`. Nunca push directo a `main`.
- Un PR toca una sola plataforma, salvo que la subtarea diga lo contrario.

## 7. Cuándo está hecho

1. Se cumple el "hecho cuando" de la subtarea y lo comprobaste ejecutando algo, no leyendo el código.
2. Las pruebas de la plataforma pasan (cada `AGENTS.md` de plataforma dice el comando).
3. En `specs/<carpeta>/tasks.md` marcas la tarea con `- [x]` y agregas debajo una línea `  - Verificado: <comando que corriste y resultado que viste>`. Una tarea con componentes (`-WEB`, `-AND`) se marca cuando todas sus partes están hechas.
4. Corres:
   ```bash
   python3 tools/progreso.py && python3 tools/progreso.py --verificar
   ```
   y ambos terminan sin `ERROR`.
5. Tu reporte final dice qué archivos cambiaste, qué comandos corriste y qué resultado viste. Si algo no lo pudiste probar, dilo. Nunca reportes como hecho algo que no ejecutaste.

## 8. Si te atoras

- Falta información en la spec: no la inventes. Escribe la pregunta concreta en tu respuesta y en `docs/preguntas-abiertas.md`.
- Una dependencia no está hecha: detente y dilo.
- Un comando falla dos veces con el mismo error: no sigas probando variantes a ciegas. Reporta el error exacto.

## 9. Plantilla para encargar una tarea (para quien delega)

```
Lee AGENTS.md y <plataforma>/AGENTS.md.
Tarea: <SCRUM-xx> / subtarea <clave, por ejemplo 102-T05-WEB>.
Trabaja solo en <carpeta>.
Al terminar: marca la tarea en tasks.md con su línea Verificado, corre tools/progreso.py --verificar
y dame la lista de archivos cambiados, los comandos que corriste y su resultado.
```
