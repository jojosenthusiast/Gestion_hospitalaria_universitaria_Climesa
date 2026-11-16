# Documento de Arquitectura · CLIMESA (SGHU)

Sistema de Gestión Hospitalaria Universitaria · Proyecto final de Desarrollo de Aplicaciones Móviles Avanzadas (DAMA) · Entrega y defensa: 21 de noviembre de 2026.

> Todos los datos del sistema, de las pruebas y de este documento son ficticios.
>
> Este documento describe el código de `main` en el commit `1a124e7` (15-nov-2026), con los PR #105 a #119 fusionados (fases 0 y 1 de la auditoría final). Cada afirmación remite a un archivo del repositorio y se verificó contra los controladores (`api/src/**`), las migraciones (`supabase/migrations/`), el contrato (`contrato/openapi.json`), el menú web (`web/src/features/shell.tsx`), las secciones Android (`domain/AuthModels.kt`) y las pestañas iOS (`ios/Core/Access.swift`). Lo que no existe se marca **parcial** o **pendiente**; lo que existe pero no se probó en un dispositivo real se dice.

## Contenido

1. Contexto y alcance
2. Diseño UX/UI (Figma y sistema de diseño)
3. Arquitectura de software
4. Módulos y estado por módulo
5. Clientes (web, Android, iOS)
6. Modelo de datos
7. Seguridad y control de acceso por rol (RBAC)
8. Política de privacidad de datos
9. Tiempo real
10. Idempotencia y concurrencia optimista
11. Despliegue
12. Integración continua
13. Calidad y pruebas
14. Decisiones de arquitectura
15. Limitaciones conocidas
- Anexo A. Endpoints y permiso requerido
- Anexo B. Matriz completa de permisos por rol

---

## 1. Contexto y alcance

El curso pide un ecosistema multiplataforma para un hospital universitario: app iOS nativa (médicos y pacientes), app Android nativa (recepción, asistencia, enfermería y médicos) y un panel web administrativo (administración y jefatura de operaciones). Las reglas de negocio del curso son:

| Regla del curso | Cómo se modela en CLIMESA |
|---|---|
| 3.ª planta: 5 habitaciones VIP individuales (VIP-301 a VIP-305) | `supabase/seed.sql`: área `P3-VIP`, habitaciones `VIP-301`…`VIP-305`, categoría `vip`, capacidad 1 |
| 2.ª planta: 6 habitaciones semiprivadas de 2 camas (HAB-201 a HAB-206), 12 camas | `supabase/seed.sql`: área `P2-HOS`, habitaciones `HAB-201`…`HAB-206`, categoría `semiprivada`, capacidad 2 |
| Sin sobrecupo ni doble asignación de camas | Disparador de capacidad en `infra.espacio` y `EXCLUDE USING gist` sobre la ocupación de cama (sección 6.3) |
| Turnos del personal | Esquema `personal` (`persona`, `inscripcion`, `turno`) con exclusión de traslapes |
| Consulta general y laboratorio con estados Pendiente, En Proceso, Completado | `laboratorio.orden.estado` admite `pendiente`, `en_proceso`, `completado` y `cancelado` |
| Información pública frente a privada | Política de la sección 8; `GET /publico/*` sin sesión y la pantalla pública de la web (`/publico`, `web/src/features/public-screen.tsx`) |
| Una sola ambulancia con estados Disponible, En Servicio, En Mantenimiento | `ambulancia.unidad.estado` con esos tres valores; la semilla crea una única unidad. Solicitud, despacho, hitos, reporte prehospital y bitácora en `/ambulancia/*` (sección 4) |

Roles del sistema (10): ADM (administración técnica), JOP (jefatura de operaciones), REC (recepción), AST (asistencia), ENF (enfermería), MED (médico), LAB (laboratorio), PAR (paramédico), DPD (delegado de protección de datos) y PAC (paciente). El catálogo está en `docs/arquitectura/datos/permisos.csv` (76 permisos). Plataformas por rol (`docs/arquitectura/datos/roles.csv`): ADM, JOP, LAB y DPD, solo web; REC, web y Android; AST, ENF y PAR, Android; MED y PAC, Android e iOS. La API no bloquea por plataforma; cada cliente muestra "Tu rol no usa esta aplicación" a los roles que no le corresponden (D-08).

## 2. Diseño UX/UI (Figma y sistema de diseño)

| Entregable | Ubicación | Estado |
|---|---|---|
| Archivo de Figma | https://www.figma.com/design/bHJjbgi64I0p0Bnw8nho8e | Versión anterior. **No está sincronizado** con las pantallas actuales y no refleja las fases 0 y 1 (MA-OPS-05, pendiente de la dueña del proyecto). La referencia vigente es el sistema de diseño en HTML de la fila siguiente |
| Sistema de diseño (paleta clara y oscura, tipografía, estados de componentes) | `docs/diseno/claude-design/01-sistema-claro.html`, `02-sistema-oscuro.html`, `04-estados-y-avisos.html` | En HTML, versionado en el repositorio |
| Prototipos por rol y plataforma | `docs/diseno/claude-design/05-…` a `19-…` (web por rol y Android por rol) | En HTML |
| Inventario de pantallas (códigos W, A, I) | `docs/diseno/inventario-pantallas.md`, `docs/arquitectura/datos/pantallas.csv` | Generado por `tools/` |

Decisiones de diseño registradas: D-068 (tipografía Atkinson Hyperlegible Next y Mono, íconos Material Symbols Rounded), D-070 (azul CLIMESA `#0043B2`; cada estado con tono, forma, ícono y palabra), D-071 (avisos en tres niveles), D-072 (atajos de teclado que se pueden apagar, WCAG 2.1.4) y D-073 (ocho estados por pantalla). Fuente: `docs/decisiones/registro-decisiones.md`.

La web incluye una galería de revisión sin credenciales (`/work-preview.html` y `/design-preview.html` en el servidor de desarrollo) con los mismos componentes del producto y datos ficticios en memoria.

## 3. Arquitectura de software

### 3.1 Vista general

CLIMESA es un **monolito modular** (ADR-0001): una sola API propia sobre Supabase. Supabase aporta PostgreSQL, Auth (inicio de sesión) y Realtime (difusión de eventos). Los clientes **nunca** consultan tablas de Supabase directamente: solo usan Supabase para iniciar sesión y escuchar eventos. Toda escritura y toda lectura de datos de negocio pasa por la API (`AGENTS.md`, regla 4).

```mermaid
flowchart TB
  subgraph Clientes
    W["Web administrativa<br/>React 19 + Vite"]
    K["App Android<br/>Kotlin + Compose, MVVM"]
    I["App iOS<br/>SwiftUI, MVVM"]
  end
  subgraph Render
    A["API REST<br/>Node.js 22 + NestJS 11 + Fastify"]
  end
  subgraph Supabase
    AU["Supabase Auth<br/>(JWT)"]
    DB[("PostgreSQL<br/>11 esquemas de dominio, RLS")]
    RT["Supabase Realtime<br/>(Broadcast)"]
  end
  W -- "inicio de sesión" --> AU
  K -- "inicio de sesión" --> AU
  I -- "inicio de sesión" --> AU
  W -- "HTTPS + Bearer JWT" --> A
  K -- "HTTPS + Bearer JWT" --> A
  I -- "HTTPS + Bearer JWT" --> A
  A -- "auth.getUser" --> AU
  A -- "node-postgres, rol sghu_api" --> DB
  DB -- "realtime.send desde el outbox" --> RT
  RT -- "evento delgado" --> W
  RT -- "evento delgado" --> K
  RT -- "evento delgado" --> I
```

### 3.2 Flujo de una petición

1. El cliente obtiene un JWT de Supabase Auth.
2. La API valida el token con `auth.getUser` (`api/src/auth/supabase-auth.guard.ts`) y carga desde la base la cuenta, sus roles y sus permisos vigentes. Ningún permiso se toma de `user_metadata`.
3. El guard de permisos (`api/src/auth/permission.guard.ts`) compara el permiso que exige el endpoint (`@RequirePermission(...)`) con los permisos de la cuenta.
4. El servicio de aplicación ejecuta la operación dentro de una transacción con `SET LOCAL ROLE sghu_api` (`api/src/platform/database.service.ts`).
5. Las escrituras pasan por `CommandService`: idempotencia, cambio de datos, auditoría encadenada y evento en el outbox, todo en la misma transacción (sección 10).
6. Los errores se devuelven como `application/problem+json` con un código y un identificador de solicitud.

### 3.3 Estructura interna de la API

```mermaid
flowchart LR
  G["Guards<br/>identidad + permiso"] --> C["Controladores por módulo"]
  C --> S["Servicios de aplicación"]
  S --> X["CommandService<br/>transacción"]
  X --> D["Tablas del dominio"]
  X --> U["plataforma.auditoria<br/>hash encadenado"]
  X --> O["plataforma.outbox"]
  X --> K["plataforma.idempotencia"]
  S --> P["PolicyRegistry y Clock"]
```

Carpetas de `api/src`: `auth`, `users`, `accounts` (vinculación de cuentas), `patients`, `operations` (personal, turnos, espacios, camas, inicio y eventos), `attention` (citas, fila, consulta, expediente e historial clínico), `laboratory`, `hospitalization`, `inventory`, `ambulance`, `privacy` (auditoría, "quién vio mi expediente"), `public` (información pública y avisos), `metrics`, `health`, `config` (cabeceras de seguridad y límite de tasa), `platform` y `supabase`. La arquitectura de módulos se comprueba con `api/tests/architecture.spec.ts`.

## 4. Módulos y estado por módulo

Estados: **Implementado** (API y al menos un cliente), **Parcial** (existe una parte; se indica cuál falta) y **Pendiente** (no existe). Todas las secciones Android tienen `ready=true` (`domain/AuthModels.kt`): ninguna muestra "Próxima entrega". En las acciones por fila (citas, fila, admisiones, órdenes, servicios de ambulancia, invitaciones) la API envía `allowedActions` y los clientes muestran solo esos botones.

