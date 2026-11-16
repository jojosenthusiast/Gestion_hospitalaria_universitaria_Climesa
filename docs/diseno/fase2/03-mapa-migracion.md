# Fase 2 · Etapa 3: mapa de migración

Entregable fijo de la etapa 3 (`redesign-existing-projects`). Cada pantalla existente (fuente:
`docs/arquitectura/datos/pantallas.csv` y el mapa L3 de `odd/tasks/fase2-frontend.md`) queda asignada a un patrón de
`02-sistema.md`. Las pantallas W40 a W57 (nivel F) y A60 a A62 (retiradas) no se migran.

**Ya aplicado en toda la web (lote 1, T04):** barra compacta en lugar de título + descripción, esqueletos en lugar de
"Cargando información…", caché con revalidación, división por ruta, una sola pantalla de arranque, `Tag` con ícono +
etiqueta + patrón, tokens de área, estado y prioridad. Riesgo de romper: el texto de las descripciones desapareció
(no había reglas de negocio en ellas); el alcance del inventario pasó a la ruta compacta.

Riesgo: **alto** = cambia un flujo con reglas del servidor o datos clínicos; **medio** = cambia la disposición de una
pantalla con acciones; **bajo** = solo aplica componentes comunes.

## Web (ADM, JOP, REC, LAB, DPD)

