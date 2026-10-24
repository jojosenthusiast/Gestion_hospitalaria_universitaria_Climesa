# Inventario de pantallas

> Archivo generado por `tools/generar_docs.py` desde `docs/arquitectura/datos/pantallas.csv`. No editar a mano.

Para el equipo de Figma. El avance del 31 de octubre exige el diseño del 100% de las pantallas de iOS, Android y web, con flujos y sistema de diseño (paleta accesible, tipografía, estados de componentes).

Cada pantalla trae: para quién es, qué muestra, qué se puede hacer, qué cambia sola en tiempo real y qué datos deben ocultarse. Las pantallas del paciente y del médico existen en Android e iOS con el mismo contenido (prefijos A e I con el mismo número); se diseñan una vez como componentes y se adaptan a cada plataforma (Material 3 en Android, guías de Apple en iOS).

## Resumen

| Plataforma | Pantallas | Exigidas (R) | Extra (E) |
|---|---|---|---|
| Web | 36 | 33 | 3 |
| Android | 41 | 35 | 6 |
| iOS | 19 | 17 | 2 |

## Estados que toda pantalla debe diseñar

1. **Cargando**: esqueleto del contenido, no un spinner solo.
2. **Vacío**: texto que explica por qué no hay nada y qué hacer.
3. **Error**: qué pasó en lenguaje simple y botón Reintentar.
4. **Sin permiso**: "No tienes acceso a esta información" sin revelar si el dato existe.
5. **Sin conexión**: banda superior "Sin conexión, mostrando lo último guardado"; en la app del paramédico, indicador de envíos en cola.
6. **Actualizado en vivo**: cuando un dato cambia por tiempo real, se resalta brevemente; nunca se mueve la lista bajo el dedo del usuario.
7. **Conflicto**: "Otra persona tomó esta cama, te sugerimos la siguiente" (asignación, despacho, turnos).

## Componentes del sistema de diseño

Estado de cama (libre, ocupada, reservada, limpieza, bloqueada), estado de ambulancia (Disponible, En Servicio, En Mantenimiento), estado de laboratorio (Pendiente, En Proceso, Completado, Cancelado, Revisado), número de fila grande, tarjeta de indicador, fila de tabla con acciones, buscador con motivo de coincidencia, valor de laboratorio con rango y marca alto, bajo o crítico, línea de tiempo de hitos, banda de conexión, insignia de rol, aviso 911. Cada estado se distingue por texto y forma, no solo por color.

## Flujos entre pantallas

El curso pide el mapeo de flujos de todas las pantallas. Estos son los recorridos completos; en Figma cada uno es un prototipo enlazado. Las pantallas A del paciente y del médico tienen su par I en iOS.

| Flujo | Recorrido |
|---|---|
| F01 Cuenta del paciente | A01 Ingreso → A02 Crear cuenta → A03 Vincular expediente → (recepción A33 o W27 aprueba) → A04 Inicio del paciente |
| F02 Fila del día | Recepción A31 o W29 emite → Paciente A05 sigue su número → Asistente A40 llama → Médico A20 Mi día → A21 Consulta → Paciente A08 Historial; pantalla pública W34 muestra el llamado |
| F03 Cita pedida por el paciente | Paciente A06 pide → Recepción W28 o A32 confirma → Paciente A06 ve confirmada → día de la cita: Médico A20 → A21 |
| F04 Consulta y laboratorio | Médico A21 ordena → Laboratorio W20 o A60 cola → A61 muestra → A62 o W21 captura y completa → Médico A23 revisa (crítico avisa antes) → Paciente A07 ve valores |
| F05 Admisión y alta | Médico A24 indica hospitalización → Recepción W13 → W14 sugerencias y cama → Enfermería A50 y A51 → Médico A24 firma alta → salida → Enfermería A52 limpieza y verificación → Jefe W12 cama libre |
| F06 Traslado | Recepción W13 → W15 traslado (no existe para VIP) → W12 tablero actualizado |
| F07 Ambulancia | Paciente A09 pide (o recepción por teléfono en W18) → Despacho W18 confirma y despacha → Paramédico A70 acepta → A71 hitos → A72 reporte prehospital → Emergencia A54 y Médico A25 reciben → Recepción W14 admisión con origen ambulancia → W19 bitácora |
| F08 Turnos | Jefe W16 planificador → W17 turno (traslape rechazado) → publicar con advertencias → Personal A26 o I26 → Pantalla pública W34 médicos de turno |
| F09 Acceso excepcional | Jefe o Admin W31 pide (o Médico desde estado sin permiso en A22) → Delegado W30 aprueba → acceso temporal → Delegado W32 auditoría → Paciente A11 ve el acceso |
| F10 Inventario | Enfermería A53 consumo → alerta en Jefe W03 y W22 → W23 entrada de reposición |
| F11 Administración | Admin W05 usuarios → W06 invitar con roles → persona W02 activa su cuenta → Admin W07 y W08 personal e inscripciones → W09 edificio → W10 catálogo de laboratorio |
| F12 Información pública | Jefe W25 publica aviso → W34 pantalla pública y A10 o I10 en las apps |