| Módulo | API | Web | Android | iOS | Estado |
|---|---|---|---|---|---|
| Identidad, sesión y perfil | `/auth/me`, `/inicio`, `/eventos` | Ingreso, recuperar y restablecer contraseña, aceptar invitación, aterrizajes de correo; `/registro` solo orienta a la app (BL-06, D-04); aviso de arranque en frío (`web/src/lib/cold-start.ts`) | Ingreso, registro de paciente, reenvío de confirmación, recuperación; un 401 renueva la sesión una vez; aviso de arranque en frío (`data/ColdStart.kt`) | Ingreso, registro, recuperación, aviso de arranque en frío | Implementado |
| Usuarios, invitaciones y roles | `/usuarios/*`: invitar, `/invitacion/reenvio`, `/invitacion/cancelacion` (con motivo), roles, estado | Personal (ADM gestiona; JOP y DPD consultan) | — | — | Implementado. PAC no se invita (`rol_no_invitable`); solo el administrador principal gestiona a otros ADM; desactivar revisa el trabajo abierto (`20261120004000_cuentas_invitaciones.sql`) |
| Pacientes (búsqueda, registro, provisionales, duplicados, ficha filtrada) | `/pacientes/*`, `/me/paciente` | Pacientes (REC, JOP, LAB) | Pacientes (REC), Paciente sin identidad (PAR) | Pacientes (MED), Mis datos (PAC) | Implementado |
| Personal e inscripciones | `/personal/*` | Personal | — | — | Implementado |
| Turnos del personal | `/turnos/*`, `/turnos/especialistas`, `/turnos/cobertura` | Turnos (JOP planifica) | Mis turnos | Turnos (MED) | Implementado |
| Asistencia y carga de turnos | `POST /turnos/{id}/asistencia` | Asistencia, suplentes disponibles, carga del turno y motivo de emergencia (JOP) | Mis turnos por día (entrada automática) | Mis turnos por día (entrada automática) | Implementado. Máximo 72 h en 7 días y 6 días seguidos; descanso de 8 h (12 h tras 24 h); solo `ausente` saca de turno (`20261120003000_turnos_asistencia_carga.sql`) |
| Edificio y espacios | `/espacios/*` | Edificio (ADM configura) | — | Información del hospital | Implementado |
| Camas (tablero, bloqueo, limpieza) | `/camas/*` | Camas (JOP bloquea y limpia) | Tablero de camas (REC), Limpieza de camas (ENF) | — | Implementado |
| Citas de 20 minutos | `/citas/*`, `/citas/{id}/reprogramar`, `/citas/reprogramaciones/{id}/aceptar` y `/rechazar`, `/citas/{id}/no-asistio` | Citas (REC) | Citas (REC), Mis citas (PAC) | Citas (PAC); solicitudes de reprogramación en Mi día (MED) | Implementado. Máximo 2 reprogramaciones por cadena y 2 solicitudes pendientes por paciente; el paciente cancela hasta 2 h antes (`20261120002000_citas_fila_fase01.sql`) |
| Fila del día | `/fila/*`, `POST /fila/llamar-siguiente` | Fila del día (REC) | Emitir número (REC), Mi consultorio (AST), Mi turno (PAC), Mi día (MED) | Fila (PAC), Mi día (MED) | Implementado. "No se presentó" solo tras 3 llamados (`fila.llamados_para_ausencia`) |
| Barrido de citas y fila | `AttentionSweepService` cada 60 s y antes de cada lectura, con bloqueo consultivo | — | — | — | Implementado. Vence solicitudes pasadas, marca `no_asistio` y cierra los números de días anteriores; audita como `SISTEMA` |
| Consulta general (borrador, signos, diagnósticos CIE-10, receta, firma) | `/consultas/*`, `GET /consultas/sin-firmar` | — (MED no usa la web) | Mi día, Expediente (MED); Signos vitales (AST, ENF) | Mi día, Consulta (MED) | Implementado. Corrección por addendum: pendiente (D-06) |
| Laboratorio (orden, muestra, resultados, validación, revisión) | `/laboratorio/*`, `/me/laboratorio` | Laboratorio (LAB) | Resultados por revisar (MED), Mis exámenes (PAC) | Resultados (MED), Exámenes (PAC) | Implementado |
| Laboratorio: enmienda, revisión suplente, aviso crítico, catálogo | `POST /laboratorio/ordenes/{id}/enmendar`, `/catalogo/examenes` | Corregir resultado y filtro de críticos (LAB), Catálogo de laboratorio (ADM) | Aviso de valor crítico (MED) | Aviso de valor crítico (MED) | Implementado. La enmienda exige motivo de 10 caracteres o más y devuelve la orden a revisión; tras 2 h sin revisión puede revisar un médico de turno en el área de origen; el aviso crítico nunca llega al paciente (`20261121001000_laboratorio_enmienda_revision.sql`) |
| Hospitalización (admisión, cama, traslado, notas, alta, salida) | `/admisiones/*`, `/ocupaciones/{id}/traslado` | Hospitalización (REC, JOP) | Admisión y cama (REC), Mi planta (ENF), Mis hospitalizados (MED) | Mis hospitalizados (MED) | Implementado |
| Hospitalización: cierre del ciclo | `/admisiones/{id}/cancelar`, `/anular`, `/solicitar-alta`, `/revocar-alta`, `/tratante`, `/salida` | Cancelar admisión, Anular ingreso por error, Solicitar alta al médico tratante, Reasignar médico tratante, Revocar alta, Registrar salida | Cancelar admisión (REC), Firmar y revocar alta (MED), Registrar salida | Firmar y revocar alta (MED) | Implementado. Solo MED firma el alta (D-02); nada se borra: cancelar y anular dejan `cancelada` con autor y motivo (`20261120001000_admision_cierre_ciclo.sql`) |
| Inventario (existencias, movimientos, artículos, alerta de mínimo) | `/inventario/*` | Inventario (JOP; LAB reactivos; ADM consulta y configura, sin movimientos) | Consumo de insumos (ENF) | — | Implementado. ADM recibió `inventario.ver` y se retiraron `recursos.*` (D-091, `20261121003100_recursos_inventario_adm.sql`) |
| Ambulancia (estado, mantenimiento) | `GET /ambulancia`, `POST /ambulancia/mantenimiento` | Ambulancia (JOP) | Unidad (MED) | — | Implementado |
| Ambulancia (solicitud, despacho, hitos, ubicación, reporte prehospital, bitácora) | `/ambulancia/solicitudes`, `/solicitudes/mias`, `/servicios`, `/ubicacion`, `/bitacora` | Ambulancia y Bitácora de ambulancia (JOP, REC; DPD solo bitácora) | Pedir ambulancia (PAC), Despacho (REC), Servicio y Bitácora (PAR) | Pedir ambulancia (PAC) | Implementado |
| Ambulancia: tripulación, estados finales, entrega y cierre administrativo | `availableCrew` y `crew` en el despacho; `activeService.finalStates`; `POST /ambulancia/servicios/{id}/recepcion`; `GET /ambulancia/llegada`; `POST /ambulancia/servicios/{id}/cerrar` | Tripulación elegida por quien despacha; Cierre administrativo (JOP); la entrega se muestra | Tripulación (REC); Terminar sin llegar al hospital (PAR); Llegada o Recepción de ambulancia con Marcar recibido (MED, ENF) | Llegada de ambulancia con Marcar recibido (MED) | Implementado. Paramédico con cuenta y motorista de turno (RN-30); estados finales validados por hitos; recibe quien tiene turno en Emergencia (`P1-EMG`) o relación de atención (`20261121002000_ambulancia_fase1.sql`) |
| Información pública (ocupación, médicos de turno, fila, avisos) | `/publico/*` sin sesión y con límite de tasa | Pantalla `/publico` | Hospital | Información del hospital | Implementado |
| Avisos | `POST /avisos`, `PUT /avisos/{id}`, `POST /avisos/{id}/retirar`, `/me/avisos` | Avisos (JOP): publicar, editar, retirar | Avisos en Inicio | Avisos en Inicio | Implementado. Retirar exige motivo de 10 caracteres o más; un aviso retirado no cambia más (`20261121003000_aviso_editar_retirar.sql`) |
| Métricas | `/metricas/tablero`, `/metricas/{indicador}` | Métricas (ADM, JOP, DPD), con exportación | — | — | Implementado (solo web) |
| Auditoría (búsqueda y verificación de la cadena de hash) | `GET /auditoria`, `POST /auditoria/verificacion` | Auditoría (DPD), con exportación | — | — | Implementado |
| "Quién vio mi expediente" | `GET /me/accesos` | — | Quién vio mi expediente (PAC) | Quién vio mi expediente (PAC) | Implementado |
| Historial clínico completo | `GET /pacientes/{id}/historial` | — | Mi historial (PAC), Expediente (MED) | Mi historial (PAC), Pacientes (MED) | Implementado |
| Vinculación de cuenta PAC con expediente | `POST /cuentas/vinculacion`, `/cuentas/vinculaciones/*` | Vinculaciones (REC) | Vinculaciones (REC), Vincular expediente (PAC) | Vincular expediente (PAC) | Implementado |
| Notificaciones push (FCM, APNs) | No | No | No | No | Pendiente (D-09) |

Fuentes: controladores en `api/src/**/*.controller.ts`, migraciones `20261119002000` a `20261121003200`, menú web en `web/src/features/shell.tsx`, secciones Android en `android/app/src/main/java/sv/edu/catolica/climesa/domain/AuthModels.kt` y pestañas iOS en `ios/Core/Access.swift`.


## 5. Clientes

### 5.1 Web administrativa (`web/`)

- React 19.1, TypeScript 5.7, Vite 6.2; pruebas con Vitest.
- El menú depende solo del permiso (`web/src/features/shell.tsx`): cada módulo declara el permiso que lo abre; nunca se pregunta por el rol.
- Tipos de la API generados desde `contrato/openapi.json` (`web/src/lib/generated/`).
- Tiempo real con Supabase Realtime en `web/src/lib/live.ts` (sección 9).
- Sesión del personal con cierre por inactividad a los 15 minutos (`docs/arquitectura/privacidad.md`, regla 7).
- Rutas sin sesión: `/publico`, `/recuperar`, `/restablecer`, `/aceptar-invitacion` y `/confirmar-correo` (`web/src/App.tsx`). El paciente crea su cuenta solo en la app Android o iOS (BL-06, decisión D-04): la web no tiene formulario de registro y `/registro` es una página informativa que remite a la app, para que los enlaces viejos no den 404. `/confirmar-correo` termina con «Abre la app CLIMESA» cuando la cuenta no usa la web. Las rutas internas usan `#/<módulo>`. Para que estas rutas funcionen en producción, `render.yaml` reescribe `/*` a `/index.html` y define las cabeceras de seguridad (CSP, HSTS); esa configuración se sincroniza a mano en Render (sección 11).
- ESLint 9 con `npm run lint` (`web/eslint.config.js`).

### 5.2 Android (`android/`)