| Código | Pantalla (módulo) | Roles | Patrón | Se quita | Se conserva | Riesgo | Lote |
|---|---|---|---|---|---|---|---|
| W03, W04 | Inicio por rol (`inicio`) | todos | Panel del día | avisos generales dentro del inicio (solo queda lo crítico del rol), bloques decorativos | contadores por rol, accesos rápidos, `PanelState` por tarjeta | medio | 3 (T08) |
| W05, W06 | Usuarios / invitar (`personal`) | ADM | Lista + detalle | encabezado doble | invitación, roles, estado de cuenta | bajo | 3 (T10) |
| W07, W08 | Personal y ficha (`personal`) | ADM, JOP | Lista + detalle | filtros duplicados fuera de la barra | ficha, inscripciones, turnos próximos | bajo | 3 (T10) |
| W09 | Edificio (`espacios`) | ADM, JOP, REC | Tablero (cuadrícula por planta) | colores de estado propios del plano | estructura, bloqueo, limpieza | medio | 3 (T10) |
| W10 | Catálogo de laboratorio (`catalogo-laboratorio`) | ADM | Lista + detalle | — | rangos y paneles | bajo | 3 (T10) |
| W12 | Tablero de camas (`camas`) | JOP, REC | Tablero (área como tinte, estado como patrón) | punto de color como único indicador | asignar, bloquear, limpieza, mapa | medio | 2 (T06) |
| W13, W14, W15 | Admisiones, nueva admisión, traslado (`hospitalizacion`) | REC, JOP | Lista + detalle / Formulario por pasos | pasos repetidos | sugerencia de cama, médico tratante, alta | alto | 3 (T10) |
| W16, W17 | Turnos: calendario, lista, editar (`turnos`) | JOP | Tablero (calendario) + Lista + Formulario | orden con días pasados arriba | vista Semana y Lista (#122), reglas de descanso y carga | alto | 2 (T09) |
| W18 | Despacho de ambulancia (`ambulancia`) | REC, JOP | Tablero | — | unidad única, tripulación, servicio en curso | medio | 3 (T10) |
| W19 | Bitácora de ambulancia (`bitacora-ambulancia`) | JOP, REC, DPD | Lista + detalle | — | filtros, exportación | bajo | 3 (T10) |
| W20, W21 | Cola y resultados de laboratorio (`laboratorio`) | LAB | Tablero (cola agrupada) + Formulario | densidad de la tabla única | pasos de la orden, liberación, crítico del servidor | alto | 2 (T07) |
| W22, W23 | Inventario y movimiento (`inventario`) | JOP, LAB | Lista + detalle / Formulario | — | lotes, vencimiento, alcance por categoría | bajo | 3 (T10) |
| W24 | Equipo médico | JOP | Lista + detalle | — | — (no hay módulo propio hoy) | bajo | 3 (T10) |
| W25 | Avisos generales (`avisos`) | JOP | Bandeja de pendientes + Formulario | avisos en el inicio | audiencia, vigencia, editar y retirar | medio | 3 (T08) |
| W26 | Pacientes (`pacientes`) | REC | Lista + detalle | — | buscar primero, registro, duplicados | bajo | 3 (T10) |
| W27 | Vinculaciones (`vinculaciones`) | REC | Bandeja de pendientes | — | coincidencia de datos, aprobar, rechazar con motivo | bajo | 3 (T10) |
| W28 | Citas y solicitudes (`citas`) | REC | Bandeja (solicitudes) + Lista (agenda) | médico obligatorio en la solicitud | horarios, cancelar, reprogramar | alto | 2 (T05) |
| W29 | Fila del día (`fila`) | REC | Tablero (fila arriba, kanban abajo) | lista plana sin estados | emitir, llamar siguiente (#124), atender | alto | 2 (T06) |
| W32 | Auditoría (`auditoria`) | DPD | Lista + detalle | — | filtros, cajón de detalle, lectura auditada | bajo | 3 (T10) |
| W33 | Métricas (`metricas`) | ADM, JOP, DPD | Panel del día (indicadores) | números gigantes con tarjetas idénticas | exportación, datos agregados | bajo | 3 (T10) |
| W34 | Pantalla pública | público | Tablero (solo lectura) | — | avisos públicos, números llamados | medio | 2 (T06) |
| W35 | Perfil (`perfil`) | todos | Formulario | — | cambio de contraseña | bajo | hecho (T04) |
| W36 | Estados comunes | todos | (todos) | spinner de bloque | 8 estados de diseño 04 | bajo | hecho (T04) |
| — | Mi consultorio (`consultas`) | quien tenga `consulta.iniciar` | Panel del día | — | agenda propia, cierre clínico | alto | 2 (T06) |

## Android

| Código | Pantalla | Roles | Patrón | Se quita | Se conserva | Riesgo | Lote |
|---|---|---|---|---|---|---|---|
| A04 | Inicio del paciente | PAC | Panel del día | — | turno, próxima cita, avisos críticos | medio | 3 (T10) |
| A05 | Mi turno en fila | PAC | Panel del día | — | número grande con área | medio | 2 (T06) |
| A06 | Mis citas (solicitud) | PAC | Lista + Formulario | combo de 45 médicos (`PatientAppointmentsScreen.kt:170`) | franja preferida, nota | alto | 2 (T05) |
| A07, A08 | Mis exámenes, mi historial | PAC | Lista + detalle | — | resultados liberados | bajo | 3 (T10) |
| A09 | Pedir ambulancia | PAC | Formulario | — | ubicación, confirmación | medio | 3 (T10) |
| A10, A11, A12, A13 | Información, quién vio mi expediente, perfil, mi cuenta | PAC, todos | Lista / Formulario | — | — | bajo | 3 (T10) |
| A20, A21, A22 | Mi día, consulta, expediente | MED | Panel del día / Formulario / Lista + detalle | — | consulta → procedimientos → receta o exámenes → cierre | alto | 2 (T06) |
| A23 | Resultados por revisar | MED | Bandeja de pendientes | búsqueda en el expediente | crítico del servidor | alto | 2 (T07) |
| A24, A25, A26 | Hospitalizados, llegada de ambulancia, mis turnos | MED, personal | Lista / Panel del día | — | — | medio | 3 (T10) |
| A30 a A36 | Funciones de REC en móvil | REC | Lista + detalle / Tablero / Formulario | — | mismas reglas que web | medio | 3 (T10) |
| A40, A41 | Consultorio y signos vitales | AST, ENF | Panel del día / Formulario | — | — | medio | 3 (T10) |
| A50 a A54 | Mi planta, paciente, limpieza, insumos, recepción | ENF | Panel del día / Bandeja / Formulario | — | — | medio | 3 (T10) |
| A70 a A74 | Unidad, servicio, reporte, sin identidad, bitácora | PAR | Panel del día / Formulario / Lista | — | — | medio | 3 (T10) |

## iOS

| Código | Pantalla | Roles | Patrón | Se quita | Se conserva | Riesgo | Lote |
|---|---|---|---|---|---|---|---|
| I04, I05 | Inicio del paciente, mi turno | PAC | Panel del día | títulos grandes | turno con área | medio | 2-3 |
| I06 | Mis citas (solicitud) | PAC | Lista + Formulario | selector plano de médicos (`PatientViews.swift:411`) | franja, nota | alto | 2 (T05) |
| I07 a I13 | Exámenes, historial, ambulancia, información, auditoría propia, perfil, mi cuenta | PAC, todos | Lista / Formulario | — | — | bajo | 3 (T10) |
| I20 a I26 | Mi día, consulta, expediente, resultados por revisar, hospitalizados, ambulancia, turnos | MED | igual que A20 a A26 | — | — | alto | 2 (T06, T07) |

En iOS también cambia la tipografía (DMSans pasa a Atkinson): riesgo medio de recortes con Dynamic Type; se revisa
en cada pantalla migrada.

## Orden de lotes

1. **Lote 1 (T04, este):** tokens, componentes, barra compacta, protocolo de carga en toda la web. Tabla de tokens lista
   para móvil (`02-sistema.md`, sección 7).
2. **Lote 1b (móvil):** un escritor aplica los tokens de la sección 7 en Android (`ui/theme/*`) e iOS
   (`DesignSystem/Theme.swift`, fuentes Atkinson), sin rediseñar pantallas.
3. **Lote 2 en paralelo (cada uno con su API):** T05 citas (W28, A06, I06), T06 fila + tablero + consulta (W29, W12, W34,
   A05, A20 a A22, I05, I20 a I22), T07 laboratorio (W20, W21, A23, I23), T09 turnos (W16, W17).
4. **Lote 3:** T08 avisos (W25, inicio W03/W04), T10 resto por rol (todas las filas marcadas "3 (T10)"), T11 semilla a
   escala, T12 documentación.

Regla para los lotes 2 y 3: usan los patrones y tokens tal como están; si necesitan uno nuevo, lo piden al orquestador
como "propuesta de cambio".