## Web

### W01 · Ingreso (R)

- **Para:** Todos los roles web
- **Propósito:** Entrar con correo y contraseña
- **Muestra:** Logo, campos, enlace a recuperar
- **Acciones:** Ingresar; recuperar contraseña
- **Privacidad:** Mensaje de error genérico (no revela si el correo existe)
- **Spec:** 101

### W02 · Activar cuenta (R)

- **Para:** Personal invitado
- **Propósito:** Definir contraseña desde la invitación
- **Muestra:** Nombre, rol asignado
- **Acciones:** Crear contraseña
- **Spec:** 101

### W03 · Tablero inicial (R)

- **Para:** ADM; JOP
- **Propósito:** Vista del día al entrar (dashboard del avance)
- **Muestra:** Ocupación por planta (barras 2.ª y 3.ª), camas en limpieza, estado de la ambulancia, números en fila, órdenes de laboratorio por estado, huecos de cobertura de turnos
- **Acciones:** Ir al detalle de cada tarjeta
- **En vivo:** Todas las tarjetas se actualizan solas
- **Privacidad:** Solo agregados, sin nombres
- **Spec:** 113

### W04 · Inicio de trabajo (R)

- **Para:** REC; LAB; DPD
- **Propósito:** Bandeja de lo que toca hacer
- **Muestra:** REC: vinculaciones, solicitudes de cita y ambulancia, admisiones sin cama. LAB: cola. DPD: accesos por aprobar
- **Acciones:** Abrir cada pendiente
- **En vivo:** Contadores en vivo
- **Spec:** 113

### W05 · Usuarios (R)

- **Para:** ADM
- **Propósito:** Gestionar cuentas
- **Muestra:** Tabla: nombre, correo, roles, estado, último ingreso; filtros
- **Acciones:** Invitar, editar roles, desactivar
- **Privacidad:** No puede editar sus propios roles
- **Spec:** 101

### W06 · Invitar y editar roles (R)

- **Para:** ADM
- **Propósito:** Alta de cuenta de personal
- **Muestra:** Formulario: persona del personal, correo, roles (casillas)
- **Acciones:** Guardar; enviar invitación
- **Spec:** 101

### W07 · Personal de salud (R)

- **Para:** ADM; JOP
- **Propósito:** CRUD de personal (avance)
- **Muestra:** Tabla: nombre, tipo (médico, enfermero, alergista...), especialidad, área, inscripción y vigencia, tiene cuenta
- **Acciones:** Crear, editar, inactivar
- **Privacidad:** Teléfono y DUI del personal solo ADM
- **Spec:** 103

### W08 · Ficha de personal (R)

- **Para:** ADM
- **Propósito:** Detalle y credenciales
- **Muestra:** Datos, inscripciones con vencimiento, turnos próximos
- **Acciones:** Editar; agregar inscripción
- **Spec:** 103

### W09 · Edificio (R)

- **Para:** ADM; JOP; REC
- **Propósito:** Árbol recursivo del hospital
- **Muestra:** Árbol: Hospital > Planta > Área > Habitación > Cama, con conteo disponible en cada nodo; panel de detalle
- **Acciones:** ADM: crear, editar, cambiar capacidad. Otros: solo ver
- **En vivo:** Conteos en vivo
- **Spec:** 104

### W10 · Catálogo de laboratorio (R)

- **Para:** ADM
- **Propósito:** Exámenes y paneles
- **Muestra:** Árbol de paneles (recursivo), unidad, rango por sexo y edad, valores críticos, vigencia
- **Acciones:** Crear, editar con nueva versión
- **Spec:** 107

### W11 · Políticas (E)

- **Para:** ADM
- **Propósito:** Reglas configurables con vigencia
- **Muestra:** Reglas de turnos, cobertura mínima, tiempos de limpieza, umbrales
- **Acciones:** Nueva versión de política
- **Privacidad:** Cambios auditados
- **Spec:** 100

### W12 · Tablero de camas (R)