- Kotlin 2.1.20, Jetpack Compose (BOM 2025.04.01) con Material 3, Hilt 2.57.1, corrutinas y `StateFlow`, OkHttp 4.12. `minSdk` 26, `targetSdk`/`compileSdk` 35. `applicationId` `sv.edu.catolica.climesa`.
- Patrón **MVVM**: pantallas Compose (`*Screen.kt`) que observan `ViewModel` con `StateFlow`; los ViewModel llaman a repositorios HTTP de forma asíncrona con corrutinas (`viewModelScope.launch`).
- Las secciones se habilitan por permiso (`AndroidSection` en `domain/AuthModels.kt`); todas están listas. JOP, LAB, ADM y DPD ven "Tu rol no usa esta aplicación" con el enlace a la web. En teléfono, la barra muestra Inicio y hasta tres tareas; el resto va en **Más**.
- Tiempo real nativo con el mismo protocolo que la web: `data/realtime/OkHttpRealtimeSocket.kt`, `RealtimeRepository.kt`, `SharedRealtime.kt`. Al llegar un evento se vuelven a pedir los datos de la pantalla abierta; no hay sondeo.
- Fase 1: APK release firmado con las variables `CLIMESA_RELEASE_*` (sin ellas genera un APK sin firmar; ver `android/README.md`), 401 con una renovación y regreso al ingreso, cierre de sesión que descarta los ViewModels y una `Idempotency-Key` por intención del usuario (`SubmissionIntent`).
- La sesión se guarda cifrada con Android Keystore; los pacientes remotos no se guardan en disco.
- Versión `1.0.0` (`versionCode` 4). El build Release nunca incluye el inicio de sesión de prueba.
- URL de la API: Debug usa `http://10.0.2.2:3000/api/v1` (emulador) salvo que `CLIMESA_API_BASE_URL` la sobrescriba; Release usa `https://sghu-api.onrender.com/api/v1` (`android/app/build.gradle.kts`).

### 5.3 iOS (`ios/`)

- SwiftUI con MVVM (`@Observable` y servicios `actor`), `URLSession` con `async/await` y Keychain (`WhenUnlockedThisDeviceOnly`). iOS 17+, Xcode 15+. Sin dependencias externas; el núcleo `Core/` es un Swift Package con pruebas (`swift test`).
- Roles Médico y Paciente. Las pestañas salen del perfil de `/auth/me` (`ios/Core/Access.swift`); otro rol ve "Tu rol no usa esta aplicación". MED: Mi día, Pacientes, Resultados, Turnos y Más. PAC: Inicio, Fila, Citas, Exámenes y Más.
- Tiempo real en `Core/Realtime` con el mismo protocolo Phoenix que web y Android; tras una caída se hace una sola consulta `GET /eventos?after=`.
- Un 401 borra la sesión y vuelve al ingreso; la sesión se cierra al volver tras cinco minutos en segundo plano.
- **Estado.** El workflow `ios.yml` (macOS 15) corre `swift test` y compila para simulador sin firma. **No** se probó en simulador ni en un iPhone con cuentas MED y PAC, y no se entrega IPA: instalar en un dispositivo o publicar en TestFlight requiere firmar con una cuenta de Apple. Versión `1.0.0`, build 4. El paciente sigue y cancela su solicitud de ambulancia (`/ambulancia/solicitudes/mias`); como en Android, no hay notificaciones push.

## 6. Modelo de datos

### 6.1 Esquemas por dominio

La base tiene **11 esquemas de dominio** y **66 tablas**, definidas en 28 archivos de `supabase/migrations/` (incluida la semilla de acceso generada). Además existe el esquema `metricas`, solo con vistas (`v_ocupacion_por_planta`, `v_laboratorio_por_estado`). Cada módulo escribe solo en su esquema; entre esquemas se usan llaves lógicas y vistas de solo lectura con prefijo `v_` (`docs/arquitectura/modelo-datos.md`).

| Esquema | Tablas |
|---|---|
| `plataforma` | `outbox`, `inbox`, `idempotencia`, `auditoria`, `politica` |
| `acceso` | `usuario`, `rol`, `permiso`, `rol_permiso`, `asignacion_rol`, `invitacion`, `administrador_principal`, `vinculacion_paciente`, `acceso_excepcional`, `dispositivo_push` |
| `pacientes` | `paciente`, `identificador`, `tipo_identificador`, `historial_demografico`, `busqueda_registro`, `caso_duplicado` |
| `personal` | `persona`, `inscripcion`, `turno` |
| `infra` | `espacio` (árbol hospital → planta → área → habitación → cama), `bloqueo_cama`, `limpieza_cama`, `equipo`, `tipo_equipo` |
| `atencion` | `cita`, `ticket_fila`, `contador_fila`, `consulta`, `signos_vitales`, `diagnostico`, `cie`, `receta`, `receta_item`, `addendum`, `relacion_atencion` |
| `laboratorio` | `examen`, `examen_componente`, `rango_referencia`, `orden`, `orden_item`, `resultado`, `resultado_historial` |
| `hospitalizacion` | `admision`, `reserva_cama`, `ocupacion_cama`, `traslado`, `nota_enfermeria`, `alta` |
| `ambulancia` | `unidad`, `cambio_estado`, `solicitud`, `servicio`, `tripulacion`, `hito`, `reporte_prehospital`, `ubicacion` |
| `inventario` | `articulo`, `lote`, `existencia`, `movimiento` |
| `publico` | `aviso` |

Una tabla sigue sin API: `atencion.addendum`. Una consulta firmada no se edita y no hay endpoint de corrección por addendum. El resto de las tablas de ambulancia y avisos ya tienen endpoints (sección 4). `acceso.acceso_excepcional` conserva las solicitudes históricas del módulo retirado en la ronda 1 y ya no tiene API.

### 6.2 Diagrama entidad-relación (entidades pedidas por el curso)

```mermaid
erDiagram
  USUARIO ||--o{ ASIGNACION_ROL : tiene
  ROL ||--o{ ASIGNACION_ROL : asigna
  ROL ||--o{ ROL_PERMISO : concede
  PERMISO ||--o{ ROL_PERMISO : incluye
  USUARIO |o--o| PERSONA : "es personal"
  USUARIO |o--o{ VINCULACION_PACIENTE : "solicita"
  PACIENTE ||--o{ IDENTIFICADOR : tiene
  PERSONA ||--o{ INSCRIPCION : "trabaja en área"
  PERSONA ||--o{ TURNO : cubre
  ESPACIO ||--o{ ESPACIO : contiene
  ESPACIO ||--o{ TURNO : "área del turno"
  PACIENTE ||--o{ CITA : agenda
  PERSONA ||--o{ CITA : "médico atiende"
  PACIENTE ||--o{ TICKET_FILA : recibe
  CITA |o--o| CONSULTA : origina
  CONSULTA ||--o{ SIGNOS_VITALES : registra
  CONSULTA ||--o{ DIAGNOSTICO : registra
  CONSULTA ||--o{ RECETA : emite
  CONSULTA ||--o{ ORDEN : solicita
  ORDEN ||--|{ ORDEN_ITEM : contiene
  EXAMEN ||--o{ ORDEN_ITEM : "se pide en"
  ORDEN_ITEM ||--o{ RESULTADO : produce
  PACIENTE ||--o{ ADMISION : ingresa
  ADMISION ||--o{ OCUPACION_CAMA : ocupa
  ESPACIO ||--o{ OCUPACION_CAMA : "cama ocupada"
  ADMISION |o--o| ALTA : cierra
  UNIDAD ||--o{ SERVICIO : realiza
  SOLICITUD |o--o| SERVICIO : "se despacha en"
  SERVICIO ||--o{ HITO : registra
  SERVICIO |o--o| REPORTE_PREHOSPITAL : documenta

  ESPACIO {
    uuid id PK
    text tipo "hospital, planta, area, habitacion, cama"
    text codigo "VIP-301, HAB-201-A"
    text categoria "vip o semiprivada"
    int capacidad
  }
  TURNO {
    uuid id PK
    uuid persona_id
    tstzrange periodo
    text estado "borrador, publicado, en_curso, completado, cancelado"
    int version
  }
  ORDEN {
    uuid id PK
    text estado "pendiente, en_proceso, completado, cancelado"
    int version
  }
  UNIDAD {
    uuid id PK
    text placa
    text estado "disponible, en_servicio, en_mantenimiento"
    int version
  }
```

Las relaciones entre esquemas distintos (por ejemplo `CITA` → `PACIENTE`) son llaves lógicas, no llaves foráneas cruzadas. El diagrama completo por esquema está en `docs/arquitectura/modelo-datos.md`.

### 6.3 Invariantes garantizadas por PostgreSQL

Las reglas concurrentes no dependen del cliente (`AGENTS.md`, regla 5):

| Invariante | Mecanismo (archivo) |
|---|---|
| Una cama, un paciente a la vez | `EXCLUDE USING gist (cama_id with =, periodo with &&)` en `hospitalizacion.ocupacion_cama` (`20261017000800_hospitalizacion.sql`) |
| Una habitación no supera su capacidad | Disparador `infra.validar_capacidad` sobre `infra.espacio` (`20261017000400_infra.sql`) |
| Una persona no tiene turnos traslapados | `EXCLUDE USING gist (persona_id with =, periodo with &&)` donde el estado no es `cancelado` (`20261017000500_personal.sql`) |
| Un médico no tiene dos citas a la vez | `EXCLUDE USING gist (medico_id with =, horario with &&)` en citas solicitadas o confirmadas (`20261017000600_atencion.sql`) |
| Un paciente no tiene dos citas a la vez | Exclusión sobre `paciente_id` y `horario` (`20261114000200_integridad_citas_consulta.sql`) |
| Un número de fila activo por paciente, servicio y día | Índice único (`20261114000300_ticket_activo_unico.sql`) |
| Un servicio activo por ambulancia | Índice único parcial `servicio_activo_unico` donde `finalizado_en is null` (`20261017000900_ambulancia.sql`) |
| Hitos de ambulancia en orden | Validación de la secuencia `salida → en_escena → trasladando → en_hospital → finalizado` (`20261017000900_ambulancia.sql`; despacho en `20261115001000_ambulancia_despacho.sql`) |
| Una vinculación pendiente por cuenta | Restricciones de `20261115003000_vinculacion_invariantes.sql` |
| Una persona no supera la carga ni descansa menos de lo exigido | Disparadores de `20261120003000_turnos_asistencia_carga.sql` (72 h en 7 días; descanso de 8 h, o 12 h tras 24 h; códigos `carga_semanal_excedida` y `descanso_insuficiente`) |
| Un despacho lleva paramédico con cuenta y motorista de turno | Disparadores de `20261119002000_ambulancia_motorista_de_turno.sql` y `20261120001100_ambulancia_cierre_administrativo.sql` |
| El estado final de un servicio corresponde a sus hitos; la entrega en el hospital es única | `estado_final_invalido` y disparador `servicio_cierre` (`20261121002000_ambulancia_fase1.sql`) |
| Una consulta vigente por número de fila | Índice único (`20261119003000_consulta_ticket_unico.sql`) |
| Una sola alta vigente por admisión; cancelar o anular no borra | `20261120001000_admision_cierre_ciclo.sql` |
| Un aviso retirado no cambia | `aviso_retirado` (`20261121003000_aviso_editar_retirar.sql`) |
| Auditoría inmutable | El rol de la API solo tiene `INSERT` y `SELECT` sobre la auditoría; cada fila guarda el hash de la anterior |