- **Para:** JOP; REC
- **Propósito:** Ver y operar camas por planta
- **Muestra:** Plano por planta: 2.ª con 6 habitaciones x 2 camas, 3.ª con 5 VIP; estado por color y texto (libre, ocupada, reservada, limpieza, bloqueada); filtro por estado
- **Acciones:** Abrir cama: asignar, bloquear, ver ocupante si tiene permiso
- **En vivo:** Cambia color al instante cuando otra persona asigna
- **Privacidad:** Ocupante enmascarado (iniciales) salvo permiso camas.ver_ocupante
- **Spec:** 104

### W13 · Admisiones (R)

- **Para:** REC; JOP
- **Propósito:** Admisiones activas y pendientes
- **Muestra:** Lista: paciente, origen, tipo pedido, estado, cama, médico tratante, días
- **Acciones:** Nueva admisión; asignar cama; trasladar; registrar salida
- **En vivo:** Nuevas admisiones aparecen solas
- **Spec:** 108

### W14 · Nueva admisión y asignación (R)

- **Para:** REC; JOP
- **Propósito:** Admitir y elegir cama
- **Muestra:** Paso 1 buscar paciente; paso 2 origen, tipo (VIP o semiprivada), aislamiento; paso 3 camas sugeridas con motivo (mismo sexo, cama libre limpia, consolida habitación)
- **Acciones:** Confirmar cama; elegir otra sugerencia
- **En vivo:** Si otra persona toma la cama, la sugerencia se marca y se ofrece la siguiente
- **Spec:** 108

### W15 · Traslado (R)

- **Para:** REC; JOP
- **Propósito:** Mover a otra cama
- **Muestra:** Cama actual, motivo, camas destino válidas
- **Acciones:** Confirmar traslado
- **Privacidad:** VIP no muestra la acción (D-037)
- **Spec:** 108

### W16 · Planificador de turnos (R)

- **Para:** JOP
- **Propósito:** Semana por área
- **Muestra:** Calendario semanal: filas por persona, bloques por turno, franja de cobertura con huecos en rojo
- **Acciones:** Crear, mover, cancelar, publicar
- **En vivo:** Cambios de otro jefe aparecen en vivo
- **Spec:** 103

### W17 · Editar turno (R)

- **Para:** JOP
- **Propósito:** Crear o cambiar un turno
- **Muestra:** Persona, área, inicio, fin, tipo; avisos de descanso y horas semanales
- **Acciones:** Guardar; ver conflicto de traslape
- **Spec:** 103

### W18 · Centro de despacho de ambulancia (R)

- **Para:** REC; JOP
- **Propósito:** Operar el recurso único
- **Muestra:** Estado grande (Disponible, En Servicio, En Mantenimiento), solicitudes por confirmar, servicio activo con hitos y tiempos, reporte prehospital, mapa con ubicación (extra)
- **Acciones:** Confirmar y despachar; descartar; JOP: mantenimiento
- **En vivo:** Todo en vivo; sonido al entrar solicitud
- **Privacidad:** Datos clínicos del prehospital solo a quien recibe al paciente
- **Spec:** 109

### W19 · Bitácora de ambulancia (R)

- **Para:** JOP; REC; DPD
- **Propósito:** Historial filtrable
- **Muestra:** Tabla: fecha, tipo, prioridad, origen, destino, tripulación, tiempos, estado final; filtros D-056
- **Acciones:** Exportar CSV (extra)
- **Privacidad:** Paciente oculto sin relación de atención
- **Spec:** 109

### W20 · Cola de laboratorio (R)

- **Para:** LAB
- **Propósito:** Órdenes por estado
- **Muestra:** Columnas Pendiente, En Proceso, Completado; prioridad; médico; tiempo de espera
- **Acciones:** Tomar muestra; capturar; completar
- **En vivo:** Órdenes nuevas entran solas
- **Spec:** 107

### W21 · Captura de resultados (R)

- **Para:** LAB
- **Propósito:** Valores con rangos
- **Muestra:** Exámenes de la orden, unidad, rango, marca alto, bajo y crítico
- **Acciones:** Guardar; completar
- **Spec:** 107

### W22 · Inventario (R)

- **Para:** JOP; LAB
- **Propósito:** Existencias y alertas
- **Muestra:** Tabla por bodega: artículo, lote, vencimiento, existencia, mínimo; alertas
- **Acciones:** Registrar movimiento; editar mínimo
- **En vivo:** Alerta de mínimo en vivo
- **Spec:** 111

### W23 · Movimiento de inventario (R)

- **Para:** JOP; LAB
- **Propósito:** Entrada, salida, ajuste o traslado
- **Muestra:** Artículo, lote, cantidad, motivo
- **Acciones:** Guardar
- **Spec:** 111

### W24 · Equipo médico (E)

- **Para:** JOP
- **Propósito:** Equipo por espacio
- **Muestra:** Equipo, espacio, estado operativo o mantenimiento
- **Acciones:** Cambiar estado
- **Spec:** 104

### W25 · Avisos generales (R)

- **Para:** JOP
- **Propósito:** Publicar avisos públicos
- **Muestra:** Lista con vigencia
- **Acciones:** Crear, retirar
- **Privacidad:** Son públicos: no poner datos personales
- **Spec:** 112

### W26 · Pacientes (R)

- **Para:** REC
- **Propósito:** Buscar y registrar
- **Muestra:** Buscador (nombre, DUI, expediente) con motivo de coincidencia; ficha
- **Acciones:** Registrar solo tras buscar; editar con motivo
- **Privacidad:** Búsqueda auditada
- **Spec:** 102

### W27 · Vinculaciones por verificar (R)

- **Para:** REC
- **Propósito:** Validar cuentas de pacientes
- **Muestra:** Cuenta, datos que dio, candidato de expediente
- **Acciones:** Aprobar; rechazar con motivo
- **En vivo:** Nuevas entran solas
- **Spec:** 101

### W28 · Citas y solicitudes (R)

- **Para:** REC
- **Propósito:** Agenda y bandeja
- **Muestra:** Agenda por médico y día; solicitudes de pacientes
- **Acciones:** Agendar, confirmar, rechazar, cancelar
- **En vivo:** En vivo
- **Spec:** 105

### W29 · Fila del día (R)

- **Para:** REC
- **Propósito:** Emitir y seguir números
- **Muestra:** Por servicio: números, estado, consultorio
- **Acciones:** Emitir número; marcar no se presentó
- **En vivo:** En vivo
- **Privacidad:** Solo número e iniciales
- **Spec:** 105

### W30 · Accesos excepcionales (R)

- **Para:** DPD
- **Propósito:** Aprobar o negar
- **Muestra:** Solicitud: quién, paciente, motivo, duración
- **Acciones:** Aprobar; negar
- **En vivo:** Nuevas solicitudes en vivo
- **Spec:** 110

### W31 · Solicitar acceso excepcional (R)

- **Para:** ADM; JOP
- **Propósito:** Pedir ver datos clínicos
- **Muestra:** Paciente, motivo, duración
- **Acciones:** Enviar
- **En vivo:** Aviso cuando se aprueba
- **Spec:** 110

### W32 · Auditoría (R)

- **Para:** DPD
- **Propósito:** Buscar y verificar
- **Muestra:** Filtros por persona, paciente, acción, fecha; resultado de verificación de cadena
- **Acciones:** Verificar integridad
- **Spec:** 110

### W33 · Métricas (E)

- **Para:** ADM; JOP; DPD
- **Propósito:** Indicadores detallados
- **Muestra:** Ocupación por día, estancia promedio, tiempos de laboratorio, tiempos de ambulancia, cobertura
- **Acciones:** Cambiar rango
- **Privacidad:** Agregados
- **Spec:** 113

### W34 · Pantalla pública (R)

- **Para:** Público (sin ingreso)
- **Propósito:** Televisor de sala de espera y página pública
- **Muestra:** Ocupación general por planta, médicos de turno, avisos, números llamados por consultorio
- **Acciones:** Ninguna
- **En vivo:** En vivo
- **Privacidad:** Nunca nombres de pacientes
- **Spec:** 112

### W35 · Perfil (R)

- **Para:** Todos
- **Propósito:** Datos propios y sesión
- **Muestra:** Nombre, roles, cambiar contraseña
- **Acciones:** Cerrar sesión
- **Spec:** 101

### W36 · Estados comunes (R)

- **Para:** Todos
- **Propósito:** Sin permiso, sin conexión, error, vacío
- **Muestra:** Mensajes claros en español
- **Acciones:** Reintentar
- **En vivo:** Banda de reconexión
- **Spec:** 120

## Android

### A01 · Ingreso (R)

- **Para:** Todos los roles móviles
- **Propósito:** Entrar
- **Muestra:** Correo, contraseña; enlace Crear cuenta de paciente
- **Acciones:** Ingresar; crear cuenta
- **Spec:** 101

### A02 · Crear cuenta de paciente (R)

- **Para:** PAC
- **Propósito:** Registro (avance)
- **Muestra:** Correo, contraseña, nombre
- **Acciones:** Crear
- **Spec:** 101

### A03 · Vincular expediente (R)

- **Para:** PAC
- **Propósito:** Unir cuenta y expediente
- **Muestra:** DUI, fecha de nacimiento; estado: en verificación, aprobada, rechazada
- **Acciones:** Enviar
- **En vivo:** Cambia sola al aprobarse
- **Privacidad:** Sin aprobar no se ve nada privado
- **Spec:** 101