Las pruebas `supabase/pruebas/01_invariantes.sql` y `02_concurrencia.sh` comprueban estas reglas sobre PostgreSQL nativo.

## 7. Seguridad y control de acceso por rol (RBAC)

### 7.1 Capas

| Capa | Control | Evidencia |
|---|---|---|
| Transporte | HTTPS en Render; JWT de Supabase con renovación | `render.yaml`, `docs/desarrollo/despliegue-render.md` |
| Identidad | La API valida cada token con `auth.getUser` y carga cuenta, roles y permisos desde la base | `api/src/auth/supabase-auth.guard.ts`, `access.service.ts` |
| Autorización | Un permiso por endpoint, por nombre de permiso (`camas.asignar`), nunca por rol | `api/src/auth/permission.guard.ts`; pruebas `sin-roles-en-codigo.spec.ts`, `matriz-rbac.spec.ts` |
| Contexto | Además del permiso, algunas lecturas exigen relación de atención, área con turno en curso o ser el dueño (`propio`, `relacion`, `area` en la matriz) | `docs/arquitectura/datos/permisos.csv`; `20261029000100_acceso_contextos_ficha.sql` |
| Base de datos | RLS activado en todas las tablas de negocio; sin políticas para `anon` ni `authenticated` (acceso directo denegado); la API usa el rol `sghu_api` con permisos mínimos | `supabase/migrations/20261017001200_seguridad.sql` |
| Tiempo real | Canales privados autorizados contra el estado actual de la base; mensajes sin datos personales | `20261017000100_plataforma.sql`, ADR-0005 |
| Secretos | `service_role`/clave secreta y `DATABASE_URL` solo en el servidor; los clientes usan la clave publicable | `AGENTS.md` regla 3, `render.yaml` (`sync: false`) |
| Cabeceras y límite de tasa | `helmet` y un límite por IP en la API (`api/src/config/security.ts`); la información pública tiene su propio límite (`api/src/public/rate-limit.guard.ts`). La web define CSP y HSTS en `render.yaml` | `api/src/config/security.ts`, `render.yaml` |
| Protección del último administrador | La API y disparadores SQL impiden dejar el sistema sin ADM activo | `docs/arquitectura/arquitectura.md` |

### 7.2 Matriz resumida por rol

Resumen de qué puede ver (V) y modificar (M) cada rol, según `docs/arquitectura/datos/permisos.csv` en `1a124e7`. El detalle completo por permiso está en el Anexo B y el permiso de cada endpoint en el Anexo A.

| Área | ADM | JOP | REC | AST | ENF | MED | LAB | PAR | DPD | PAC |
|---|---|---|---|---|---|---|---|---|---|---|
| Usuarios, invitaciones y roles | V/M | · | · | · | · | · | · | · | V | · |
| Personal | V/M | V | · | · | · | · | · | · | · | · |
| Turnos (incluida la asistencia) | V | V/M | V | V | V | V | V | V | · | · |
| Edificio y espacios | V/M | V | V | V | V | V | · | · | · | · |
| Camas: tablero | · | V | V | · | V | V | · | · | · | V (propio) |
| Camas: asignar y trasladar | · | M | M | · | · | · | · | · | · | · |
| Camas: bloquear | · | M | · | · | · | · | · | · | · | · |
| Camas: limpieza (registrar y verificar) | · | M | · | · | M | · | · | · | · | · |
| Pacientes (ficha y registro) | · | V/M (duplicados) | V/M | V (área) | V/M (área; provisional) | V (relación) | V (orden) | V/M (relación; provisional) | · | V/M (propio) |
| Citas | · | V | V/M | V | · | V (propias) | · | · | · | V/M (propias) |
| Fila del día | · | V | V/M | V/M | · | V/M | · | · | · | V (propio) |
| Consulta, diagnósticos y recetas | · | · | · | · | V (relación) | V/M (relación) | · | · | · | V (propio, revisado) |
| Signos vitales | · | · | · | M | M | M | · | M | · | · |
| Laboratorio: órdenes y revisión | · | · | · | · | V (relación) | V/M (ordenar, revisar) | V/M (procesar, validar, enmendar) | · | · | V (propio, revisado) |
| Laboratorio: catálogo | M | · | · | · | · | · | · | · | · | · |
| Hospitalización: admisión, cancelación y solicitud de alta | · | V/M (además autoriza excepciones) | V/M | · | V (área) | V/M (relación; indica hospitalización) | · | · | · | V (propio) |
| Hospitalización: firma del alta | · | · | · | · | · | M (relación) | · | · | · | · |
| Hospitalización: salida física | · | · | M | · | M | · | · | · | · | · |
| Notas de enfermería | · | · | · | · | M (área) | · | · | · | · | · |
| Inventario | V/M (configurar, sin movimientos) | V/M | · | · | V/M (consumo) | · | V/M (reactivos) | · | · | · |
| Ambulancia: estado | · | V | V | · | · | V | · | V | · | · |
| Ambulancia: mantenimiento | · | M | · | · | · | · | · | · | · | · |
| Ambulancia: solicitud | · | · | M | · | · | · | · | · | · | M (propio) |
| Ambulancia: despacho | · | M | M | · | · | · | · | · | · | · |
| Ambulancia: hitos, ubicación y prehospital (registro) | · | · | · | · | · | · | · | M | · | · |
| Ambulancia: recepción prehospital y entrega en el hospital | · | V | V | · | V/M (relación o turno en Emergencia) | V/M (relación o turno en Emergencia) | · | · | · | · |
| Ambulancia: bitácora | · | V | V | · | · | V | · | V (propio) | V | · |
| Auditoría (metadatos, búsqueda, verificación de cadena) | · | · | · | · | · | · | · | · | V | · |
| Vinculación de cuenta con expediente | · | · | M (aprueba) | · | · | · | · | · | · | M (solicita, propio) |
| "Quién vio mi expediente" | · | · | · | · | · | · | · | · | · | V (propio) |
| Avisos públicos (publicar, editar y retirar) | · | M | · | · | · | · | · | · | · | · |
| Métricas | V | V | · | · | · | · | · | · | V | · |

Contextos: "área" significa con turno en curso en el área del paciente; "relación", con relación de atención; "orden", solo pacientes con orden de laboratorio; "propio", solo lo del propio paciente o servicio. Reglas que van además del permiso y viven en la API: la entrega en el hospital exige `expediente.ver` y turno en curso en Emergencia (`P1-EMG`) o relación de atención (`api/src/ambulance/ambulance.rules.ts`); el cierre administrativo de un servicio es de JOP; el médico de la cita acepta o rechaza las reprogramaciones que pide el paciente.

La tabla es una lectura humana del CSV; si difiere, manda `permisos.csv`, que es la fuente de las migraciones de permisos (generadas por `tools/generar_docs.py`) y de las pruebas.

## 8. Política de privacidad de datos

Documento completo: `docs/arquitectura/privacidad.md` (base: LPDP de El Salvador, Decreto 144 de 2024, y Norma Técnica del Expediente Clínico). Resumen:

### 8.1 Clases de información

| Clase | Quién la ve | Ejemplos |
|---|---|---|
| **Pública** | Cualquiera, sin sesión | Ocupación general por planta y tipo (números, no camas), médicos de turno, avisos generales, números de fila llamados sin nombre |
| **Interna** | Personal con sesión, según permiso | Estado de cada cama sin ocupante, estado de la ambulancia, turnos, inventario |
| **Personal** | Paciente dueño, personal que lo atiende o registra, administración autorizada | Nombre, DUI, fecha de nacimiento, teléfono, dirección, cama asignada, citas |
| **Clínica (sensible)** | Paciente dueño (lo revisado o firmado), médico tratante, enfermería del área, laboratorio en lo que procesa | Consultas, diagnósticos, recetas, signos vitales, órdenes y resultados, notas de enfermería, alta |

"Administración autorizada" (D-031): ADM y JOP ven los datos personales necesarios para operar (cama asignada, admisión), **nunca** lo clínico por su rol. Sin relación de atención no hay lectura clínica (el módulo de acceso excepcional se retiró en la ronda 1); toda lectura queda auditada y el paciente la ve en "Quién vio mi expediente" (`GET /me/accesos`: fecha, rol y motivo, sin nombres del personal).

### 8.2 Campos públicos y privados del expediente

| Campo | Clase | Público | Quién lo ve con sesión (resumen) |
|---|---|---|---|
| Número de expediente, nombres | Personal | No | PAC dueño, REC, AST, ENF, MED, LAB, JOP; PAR durante el servicio |
| DUI y otros documentos | Personal | No | PAC dueño, REC, MED |
| Teléfono, correo, dirección | Personal | No | PAC dueño, REC, MED; PAR solo la dirección del servicio |
| Habitación y cama asignada | Personal | Solo el agregado de ocupación | PAC dueño, REC, ENF del área, MED, JOP |
| Citas y número de fila | Personal | Solo el número, sin nombre | PAC dueño, REC, AST, MED (propias) |
| Signos vitales, motivo, diagnósticos, recetas | Clínica | No | PAC dueño (firmado), ENF del área, MED; AST y PAR al registrar signos |
| Estado de una orden de laboratorio | Clínica | No | PAC dueño (siempre), ENF del área, MED, LAB |
| Valores de resultados | Clínica | No | PAC dueño **solo tras la revisión del médico** (D-040), ENF del área, MED, LAB |

### 8.3 Reglas técnicas implementadas

1. La API filtra campos según permiso y contexto antes de responder; el cliente no recibe un campo para ocultarlo (`api/tests/patients-fichas.spec.ts`).
2. Los eventos de tiempo real no llevan datos personales ni clínicos. Un paciente sin expediente vinculado recibe una fila vacía; los eventos de fila y de consulta de un paciente no llegan al canal general `rol:PAC`, y un resultado crítico no llega al paciente antes de la revisión médica (`api/tests/fase0-privacidad-eventos.spec.ts`).
3. Las lecturas de detalle clínico, agenda, citas y fila quedan auditadas (`api/tests/fase0-inscripcion-lecturas.spec.ts`); las búsquedas de pacientes guardan una huella del texto buscado, no el texto (`api/src/patients/patients.service.ts`).
4. El paciente ve el estado de sus órdenes siempre, y los valores solo después de la revisión médica.
5. Cierre de sesión por inactividad: 15 minutos en web; 5 minutos en segundo plano en móvil.
6. Los clientes no guardan datos clínicos en disco.
7. La información pública (`/publico/*`) no requiere sesión, no lleva datos personales y tiene límite de tasa por IP; la web y las apps la muestran como "Hospital".
8. `POST /auditoria/verificacion` recalcula la cadena de hash y permite al DPD comprobar que la auditoría no se alteró.