### A04 · Inicio del paciente (R)

- **Para:** PAC
- **Propósito:** Resumen
- **Muestra:** Mi número de fila (si hay), próxima cita, exámenes, avisos
- **Acciones:** Ir a cada sección
- **En vivo:** En vivo
- **Spec:** 120

### A05 · Mi turno en fila (R)

- **Para:** PAC
- **Propósito:** Seguir mi número
- **Muestra:** Número grande, cuántos faltan, consultorio al ser llamado
- **Acciones:** Ninguna
- **En vivo:** Vibra y avisa al ser llamado
- **Spec:** 105

### A06 · Mis citas (R)

- **Para:** PAC
- **Propósito:** Ver, pedir y cancelar
- **Muestra:** Próximas y pasadas; pedir: médico o especialidad, fecha, horarios libres
- **Acciones:** Pedir; cancelar
- **En vivo:** Confirmación llega en vivo
- **Spec:** 105

### A07 · Mis exámenes (R)

- **Para:** PAC
- **Propósito:** Estado y resultados
- **Muestra:** Lista con estado Pendiente, En Proceso, Completado; detalle con valores y rangos solo si el médico revisó
- **Acciones:** Abrir detalle
- **En vivo:** Estado cambia en vivo
- **Privacidad:** Valores ocultos hasta revisión (D-040)
- **Spec:** 107

### A08 · Mi historial (R)

- **Para:** PAC
- **Propósito:** Consultas pasadas
- **Muestra:** Fecha, médico, diagnósticos, recetas
- **Acciones:** Abrir consulta
- **Privacidad:** Solo lo revisado y propio
- **Spec:** 106

### A09 · Pedir ambulancia (R)

- **Para:** PAC
- **Propósito:** Solicitud y seguimiento
- **Muestra:** Aviso 911 si hay riesgo de vida; ubicación, motivo, teléfono; luego estado: por confirmar, confirmada, en camino, llegó
- **Acciones:** Enviar; cancelar antes de confirmar
- **En vivo:** Estado en vivo
- **Spec:** 109

### A10 · Información del hospital (R)

- **Para:** PAC; todos
- **Propósito:** Datos públicos
- **Muestra:** Ocupación general, médicos de turno, avisos
- **Acciones:** Ninguna
- **En vivo:** En vivo
- **Privacidad:** Solo público
- **Spec:** 112

### A11 · Quién vio mi expediente (E)

- **Para:** PAC
- **Propósito:** Transparencia
- **Muestra:** Fecha, rol, motivo de cada acceso
- **Acciones:** Ninguna
- **Spec:** 110

### A12 · Perfil y notificaciones (R)

- **Para:** Todos
- **Propósito:** Sesión y preferencias
- **Muestra:** Datos, permisos de notificación
- **Acciones:** Cerrar sesión
- **Spec:** 101

### A20 · Mi día (R)

- **Para:** MED
- **Propósito:** Agenda y fila de mi consultorio
- **Muestra:** Citas del día, números asignados, resultados por revisar, hospitalizados
- **Acciones:** Llamar siguiente; abrir paciente
- **En vivo:** En vivo
- **Spec:** 106

### A21 · Consulta (R)

- **Para:** MED
- **Propósito:** Atender
- **Muestra:** Signos (de asistente), motivo, examen, diagnósticos con buscador CIE-10, receta, órdenes de laboratorio (catálogo en árbol)
- **Acciones:** Guardar; firmar
- **Privacidad:** Firma exige inscripción vigente
- **Spec:** 106

### A22 · Expediente (R)

- **Para:** MED
- **Propósito:** Historial del paciente
- **Muestra:** Consultas, diagnósticos, recetas, resultados, hospitalizaciones
- **Acciones:** Pedir acceso excepcional si no es tratante
- **Privacidad:** Acceso auditado
- **Spec:** 106

### A23 · Resultados por revisar (R)

- **Para:** MED
- **Propósito:** Revisar y liberar
- **Muestra:** Lista; críticos arriba en rojo; detalle con rangos
- **Acciones:** Marcar revisado
- **En vivo:** Crítico avisa con push
- **Spec:** 107

### A24 · Mis hospitalizados (R)

- **Para:** MED
- **Propósito:** Seguimiento y alta
- **Muestra:** Pacientes, cama, días; alta con pendientes y responsables
- **Acciones:** Indicar hospitalización; firmar alta
- **Spec:** 108

### A25 · Llegada de ambulancia (E)

- **Para:** MED
- **Propósito:** Reporte prehospital
- **Muestra:** Hora estimada, motivo, signos, prioridad
- **Acciones:** Marcar recibido
- **En vivo:** Llega en vivo y por push
- **Spec:** 109