## 9. Tiempo real

Ningún cliente recarga ni consulta cada cierto tiempo (`AGENTS.md`, regla 9; ADR-0005; D-060).

```mermaid
sequenceDiagram
  participant C1 as Cliente que escribe
  participant API as API NestJS
  participant DB as PostgreSQL
  participant RT as Supabase Realtime
  participant C2 as Otros clientes
  C1->>API: POST con Idempotency-Key y version
  API->>DB: BEGIN, cambio + auditoría + INSERT en plataforma.outbox
  DB->>DB: disparador: realtime.send(evento, canal) por cada canal
  API->>DB: COMMIT
  API-->>C1: respuesta
  RT-->>C2: evento delgado {tipo, entidad, id, version}
  C2->>API: GET del recurso (con su propio permiso)
  API-->>C2: estado actual filtrado
```

- El evento se escribe en `plataforma.outbox` dentro de la misma transacción; si la transacción falla, no hay evento. Un disparador llama a `realtime.send` para cada canal (`supabase/migrations/20261017000100_plataforma.sql`).
- Canales: `rol:<código>`, `usuario:<id>`, `area:<espacio>`, `paciente:<id>`, `ambulancia` (privados) y `publico`. Los canales de cada evento se derivan del catálogo de permisos al emitirlo, no de listas de roles en el código (`api/tests/tiempo-real-canales.spec.ts`).
- El cliente no confía en el contenido del evento: invalida y vuelve a pedir lo que le toca con su permiso.
- Recuperación: tras una caída del canal o al volver la red, el cliente hace **una** consulta a `GET /eventos?after=<cursor>` (hasta 200 eventos) y vuelve a pedir sus vistas. No hay reintento por reloj.
- Catálogo de eventos: `docs/arquitectura/tiempo-real.md`. El catálogo incluye los eventos de ambulancia, vinculación (`vinculacion.resuelta`), accesos, avisos, métricas (`metricas.recalculadas`) e inventario bajo el mínimo (`inventario.bajo_minimo`). Web, Android e iOS usan el mismo protocolo Phoenix de Supabase Realtime.

## 10. Idempotencia y concurrencia optimista

- **Idempotencia.** Toda escritura lleva la cabecera `Idempotency-Key`. La clave se guarda en `plataforma.idempotencia` por actor y operación, junto con el hash del cuerpo. Repetir la misma clave con el mismo cuerpo devuelve la respuesta guardada; con otro cuerpo devuelve 409.
- **Versión optimista.** Las tablas editables tienen `version int`. El cliente envía la versión que leyó; si otra persona la cambió antes, la API responde 409 y el cliente vuelve a cargar. Hospitalización envía la versión en web (commit `39bd23b`), en el alta de Android (`575d998`) y en toda escritura de iOS; tras un `version_conflicto` la pantalla vuelve a pedir el registro.
- **Nada clínico se borra.** Una consulta firmada no se edita (`20261114000200_integridad_citas_consulta.sql`); las correcciones de resultados de laboratorio exigen motivo y guardan el valor anterior en `laboratorio.resultado_historial`.
- **Una clave por intención.** Los tres clientes generan la `Idempotency-Key` por acción del usuario y la reutilizan solo en el reintento de esa misma acción (`SubmissionIntent` en Android e iOS, `web/src/features/intent.ts`).
- **Auditoría encadenada.** Cada fila de `plataforma.auditoria` incluye el hash de la anterior (SHA-256) y el JSON canónico del evento.

```mermaid
sequenceDiagram
  participant R1 as Recepción (Android)
  participant R2 as Jefatura (Web)
  participant API
  participant DB as PostgreSQL
  R1->>API: POST /admisiones/A/cama {cama HAB-203-B}
  R2->>API: POST /admisiones/B/cama {cama HAB-203-B}
  API->>DB: INSERT ocupación A
  API->>DB: INSERT ocupación B
  DB-->>API: A confirma
  DB-->>API: B viola la exclusión
  API-->>R1: 200 cama asignada
  API-->>R2: 409 conflicto, elegir otra cama
```

## 11. Despliegue

```mermaid
flowchart LR
  GH["Repositorio GitHub"] -- "Manual Deploy" --> RA["Render: sghu-api<br/>Docker, plan free"]
  GH -- "Manual Deploy" --> RW["Render: sghu-web<br/>sitio estático"]
  RW -- "HTTPS" --> RA
  RA -- "Session pooler, rol sghu_api" --> SB[("Supabase<br/>Postgres, Auth, Realtime")]
  RW -- "Auth y Realtime" --> SB
```

| Pieza | Dirección | Configuración |
|---|---|---|
| Web | https://sghu-web.onrender.com | `render.yaml`: `npm ci && npm run build`, publica `dist`, reescribe `/* → /index.html` |
| API | https://sghu-api.onrender.com/api/v1 | `render.yaml`: Docker (`api/Dockerfile`), health check `/salud` |
| Base, Auth y Realtime | Proyecto Supabase "Gestion hospitalaria universitaria (Climesa)" | Migraciones aplicadas a mano en orden de fecha (`docs/desarrollo/ges-15-supabase-remoto.md`); no se usa `supabase db push` |

- `autoDeploy: false` en ambos servicios: el despliegue es manual desde el panel de Render.
- **Pendiente de la dueña del proyecto (Render).** `render.yaml` ya contiene la reescritura `/*` → `/index.html` y las cabeceras de seguridad, pero Render no las aplica solo si el servicio no sigue el Blueprint. El build copia `index.html` como `404.html`, así que los enlaces profundos cargan igual, aunque con estado 404 y sin cabeceras hasta que se sincronicen.
- **`WEB_APP_URL`.** En producción la API no arranca si falta, si no es HTTPS o si apunta a localhost (`docs/operacion/correo-auth.md`).
- **Base de datos de producción.** Las migraciones se aplican a mano en el SQL Editor, en orden de fecha y después de la comprobación previa que trae cada archivo; no se usa `supabase db push`. El procedimiento y la lista de las 15 migraciones de las fases 0 y 1 (`20261119002000` a `20261121003200`) están en `docs/operacion/runbook-operador.md`.
- Las variables secretas (`SUPABASE_SECRET_KEY`, `DATABASE_URL`) se escriben a mano en Render (`sync: false`).
- La API se conecta por el *Session pooler* de Supabase porque la conexión directa es solo IPv6.
- El plan gratuito duerme la API tras 15 minutos sin tráfico; la primera llamada tarda cerca de un minuto (`docs/desarrollo/despliegue-render.md`). Los tres clientes reintentan con espera creciente (2, 5 y 10 s) y muestran "El servidor se está activando" a los 5 s; la web pide `/salud` al abrir el ingreso (MA-OPS-01).

## 12. Integración continua

Un workflow de GitHub Actions por componente, que solo corre cuando cambian sus rutas (`.github/workflows/`):

| Workflow | Qué ejecuta |
|---|---|
| `api.yml` | Node 22: instalación, ESLint, pruebas Jest, compilación y comprobación de que `contrato/openapi.json` está al día |
| `web.yml` | Node 22: instalación, ESLint, pruebas Vitest y compilación de la web |
| `android.yml` | JDK 17: `./gradlew testDebugUnitTest assembleDebug` |
| `ios.yml` | macOS 15: `swift test`, `xcodebuild` para simulador y un IPA sin firmar |
| `supabase.yml` | Job `postgres-native`: PostgreSQL en Docker, todas las migraciones, `01_invariantes.sql` y `02_concurrencia.sh`. Tiene una falla intermitente conocida cuando la base responde antes de terminar la semilla; se vuelve a ejecutar (runbook, sección 7) |
| `docs.yml` | Python: `generar_docs.py`, `progreso.py` y `backlog.py` con `--verificar` |

El despliegue no está conectado a CI: no hay un gate que impida desplegar un commit con pruebas fallidas.

## 13. Calidad y pruebas

| Componente | Pruebas en esta rama | Herramienta |
|---|---|---|
| API | 66 archivos `*.spec.ts` en `api/tests/` (pipeline HTTP, RBAC, privacidad, tiempo real, módulos clínicos, ambulancia, público, métricas, vinculación, contrato móvil) | Jest sobre PostgreSQL WASM (PGlite) con todas las migraciones |
| Web | 57 archivos de prueba en `web/src` | Vitest |
| Android | 71 archivos de prueba en `android/app/src/test` | JUnit (`testDebugUnitTest`) |
| iOS | 19 archivos en `ios/Tests` (contrato, reglas, tiempo real); el workflow `ios.yml` ejecuta `swift test` y compila para simulador | XCTest (no ejecutado en este entorno) |
| Base de datos | `supabase/pruebas/01_invariantes.sql`, `02_concurrencia.sh` | PostgreSQL nativo en Docker |
| Documentación | `tools/progreso.py --verificar`, `tools/generar_docs.py --verificar` | Python |

Los conteos de esta sección son de archivos y se obtuvieron contando los archivos del repositorio en `1a124e7`; este documento no vuelve a ejecutar las pruebas. La CI de cada pull request las ejecuta.

PGlite usa una sola conexión y no demuestra carreras entre sesiones; esas carreras se cubren con `02_concurrencia.sh` sobre PostgreSQL nativo.

## 14. Decisiones de arquitectura

| ADR | Decisión |
|---|---|
| ADR-0001 | Monolito modular con API propia sobre Supabase |
| ADR-0002 | Repositorio único (monorepo) y estructura |
| ADR-0003 | Clientes nativos con patrón MVVM |
| ADR-0004 | Autenticación con Supabase Auth, autorización y acceso a datos en la API |
| ADR-0005 | Tiempo real con outbox y Broadcast; notificaciones |
| ADR-0006 | Migraciones, semillas y entornos |
| ADR-0007 | Concurrencia y recursión (árbol de espacios y de exámenes) |
| ADR-0008 | Despliegue y perfiles |
| ADR-024 | Backend oficial en Node.js + NestJS (reemplaza el diseño anterior en .NET) |

Archivos: `docs/decisiones/adr/ADR-0001-…` a `ADR-0008-…` y `docs/decisiones/ADR-024-backend-nodejs.md`. Las decisiones puntuales `D-001` a `D-081` están en `docs/decisiones/registro-decisiones.md`; en particular D-059 (estados de laboratorio), D-060 (tiempo real), D-061 (autenticación), D-062 (recursión visible), D-063 (concurrencia demostrable) y D-064 (despliegue).

## 15. Limitaciones conocidas

1. **Despliegue y migraciones manuales.** Render no despliega solo ni espera a CI (`autoDeploy: false`). Las migraciones de la nube se aplican a mano en el SQL Editor (`docs/operacion/runbook-operador.md`). Si `sghu-web` no sigue el Blueprint, la reescritura y las cabeceras de `render.yaml` se crean en el panel.
2. **Datos demo de una semilla anterior.** La semilla actual usa solo las camas reales de P2 y P3 (BL-01). Si producción conserva la planta 4 de una semilla anterior, se retira con `tools/demo/limpiar-demo.sql`, con respaldo previo y aprobación (D-01).
3. **Inicio de sesión de prueba.** Debe quedar apagado y las contraseñas demo rotadas antes de la entrega (`docs/operacion/login-de-prueba.md`).
4. **iOS sin probar en dispositivo.** Compila y pasa `swift test` en CI, pero no se ejecutó en simulador ni iPhone con cuentas reales; no hay IPA firmado ni TestFlight.
5. **Sin notificaciones push (D-09).** FCM y APNs no están construidos; los cambios llegan solo con la app abierta (Realtime).
6. **Addendum (D-06).** `atencion.addendum` y el permiso `consulta.corregir` existen sin endpoint; una consulta firmada no se corrige.
7. **Figma no sincronizado (MA-OPS-05).** El archivo de Figma es una versión anterior y no refleja las fases 0 y 1. El sistema de diseño vigente está en HTML dentro del repositorio (`docs/diseno/claude-design/`).
8. **Plan gratuito de Render.** La API duerme tras 15 minutos sin tráfico; los clientes avisan y reintentan, pero la primera llamada tarda cerca de un minuto.
9. **Correo de Supabase Auth.** Sin SMTP propio con SPF y DKIM (D-15), los correos de cuenta pueden llegar a spam (`docs/operacion/correo-auth.md`).
10. **Cursor de recuperación.** Un evento de una transacción lenta puede quedar por debajo del cursor; se mitiga porque el cliente vuelve a pedir todas sus vistas al reconectar (`docs/arquitectura/tiempo-real.md`).
11. **Pruebas contra Supabase real.** Las pruebas de API usan PGlite con identidad simulada; no sustituyen el login, el correo y la concurrencia multisesión en la nube. El job `postgres-native` tiene una falla intermitente conocida (sección 12).
12. **Plataforma por rol (D-08).** Es una restricción de interfaz: la API autoriza por permiso, no por plataforma.

---

## Anexo A. Endpoints y permiso requerido

Generado desde `contrato/openapi.json` (campo `x-permiso` de cada operación): 160 operaciones bajo `/api/v1`. Cuando se listan varios permisos, basta con tener uno. "Sin sesión" son `/health`, `/salud` y `/publico/*`. Toda escritura exige `Idempotency-Key` y, si cambia un registro existente, su `version`. Los errores son `application/problem+json`. La documentación interactiva está en `/api/v1/docs`.