### A26 · Mis turnos (R)

- **Para:** MED; todos los de personal
- **Propósito:** Horario propio
- **Muestra:** Calendario de mis turnos publicados
- **Acciones:** Ninguna
- **En vivo:** Cambios en vivo
- **Spec:** 103

### A30 · Buscar o registrar paciente (R)

- **Para:** REC
- **Propósito:** Buscar antes de crear
- **Muestra:** Buscador con motivo de coincidencia; formulario de registro
- **Acciones:** Registrar; abrir ficha
- **Privacidad:** Búsqueda auditada
- **Spec:** 102

### A31 · Emitir número de fila (R)

- **Para:** REC
- **Propósito:** Turno del día
- **Muestra:** Servicio, paciente (opcional), número emitido grande
- **Acciones:** Emitir; reimprimir
- **Spec:** 105

### A32 · Citas (R)

- **Para:** REC
- **Propósito:** Agenda y solicitudes
- **Muestra:** Agenda del día por médico; solicitudes
- **Acciones:** Agendar, confirmar, rechazar
- **En vivo:** En vivo
- **Spec:** 105

### A33 · Verificar vinculaciones (R)

- **Para:** REC
- **Propósito:** Aprobar cuentas
- **Muestra:** Datos de la cuenta y candidato
- **Acciones:** Aprobar; rechazar
- **En vivo:** En vivo
- **Spec:** 101

### A34 · Admisión y cama (R)

- **Para:** REC
- **Propósito:** Admitir y asignar
- **Muestra:** Mismo flujo de W14 en móvil
- **Acciones:** Confirmar cama
- **En vivo:** En vivo
- **Spec:** 108

### A35 · Tablero de camas (R)

- **Para:** REC
- **Propósito:** Ver camas
- **Muestra:** Por planta, colores y texto
- **Acciones:** Abrir cama
- **En vivo:** En vivo
- **Privacidad:** Ocupante enmascarado salvo permiso
- **Spec:** 104

### A36 · Despacho de ambulancia (R)

- **Para:** REC
- **Propósito:** Despachar desde el mostrador
- **Muestra:** Estado, solicitudes, servicio activo
- **Acciones:** Confirmar y despachar
- **En vivo:** En vivo
- **Spec:** 109

### A40 · Mi consultorio (R)

- **Para:** AST
- **Propósito:** Mover la fila
- **Muestra:** Números asignados al consultorio y estado
- **Acciones:** Llamar siguiente; no se presentó
- **En vivo:** En vivo
- **Privacidad:** Solo número e iniciales
- **Spec:** 105

### A41 · Signos vitales (R)

- **Para:** AST; ENF
- **Propósito:** Tomar signos
- **Muestra:** PA, FC, FR, temperatura, SatO2, peso, talla; fuera de rango resaltado
- **Acciones:** Guardar
- **Spec:** 106

### A50 · Mi planta (R)

- **Para:** ENF
- **Propósito:** Pacientes del área
- **Muestra:** Camas ocupadas del área, alertas (signos pendientes, resultados críticos)
- **Acciones:** Abrir paciente
- **En vivo:** En vivo
- **Spec:** 108

### A51 · Paciente hospitalizado (E)

- **Para:** ENF
- **Propósito:** Cuidado
- **Muestra:** Signos, notas de enfermería, indicaciones
- **Acciones:** Registrar signos y notas
- **Spec:** 108

### A52 · Limpieza de camas (R)

- **Para:** ENF
- **Propósito:** Liberar camas
- **Muestra:** Camas en limpieza; lista de verificación
- **Acciones:** Registrar limpieza; verificar la de otra persona
- **En vivo:** En vivo
- **Spec:** 104

### A53 · Consumo de insumos (E)

- **Para:** ENF
- **Propósito:** Registrar uso
- **Muestra:** Artículo, cantidad, paciente opcional
- **Acciones:** Guardar
- **Spec:** 111

### A54 · Recepción de ambulancia (E)

- **Para:** ENF
- **Propósito:** Prepararse para la llegada
- **Muestra:** Reporte prehospital, hora estimada
- **Acciones:** Marcar recibido; pasar a admisión
- **En vivo:** En vivo
- **Spec:** 109

### A60 · Cola de laboratorio (R)

- **Para:** LAB
- **Propósito:** Trabajo del día
- **Muestra:** Órdenes por estado
- **Acciones:** Tomar muestra; capturar; completar
- **En vivo:** En vivo
- **Spec:** 107

### A61 · Toma de muestra (R)