| Método | Ruta (`/api/v1`) | Permiso requerido | Qué hace |
|---|---|---|---|
| GET | `/pacientes` | `pacientes.buscar` | Buscar por nombre, fonética, DUI o expediente; devuelve campos mínimos |
| POST | `/pacientes` | `pacientes.registrar` | Registrar después de buscar; expediente y DUI exclusivos |
| GET | `/pacientes/selector` | `pacientes.buscar` | Selector de pacientes: id, expediente, nombre y edad, paginado y sin tildes |
| POST | `/pacientes/busquedas` | `pacientes.buscar` | Buscar y obtener constancia de diez minutos, ligada a la cuenta y criterios |
| GET | `/pacientes/casos-duplicado` | `pacientes.gestionar_duplicados` | Casos abiertos de posible duplicado con los dos pacientes mínimos |
| GET | `/pacientes/{id}` | `pacientes.ver_ficha` | Ficha filtrada por rol y relación de atención |
| PATCH | `/pacientes/{id}` | `pacientes.editar_demograficos` | Corregir ficha con versión, motivo e historial |
| POST | `/pacientes/provisionales` | `pacientes.registrar_provisional` | Registrar identidad provisional sin inventar fecha exacta |
| POST | `/pacientes/{id}/estado` | `pacientes.editar_demograficos` | Inactivar o reactivar sin eliminar historial |
| GET | `/me/paciente` | `pacientes.ver_ficha` | Ficha del paciente autenticado |
| PATCH | `/me/paciente` | `pacientes.editar_propios` | El paciente edita su teléfono, correo y dirección; versión optimista e historial |
| GET | `/auth/me` | `sesion.perfil` | Cuenta activa, roles, plataformas y permisos vigentes en la base |
| GET | `/usuarios` | `usuarios.ver` | Cuentas, roles, estado, invitación y acciones permitidas a quien consulta |
| POST | `/usuarios/invitaciones` | `usuarios.invitar` | Invitar personal con roles autorizados por el administrador (el paciente se registra en la app) |
| POST | `/usuarios/{id}/invitacion/reenvio` | `usuarios.invitar` | Reenviar una invitación pendiente |
| POST | `/usuarios/{id}/invitacion/cancelacion` | `usuarios.invitar` | Cancelar una invitación pendiente; desactiva la cuenta invitada |
| PATCH | `/usuarios/{id}/roles` | `usuarios.asignar_roles` | Cambiar roles; prohíbe autoasignación y protege el último administrador |
| PATCH | `/usuarios/{id}/estado` | `usuarios.desactivar` | Desactivar o reactivar; no desactiva al último administrador |
| GET | `/health` | `publico` | Comprueba que la API está disponible |
| GET | `/salud` | `publico` | Readiness: API y conexión PostgreSQL operativas |
| GET | `/inicio` | `sesion.perfil` | Resumen permitido para la cuenta actual |
| GET | `/personal` | `personal.ver` | Directorio de personal con o sin cuenta |
| POST | `/personal` | `personal.gestionar` | Registrar personal |
| GET | `/personal/especialidades` | `personal.ver` | Catálogo de especialidades por categoría (tipo de personal) |
| PATCH | `/personal/{id}` | `personal.gestionar` | Editar o inactivar personal con versión y motivo |
| POST | `/personal/{id}/inscripciones` | `personal.gestionar` | Registrar inscripción profesional con vigencia, versión y motivo |
| GET | `/turnos` | `turnos.ver` | Consultar la planificación de turnos |
| POST | `/turnos` | `turnos.planificar` | Planificar turno con duración, traslapes y descanso |
| GET | `/turnos/catalogo` | `turnos.ver` | Catálogo completo de áreas, funciones y personal para filtrar y asignar turnos |
| GET | `/turnos/mios` | `turnos.ver` | Turnos publicados de la persona vinculada a la cuenta |
| GET | `/turnos/cobertura` | `turnos.ver` | Huecos de cobertura por área y hora frente al mínimo vigente |
| GET | `/turnos/especialistas` | `turnos.ver` | Médicos de turno por día y especialidad durante 7 días (CARGA-04) |
| POST | `/turnos/{id}/asistencia` | `turnos.planificar` | Ausencia (con tipo y motivo), corregir la hora real de entrada o deshacer una ausencia; la entrada es automática al inicio (ASIS-01 a ASIS-03) |
| POST | `/turnos/publicar` | `turnos.publicar` | Publicar los borradores de un rango; con huecos de cobertura advierte y registra quién publicó |
| PATCH | `/turnos/{id}` | `turnos.planificar` | Mover o cancelar turno con versión y motivo |
| GET | `/espacios` | `espacios.ver` | Árbol, rutas y disponibilidad recursiva por espacio |
| POST | `/espacios` | `espacios.configurar` | Crear espacio respetando árbol y capacidad |
| PATCH | `/espacios/{id}` | `espacios.configurar` | Editar espacio con versión, capacidad y ocupación |
| GET | `/camas` | `camas.ver_tablero` | Tablero con ocupante filtrado por permiso y área |
| POST | `/camas/{id}/bloquear` | `camas.bloquear` | Bloquear una cama libre con motivo y versión |
| POST | `/camas/{id}/desbloquear` | `camas.bloquear` | Retirar el bloqueo activo con versión y motivo |
| POST | `/camas/{id}/limpieza` | `camas.registrar_limpieza` | Solicitar limpieza para una cama ocupada |
| POST | `/camas/{id}/limpieza/completar` | `camas.registrar_limpieza` | Registrar la limpieza realizada con versión y motivo |
| POST | `/camas/{id}/limpieza/verificar` | `camas.verificar_limpieza` | Verificar la limpieza realizada por otra persona |
| GET | `/eventos` | `sesion.perfil` | Eventos delgados de canales autorizados para recuperar cambios tras reconexión |
| GET | `/citas/catalogos` | `citas.agendar` o `citas.solicitar` | Médicos activos (con date indica quién tiene turno ese día); a recepción ya no devuelve pacientes: se buscan con /pacientes/selector |
| GET | `/citas/disponibilidad` | `citas.agendar` o `citas.solicitar` | Consultar las franjas del día de un médico con su estado (libre, ocupado, sin_turno, pasado) |
| GET | `/citas` | `citas.ver` | Consultar citas del rango permitido por el rol |
| POST | `/citas` | `citas.agendar` | Agendar y confirmar una cita desde recepción |
| POST | `/citas/solicitudes` | `citas.solicitar` | Solicitar una cita como paciente |
| POST | `/citas/solicitudes/{id}/confirmar` | `citas.agendar` | Confirmar una solicitud de cita |
| POST | `/citas/solicitudes/{id}/rechazar` | `citas.agendar` | Rechazar una solicitud de cita |
| POST | `/citas/{id}/cancelar` | `citas.cancelar` | Cancelar una cita propia o gestionada por recepción |
| POST | `/citas/{id}/reprogramar` | `citas.agendar` o `citas.solicitar` | Reprogramar a una franja libre del mismo médico: recepción la aplica; el paciente deja una solicitud que la cita original conserva hasta que se acepta |
| POST | `/citas/reprogramaciones/{id}/aceptar` | `citas.agendar` o `consulta.iniciar` | Aceptar una solicitud de reprogramación (recepción o el médico de la cita) |
| POST | `/citas/reprogramaciones/{id}/rechazar` | `citas.agendar` o `consulta.iniciar` | Rechazar una solicitud de reprogramación con motivo (recepción o el médico de la cita) |
| POST | `/citas/{id}/no-asistio` | `citas.agendar` | Marcar que el paciente no asistió (la hora ya llegó y no hay consulta) |
| GET | `/consultas/agenda` | `consulta.iniciar` | Agenda propia del médico con estado de consulta |
| GET | `/consultas/sin-firmar` | `consulta.iniciar` | Consultas abiertas propias de cualquier día, para reanudarlas y firmarlas |
| POST | `/consultas` | `consulta.iniciar` | Iniciar una consulta desde una cita confirmada |
| PATCH | `/consultas/{id}` | `consulta.registrar` | Guardar el borrador clínico de una consulta |
| POST | `/consultas/{id}/firmar` | `consulta.registrar` | Firmar la consulta y marcar la cita como atendida |
| GET | `/fila` | `fila.ver` | Consultar la fila del día |
| POST | `/fila` | `fila.emitir` | Emitir un número para el paciente actual o indicado |
| POST | `/fila/llamar-siguiente` | `fila.llamar` | Llamar el siguiente número en espera del servicio (orden de llegada) |
| POST | `/fila/{id}/llamar` | `fila.llamar` | Llamar un número de fila |
| POST | `/fila/{id}/atender` | `fila.gestionar` | Pasar un número llamado a atención |
| POST | `/fila/{id}/completar` | `fila.gestionar` | Marcar un número como atendido |
| POST | `/fila/{id}/no-se-presento` | `fila.gestionar` | Marcar que el paciente no se presentó |
| GET | `/consultas/{id}/detalle` | `expediente.ver` o `consulta.iniciar` | Consultar el detalle clínico permitido |
| POST | `/consultas/{id}/signos` | `signos.registrar` | Registrar signos vitales de una consulta |
| POST | `/consultas/{id}/diagnosticos` | `consulta.registrar` | Registrar un diagnóstico CIE-10 |
| POST | `/consultas/{id}/receta` | `recetas.emitir` | Emitir una receta con sus indicaciones |
| GET | `/pacientes/{id}/historial` | `expediente.ver` | Historial clínico: relación o propio revisado |
| GET | `/pacientes/{id}/signos` | `signos.registrar` | Historial de signos vitales del paciente, el más reciente primero |
| POST | `/pacientes/{id}/signos` | `signos.registrar` | Registrar signos vitales de un paciente fuera de una consulta |
| GET | `/laboratorio/catalogo` | `laboratorio.ordenar` o `catalogo.configurar` | Catálogo activo de exámenes y paneles |
| GET | `/laboratorio/ordenes` | `laboratorio.ver_cola` o `resultados.ver` | Cola de laboratorio o resultados permitidos |
| POST | `/laboratorio/ordenes` | `laboratorio.ordenar` | Crear una orden de laboratorio desde una consulta |
| GET | `/laboratorio/ordenes/{id}` | `resultados.ver` | Detalle de una orden: resultados permitidos, motivo de cancelación e historial de correcciones |
| POST | `/laboratorio/ordenes/{id}/muestra` | `laboratorio.procesar` | Tomar muestra y pasar la orden a proceso |
| POST | `/laboratorio/ordenes/{id}/resultados` | `laboratorio.procesar` | Capturar o actualizar el resultado de un examen |
| POST | `/laboratorio/ordenes/{id}/enmendar` | `laboratorio.validar` | Enmendar un resultado de una orden completada; vuelve a revisión médica |
| POST | `/laboratorio/ordenes/{id}/completar` | `laboratorio.validar` | Completar una orden con todos sus resultados |
| POST | `/laboratorio/ordenes/{id}/revisar` | `laboratorio.revisar` | Revisar y liberar resultados al paciente |
| POST | `/laboratorio/ordenes/{id}/cancelar` | `laboratorio.cancelar` | Cancelar una orden pendiente o en proceso |
| GET | `/me/laboratorio` | `resultados.ver` | Mis exámenes: estado siempre; valores solo revisados |
| GET | `/catalogo/examenes` | `catalogo.configurar` | Catálogo completo de exámenes con componentes y rangos vigentes |
| PUT | `/catalogo/examenes/{id}` | `catalogo.configurar` | Editar nombre, unidad, estado y rangos de un examen (los rangos se versionan por vigencia) |
| GET | `/admisiones/origenes` | `admision.crear` | Registros recientes del paciente que pueden originar el ingreso |
| GET | `/admisiones/medicos-disponibles` | `admision.crear` | Médicos con su disponibilidad (turno) en el instante de ingreso |
| GET | `/admisiones/mapa-camas` | `admision.crear` | Camas por planta y habitación con su compatibilidad para el paciente |
| GET | `/admisiones/factibilidad` | `admision.crear` | Comprobación previa a confirmar el ingreso (sin escribir) |
| GET | `/admisiones` | `admision.ver` | Admisiones visibles para el actor |
| POST | `/admisiones` | `admision.crear` | Crear una admisión |
| GET | `/admisiones/{id}/sugerencias-cama` | `camas.asignar` |  |
| POST | `/admisiones/{id}/cama` | `camas.asignar` |  |
| POST | `/admisiones/{id}/autorizar` | `admision.autorizar` |  |
| POST | `/admisiones/{id}/notas-enfermeria` | `enfermeria.registrar` |  |
| GET | `/admisiones/{id}/notas-enfermeria` | `enfermeria.registrar` | Notas de enfermería de la admisión, de la más reciente a la más antigua |
| POST | `/admisiones/{id}/alta` | `alta.firmar` |  |
| POST | `/admisiones/{id}/salida` | `admision.registrar_salida` |  |
| POST | `/admisiones/{id}/cancelar` | `admision.crear` | Cancelar una admisión pendiente de cama, con motivo |
| POST | `/admisiones/{id}/anular` | `admision.autorizar` | Anular una hospitalización ingresada por error: cierra la ocupación y la cama pasa a limpieza |
| POST | `/admisiones/{id}/tratante` | `admision.autorizar` | Reasignar el médico tratante, con motivo |
| POST | `/admisiones/{id}/solicitar-alta` | `admision.crear` | Pedir al médico tratante que firme el alta (le llega un aviso en vivo) |
| POST | `/admisiones/{id}/revocar-alta` | `alta.firmar` o `admision.autorizar` | Revocar un alta firmada antes de la salida física (el firmante o Jefatura) |
| POST | `/admisiones/indicaciones` | `admision.solicitar` |  |
| POST | `/ocupaciones/{id}/traslado` | `camas.trasladar` | Trasladar una ocupación a otra cama |
| GET | `/inventario/existencias` | `inventario.ver` | Existencias por bodega, lote y vencimiento |
| GET | `/inventario/movimientos` | `inventario.ver` | Historial de movimientos |
| POST | `/inventario/movimientos` | `inventario.mover` | Registrar entrada, salida, ajuste, traslado, consumo o merma |
| GET | `/inventario/articulos` | `inventario.ver` | Artículos con resumen de existencia y estado, según lo que el rol puede ver |
| POST | `/inventario/articulos` | `inventario.configurar` | Crear artículo de inventario |
| GET | `/inventario/articulos/{id}` | `inventario.ver` | Detalle del artículo: lotes con vencimiento, existencia por bodega e historial |
| PUT | `/inventario/articulos/{id}` | `inventario.configurar` | Editar artículo de inventario |
| DELETE | `/inventario/articulos/{id}` | `inventario.configurar` | Eliminar un artículo creado por error; con lotes o historial solo se desactiva |
| GET | `/inventario/bodegas` | `inventario.ver` | Bodegas donde el rol puede mover existencias |
| GET | `/inventario/lotes` | `inventario.ver` | Lotes de un artículo con su cantidad en una bodega, el que vence primero marcado (FEFO) |
| POST | `/inventario/articulos/{id}/lotes` | `inventario.configurar` | Crear lote de un artículo |
| PUT | `/inventario/lotes/{id}` | `inventario.configurar` | Editar vencimiento, número o baja de un lote |
| GET | `/auditoria` | `auditoria.ver` | Metadatos de auditoría por persona, paciente, acción y fecha; no contiene valores clínicos |
| GET | `/auditoria/registros` | `auditoria.ver` | Auditoría paginada y ordenable por persona, rol, paciente, acción, entidad, resultado y fecha |
| GET | `/auditoria/opciones` | `auditoria.ver` | Acciones, entidades y roles que existen en la auditoría, para los filtros |
| GET | `/auditoria/registros/{seq}` | `auditoria.ver` | Detalle de una fila de auditoría: quién, qué, cuándo, metadatos y hashes de la cadena |
| POST | `/auditoria/verificacion` | `auditoria.ver` | Verificar la integridad de la cadena de hash de la auditoría |
| POST | `/exportaciones` | `sesion.perfil` | Registrar en la auditoría una exportación de lista (CSV, Excel o PDF) hecha en la web |
| GET | `/me/accesos` | `auditoria.mis_accesos` | Quién vio mi expediente: fecha, rol y motivo, sin nombres del personal |
| POST | `/cuentas/vinculacion` | `cuenta.vincular` | El paciente pide vincular su cuenta con DUI y fecha de nacimiento |
| GET | `/cuentas/vinculaciones` | `cuentas.verificar` | Vinculaciones pendientes con el expediente que coincide |
| POST | `/cuentas/vinculaciones/{id}/aprobar` | `cuentas.verificar` | Aprobar vinculación tras verificar identidad |
| POST | `/cuentas/vinculaciones/{id}/rechazar` | `cuentas.verificar` | Rechazar vinculación con motivo obligatorio |
| GET | `/publico/ocupacion` | `publico` | Ocupación por planta y tipo, solo agregados |
| GET | `/publico/hospital` | `publico` | Dirección, teléfono y coordenadas del hospital |
| GET | `/publico/medicos-de-turno` | `publico` | Médicos de turno: nombre, especialidad y área |
| GET | `/publico/avisos` | `publico` | Avisos vigentes |
| GET | `/publico/fila/{servicio}` | `publico` | Números llamados hoy con su consultorio, sin nombres |
| GET | `/avisos` | `avisos.publicar` | Avisos recientes con su audiencia, prioridad y estado, para quien los redacta |
| POST | `/avisos` | `avisos.publicar` | Publicar un aviso general con vigencia; advierte si parece llevar datos personales |
| PUT | `/avisos/{id}` | `avisos.publicar` | Editar un aviso vigente o programado: texto, prioridad, audiencia y vigencia (adelantar el fin lo vence antes); auditado |
| POST | `/avisos/{id}/retirar` | `avisos.publicar` | Retirar un aviso antes de tiempo con motivo (D-13); deja de verse en todas partes |
| GET | `/me/avisos` | `sesion.perfil` | Avisos vigentes para mis roles, incluidos los públicos |
| GET | `/metricas/tablero` | `metricas.ver` | Tablero inicial: agregados sin datos personales |
| GET | `/metricas/{indicador}` | `metricas.ver` | Serie diaria de un indicador (ocupacion_diaria, estancia_promedio, tiempo_laboratorio, tiempo_ambulancia, cobertura_turnos) |
| GET | `/ambulancia` | `ambulancia.ver_estado` | Estado de la unidad, servicio activo con hitos y, para despacho, solicitudes por confirmar |
| POST | `/ambulancia/mantenimiento` | `ambulancia.mantenimiento` | Entrar o salir de mantenimiento; salir exige paramédico con turno en curso |
| POST | `/ambulancia/solicitudes` | `ambulancia.solicitar` | Solicitar ambulancia; queda por confirmar (paciente verificado o recepción por teléfono) |
| GET | `/ambulancia/solicitudes/mias` | `ambulancia.solicitar` | Mis solicitudes de ambulancia (últimos 7 días) con su estado y el avance del servicio |
| POST | `/ambulancia/solicitudes/{id}/cancelar` | `ambulancia.solicitar` | Cancelar mi solicitud mientras está por confirmar |
| POST | `/ambulancia/solicitudes/{id}/descartar` | `ambulancia.despachar` | Descartar una solicitud por confirmar con motivo |
| POST | `/ambulancia/servicios` | `ambulancia.despachar` | Despachar: solo si la unidad está Disponible; la pasa a En Servicio en la misma transacción |
| POST | `/ambulancia/servicios/{id}/hitos` | `ambulancia.operar` | Registrar hito en orden: salida, en escena, trasladando, en hospital, finalizado |
| POST | `/ambulancia/servicios/{id}/cerrar` | `ambulancia.mantenimiento` | Cierre administrativo de un servicio activo (Jefatura, con motivo): queda cancelado y la unidad vuelve a Disponible |
| POST | `/ambulancia/servicios/{id}/prehospital` | `ambulancia.reportar_prehospital` | Reporte prehospital; el reenvío con la misma Idempotency-Key no duplica |
| GET | `/ambulancia/servicios/{id}/prehospital` | `ambulancia.recibir_prehospital` | Ver el reporte prehospital; el contenido clínico solo con relación de atención |
| GET | `/ambulancia/llegada` | `ambulancia.recibir_prehospital` | Servicio que llega o llegó sin entrega registrada (para abrir el reporte y marcar recibido) |
| POST | `/ambulancia/servicios/{id}/recepcion` | `ambulancia.recibir_prehospital` | Marcar recibido al paciente en el hospital (personal clínico, después de la llegada; una sola vez) |
| POST | `/ambulancia/ubicacion` | `ambulancia.operar` | Ubicación en vivo de la tripulación; solo con servicio activo |
| GET | `/ambulancia/bitacora` | `ambulancia.ver_bitacora` | Bitácora filtrable (D-056); sin datos del paciente (solo el expediente enmascarado) |

## Anexo B. Matriz completa de permisos por rol

Copia de `docs/arquitectura/datos/permisos.csv` (76 permisos, 10 roles). `✔` = permitido sin restricción adicional; `·` = no permitido; una palabra indica el contexto que la API exige además del permiso: `propio` (solo lo del propio usuario o paciente), `propio_revisado` (lo propio, solo después de la revisión o firma del médico), `relacion` (relación de atención con el paciente), `area` (turno en curso en el área del paciente), `orden` (paciente con orden de laboratorio), `rango` (solo para calcular rangos de referencia), `autor` (solo lo que creó la misma persona), `consumo` y `reactivos` (solo esos movimientos de inventario).

Seis permisos no son el `x-permiso` de ninguna operación. Cinco son de atributo y filtran campos dentro de otros endpoints (`pacientes.ver_nacimiento`, `pacientes.ver_contacto`, `personal.ver_datos_personales`, `turnos.ver_borradores`, `camas.ver_ocupante`); `consulta.corregir` espera el addendum clínico (MA-CIT-04). Los permisos `recursos.*` se retiraron (D-091): el control de recursos del Administrador es inventario + edificio.

| Permiso | ADM | JOP | REC | AST | ENF | MED | LAB | PAR | DPD | PAC |
|---|---|---|---|---|---|---|---|---|---|---|
| `sesion.perfil` | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| `cuenta.vincular` | · | · | · | · | · | · | · | · | · | propio |
| `cuentas.verificar` | · | · | ✔ | · | · | · | · | · | · | · |
| `usuarios.ver` | ✔ | · | · | · | · | · | · | · | ✔ | · |
| `usuarios.invitar` | ✔ | · | · | · | · | · | · | · | · | · |
| `usuarios.asignar_roles` | ✔ | · | · | · | · | · | · | · | · | · |
| `usuarios.desactivar` | ✔ | · | · | · | · | · | · | · | · | · |
| `pacientes.buscar` | · | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | · | · |
| `pacientes.registrar` | · | · | ✔ | · | · | · | · | · | · | · |
| `pacientes.registrar_provisional` | · | · | ✔ | · | ✔ | · | · | ✔ | · | · |
| `pacientes.ver_ficha` | · | ✔ | ✔ | area | area | relacion | orden | relacion | · | propio |
| `pacientes.ver_nacimiento` | · | · | ✔ | ✔ | ✔ | ✔ | rango | ✔ | · | propio |
| `pacientes.ver_contacto` | · | · | ✔ | · | · | ✔ | · | · | · | propio |
| `pacientes.editar_demograficos` | · | · | ✔ | · | · | · | · | · | · | · |
| `pacientes.editar_propios` | · | · | · | · | · | · | · | · | · | propio |
| `pacientes.gestionar_duplicados` | · | ✔ | ✔ | · | · | · | · | · | · | · |
| `expediente.ver` | · | · | · | · | relacion | relacion | · | · | · | propio_revisado |
| `personal.ver` | ✔ | ✔ | · | · | · | · | · | · | · | · |
| `personal.gestionar` | ✔ | · | · | · | · | · | · | · | · | · |
| `personal.ver_datos_personales` | ✔ | · | · | · | · | · | · | · | · | · |
| `turnos.ver` | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | · | · |
| `turnos.planificar` | · | ✔ | · | · | · | · | · | · | · | · |
| `turnos.publicar` | · | ✔ | · | · | · | · | · | · | · | · |
| `turnos.ver_borradores` | ✔ | ✔ | · | · | · | · | · | · | · | · |
| `espacios.ver` | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | · | · | · | · |
| `espacios.configurar` | ✔ | · | · | · | · | · | · | · | · | · |
| `camas.ver_tablero` | · | ✔ | ✔ | · | ✔ | ✔ | · | · | · | · |
| `camas.ver_ocupante` | · | ✔ | ✔ | · | area | relacion | · | · | · | propio |
| `camas.asignar` | · | ✔ | ✔ | · | · | · | · | · | · | · |
| `camas.trasladar` | · | ✔ | ✔ | · | · | · | · | · | · | · |
| `camas.bloquear` | · | ✔ | · | · | · | · | · | · | · | · |
| `camas.registrar_limpieza` | · | ✔ | · | · | ✔ | · | · | · | · | · |
| `camas.verificar_limpieza` | · | ✔ | · | · | ✔ | · | · | · | · | · |
| `fila.emitir` | · | · | ✔ | · | · | · | · | · | · | · |
| `fila.ver` | · | ✔ | ✔ | ✔ | · | ✔ | · | · | · | propio |
| `fila.llamar` | · | · | · | ✔ | · | ✔ | · | · | · | · |
| `fila.gestionar` | · | · | ✔ | ✔ | · | ✔ | · | · | · | · |
| `citas.ver` | · | ✔ | ✔ | ✔ | · | propio | · | · | · | propio |
| `citas.agendar` | · | · | ✔ | · | · | · | · | · | · | · |
| `citas.solicitar` | · | · | · | · | · | · | · | · | · | propio |
| `citas.cancelar` | · | · | ✔ | · | · | · | · | · | · | propio |
| `consulta.iniciar` | · | · | · | · | · | ✔ | · | · | · | · |
| `consulta.registrar` | · | · | · | · | · | relacion | · | · | · | · |
| `consulta.corregir` | · | · | · | · | · | autor | · | · | · | · |
| `signos.registrar` | · | · | · | ✔ | ✔ | ✔ | · | ✔ | · | · |
| `recetas.emitir` | · | · | · | · | · | relacion | · | · | · | · |
| `laboratorio.ordenar` | · | · | · | · | · | relacion | · | · | · | · |
| `laboratorio.ver_cola` | · | · | · | · | · | · | ✔ | · | · | · |
| `laboratorio.procesar` | · | · | · | · | · | · | ✔ | · | · | · |
| `laboratorio.validar` | · | · | · | · | · | · | ✔ | · | · | · |
| `laboratorio.cancelar` | · | · | · | · | · | autor | ✔ | · | · | · |
| `laboratorio.revisar` | · | · | · | · | · | relacion | · | · | · | · |
| `resultados.ver` | · | · | · | · | relacion | relacion | ✔ | · | · | propio_revisado |
| `catalogo.configurar` | ✔ | · | · | · | · | · | · | · | · | · |
| `admision.solicitar` | · | · | · | · | · | relacion | · | · | · | · |
| `admision.crear` | · | ✔ | ✔ | · | · | · | · | · | · | · |
| `admision.autorizar` | · | ✔ | · | · | · | · | · | · | · | · |
| `admision.ver` | · | ✔ | ✔ | · | area | relacion | · | · | · | propio |
| `admision.registrar_salida` | · | · | ✔ | · | ✔ | · | · | · | · | · |
| `alta.firmar` | · | · | · | · | · | relacion | · | · | · | · |
| `enfermeria.registrar` | · | · | · | · | area | · | · | · | · | · |
| `ambulancia.ver_estado` | · | ✔ | ✔ | · | · | ✔ | · | ✔ | · | · |
| `ambulancia.solicitar` | · | · | ✔ | · | · | · | · | · | · | propio |
| `ambulancia.despachar` | · | ✔ | ✔ | · | · | · | · | · | · | · |
| `ambulancia.operar` | · | · | · | · | · | · | · | ✔ | · | · |
| `ambulancia.reportar_prehospital` | · | · | · | · | · | · | · | ✔ | · | · |
| `ambulancia.recibir_prehospital` | · | ✔ | ✔ | · | ✔ | ✔ | · | · | · | · |
| `ambulancia.mantenimiento` | · | ✔ | · | · | · | · | · | · | · | · |
| `ambulancia.ver_bitacora` | · | ✔ | ✔ | · | · | ✔ | · | propio | ✔ | · |
| `auditoria.ver` | · | · | · | · | · | · | · | · | ✔ | · |
| `auditoria.mis_accesos` | · | · | · | · | · | · | · | · | · | propio |
| `inventario.ver` | ✔ | ✔ | · | · | ✔ | · | ✔ | · | · | · |
| `inventario.mover` | · | ✔ | · | · | consumo | · | reactivos | · | · | · |
| `inventario.configurar` | ✔ | ✔ | · | · | · | · | · | · | · | · |
| `avisos.publicar` | · | ✔ | · | · | · | · | · | · | · | · |
| `metricas.ver` | ✔ | ✔ | · | · | · | · | · | · | ✔ | · |