- **Para:** LAB
- **Propósito:** Identificar paciente y registrar
- **Muestra:** Paciente, exámenes, confirmación de identidad (dos datos)
- **Acciones:** Confirmar muestra
- **Spec:** 107

### A62 · Captura de resultados (R)

- **Para:** LAB
- **Propósito:** Valores
- **Muestra:** Igual a W21
- **Acciones:** Guardar; completar
- **Spec:** 107

### A70 · Unidad (R)

- **Para:** PAR
- **Propósito:** Estado de la ambulancia
- **Muestra:** Estado grande y servicio asignado
- **Acciones:** Aceptar servicio
- **En vivo:** En vivo con sonido
- **Spec:** 109

### A71 · Servicio en curso (R)

- **Para:** PAR
- **Propósito:** Hitos con botones grandes
- **Muestra:** Salida, en escena, trasladando, en hospital, finalizado; dirección; tiempo transcurrido
- **Acciones:** Avanzar hito; abrir mapa
- **En vivo:** Ubicación enviada en vivo (extra)
- **Spec:** 109

### A72 · Reporte prehospital (E)

- **Para:** PAR
- **Propósito:** Avisar antes de llegar
- **Muestra:** Motivo, signos, prioridad, hora estimada; indicador de enviado o en cola
- **Acciones:** Enviar (se guarda si no hay señal)
- **Spec:** 109

### A73 · Paciente sin identidad (R)

- **Para:** PAR
- **Propósito:** Registrar NN
- **Muestra:** Sexo, edad estimada, señas
- **Acciones:** Crear provisional
- **Privacidad:** No inventa datos
- **Spec:** 102

### A74 · Mi bitácora (R)

- **Para:** PAR
- **Propósito:** Servicios propios
- **Muestra:** Servicios con tiempos
- **Acciones:** Ninguna
- **Spec:** 109

## iOS

### I01 · Ingreso (R)

- **Para:** Todos los roles móviles
- **Propósito:** Entrar
- **Muestra:** Correo, contraseña; enlace Crear cuenta de paciente
- **Acciones:** Ingresar; crear cuenta
- **Spec:** 101

### I02 · Crear cuenta de paciente (R)

- **Para:** PAC
- **Propósito:** Registro (avance)
- **Muestra:** Correo, contraseña, nombre
- **Acciones:** Crear
- **Spec:** 101

### I03 · Vincular expediente (R)

- **Para:** PAC
- **Propósito:** Unir cuenta y expediente
- **Muestra:** DUI, fecha de nacimiento; estado: en verificación, aprobada, rechazada
- **Acciones:** Enviar
- **En vivo:** Cambia sola al aprobarse
- **Privacidad:** Sin aprobar no se ve nada privado
- **Spec:** 101

### I04 · Inicio del paciente (R)

- **Para:** PAC
- **Propósito:** Resumen
- **Muestra:** Mi número de fila (si hay), próxima cita, exámenes, avisos
- **Acciones:** Ir a cada sección
- **En vivo:** En vivo
- **Spec:** 120

### I05 · Mi turno en fila (R)

- **Para:** PAC
- **Propósito:** Seguir mi número
- **Muestra:** Número grande, cuántos faltan, consultorio al ser llamado
- **Acciones:** Ninguna
- **En vivo:** Vibra y avisa al ser llamado
- **Spec:** 105

### I06 · Mis citas (R)

- **Para:** PAC
- **Propósito:** Ver, pedir y cancelar
- **Muestra:** Próximas y pasadas; pedir: médico o especialidad, fecha, horarios libres
- **Acciones:** Pedir; cancelar
- **En vivo:** Confirmación llega en vivo
- **Spec:** 105

### I07 · Mis exámenes (R)

- **Para:** PAC
- **Propósito:** Estado y resultados
- **Muestra:** Lista con estado Pendiente, En Proceso, Completado; detalle con valores y rangos solo si el médico revisó
- **Acciones:** Abrir detalle
- **En vivo:** Estado cambia en vivo
- **Privacidad:** Valores ocultos hasta revisión (D-040)
- **Spec:** 107

### I08 · Mi historial (R)

- **Para:** PAC
- **Propósito:** Consultas pasadas
- **Muestra:** Fecha, médico, diagnósticos, recetas
- **Acciones:** Abrir consulta
- **Privacidad:** Solo lo revisado y propio
- **Spec:** 106

### I09 · Pedir ambulancia (R)

- **Para:** PAC
- **Propósito:** Solicitud y seguimiento
- **Muestra:** Aviso 911 si hay riesgo de vida; ubicación, motivo, teléfono; luego estado: por confirmar, confirmada, en camino, llegó
- **Acciones:** Enviar; cancelar antes de confirmar
- **En vivo:** Estado en vivo
- **Spec:** 109

### I10 · Información del hospital (R)

- **Para:** PAC; todos
- **Propósito:** Datos públicos
- **Muestra:** Ocupación general, médicos de turno, avisos
- **Acciones:** Ninguna
- **En vivo:** En vivo
- **Privacidad:** Solo público
- **Spec:** 112

### I11 · Quién vio mi expediente (E)

- **Para:** PAC
- **Propósito:** Transparencia
- **Muestra:** Fecha, rol, motivo de cada acceso
- **Acciones:** Ninguna
- **Spec:** 110

### I12 · Perfil y notificaciones (R)

- **Para:** Todos
- **Propósito:** Sesión y preferencias
- **Muestra:** Datos, permisos de notificación
- **Acciones:** Cerrar sesión
- **Spec:** 101

### I20 · Mi día (R)

- **Para:** MED
- **Propósito:** Agenda y fila de mi consultorio
- **Muestra:** Citas del día, números asignados, resultados por revisar, hospitalizados
- **Acciones:** Llamar siguiente; abrir paciente
- **En vivo:** En vivo
- **Spec:** 106

### I21 · Consulta (R)

- **Para:** MED
- **Propósito:** Atender
- **Muestra:** Signos (de asistente), motivo, examen, diagnósticos con buscador CIE-10, receta, órdenes de laboratorio (catálogo en árbol)
- **Acciones:** Guardar; firmar
- **Privacidad:** Firma exige inscripción vigente
- **Spec:** 106

### I22 · Expediente (R)

- **Para:** MED
- **Propósito:** Historial del paciente
- **Muestra:** Consultas, diagnósticos, recetas, resultados, hospitalizaciones
- **Acciones:** Pedir acceso excepcional si no es tratante
- **Privacidad:** Acceso auditado
- **Spec:** 106

### I23 · Resultados por revisar (R)

- **Para:** MED
- **Propósito:** Revisar y liberar
- **Muestra:** Lista; críticos arriba en rojo; detalle con rangos
- **Acciones:** Marcar revisado
- **En vivo:** Crítico avisa con push
- **Spec:** 107

### I24 · Mis hospitalizados (R)

- **Para:** MED
- **Propósito:** Seguimiento y alta
- **Muestra:** Pacientes, cama, días; alta con pendientes y responsables
- **Acciones:** Indicar hospitalización; firmar alta
- **Spec:** 108

### I25 · Llegada de ambulancia (E)

- **Para:** MED
- **Propósito:** Reporte prehospital
- **Muestra:** Hora estimada, motivo, signos, prioridad
- **Acciones:** Marcar recibido
- **En vivo:** Llega en vivo y por push
- **Spec:** 109

### I26 · Mis turnos (R)

- **Para:** MED; todos los de personal
- **Propósito:** Horario propio
- **Muestra:** Calendario de mis turnos publicados
- **Acciones:** Ninguna
- **En vivo:** Cambios en vivo
- **Spec:** 103

## Pantallas por rol

| Rol | Web | Android | iOS |
|---|---|---|---|
| Administrador | W01, W03, W05, W06, W07, W08, W09, W10, W11, W31, W33, W35, W36 | no usa | no usa |
| Jefe de Operaciones | W01, W03, W07, W09, W12, W13, W14, W15, W16, W17, W18, W19, W22, W23, W24, W25, W31, W33, W35, W36 | no usa | no usa |
| Recepcionista | W01, W04, W09, W12, W13, W14, W15, W18, W19, W26, W27, W28, W29, W35, W36 | A01, A10, A12, A26, A30, A31, A32, A33, A34, A35, A36 | no usa |
| Asistente | no usa | A01, A10, A12, A26, A40, A41 | no usa |
| Enfermero/a | no usa | A01, A10, A12, A26, A41, A50, A51, A52, A53, A54 | no usa |
| Médico | no usa | A01, A10, A12, A20, A21, A22, A23, A24, A25, A26 | I01, I10, I12, I20, I21, I22, I23, I24, I25, I26 |
| Laboratorista | W01, W04, W20, W21, W22, W23, W35, W36 | A01, A10, A12, A26, A60, A61, A62 | no usa |
| Paramédico | no usa | A01, A10, A12, A26, A70, A71, A72, A73, A74 | no usa |
| Delegado de protección de datos | W01, W04, W19, W30, W32, W33, W35, W36 | no usa | no usa |
| Paciente | no usa | A01, A02, A03, A04, A05, A06, A07, A08, A09, A10, A11, A12 | I01, I02, I03, I04, I05, I06, I07, I08, I09, I10, I11, I12 |
