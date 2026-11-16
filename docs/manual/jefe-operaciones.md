# Manual del Jefe de Operaciones (JOP)

**Plataforma:** web (https://sghu-web.onrender.com). La app Android muestra "Tu rol no usa esta aplicación".
**Qué hace:** opera el día: turnos y asistencia, camas, autorizaciones y cierre de hospitalización, ambulancia, inventario, avisos y métricas. No ve contenido clínico por su rol.

Antes de leer esta página, revisa [lo que vale para todos los roles](README.md#lo-que-vale-para-todos-los-roles).

## Menú

| Módulo | Para qué |
|---|---|
| Inicio | Tablero "Operación del hospital" |
| Pacientes | Buscar pacientes y revisar posibles duplicados |
| Personal | Consultar el personal (solo lectura) |
| Camas | Tablero de camas: bloqueo y limpieza |
| Edificio | Consultar el árbol del edificio |
| Ambulancia | Despacho, cierre administrativo y mantenimiento |
| Bitácora de ambulancia | Historial de servicios |
| Turnos | Planificar, publicar y controlar la asistencia |
| Inventario | Movimientos y configuración |
| Hospitalización | Admisiones y cierre del ciclo |
| Fila del día | Consultar la fila |
| Citas | Consultar las citas |
| Avisos | Publicar, editar y retirar avisos |
| Métricas | Indicadores |
| Perfil | Tu cuenta |

## Inicio

Accesos rápidos: **Nueva admisión**, **Planificar turno**, **Publicar aviso** y **Ver métricas**.

## Turnos

Hay tres vistas: **Semana**, **Lista por día** y **Especialistas de la semana**.

- **Semana** (la vista inicial en computadora) muestra de lunes a domingo un bloque por turno, ubicado por su hora y con el color de su estado: borrador, publicado, en curso, completado, ausente o cancelado (la leyenda está sobre la semana). Una guardia de 24 h se ve en los dos días que toca. Los huecos de cobertura aparecen como bandas rayadas en su día y hora. Toca un bloque para ver el turno y sus acciones.
- **Lista por día** (la vista inicial en el teléfono) agrupa los turnos por el día asignado (Hoy, Mañana, día y fecha) y los ordena por hora de inicio.
- Las flechas cambian de semana; **Esta semana** vuelve a la actual.

### Planificar

- Crea el turno con persona, área y horario. **Guardia 24 h** llena en un clic una guardia de 24 horas (misma hora de inicio y fin) con su tipo.
- El formulario muestra "Carga con este turno". La API rechaza el turno si:
  - se traslapa con otro de la misma persona;
  - deja menos de 8 horas de descanso (12 horas después de un turno de 24 horas);
  - supera 72 horas en 7 días o 6 días seguidos.
- En una emergencia, escribe el **Motivo de la emergencia**: el turno se acepta por encima del límite y queda auditado.
- **Cancelar turno** pide un motivo. Un turno ya iniciado o con citas no se cancela.

### Asistencia

- El estado sigue al reloj: a la hora de inicio el turno pasa solo a **En curso** con la entrada confirmada, y al terminar pasa a **Completado**. Nadie presiona un botón y ya no hay alertas de "sin entrada".
- **Asistencia** registra solo lo que fue distinto, siempre con motivo: una ausencia justificada o injustificada (antes o durante el turno), la hora real de entrada de quien llegó tarde, o deshacer una ausencia equivocada.

- Solo la ausencia saca a la persona del turno. Entonces aparecen **Suplentes disponibles** con **Asignar turno**.

## Camas

- **Bloquear** y **Retirar bloqueo** una cama libre, con motivo.
- **Solicitar limpieza**, **Completar limpieza** y **Verificar limpieza**. La verificación la hace una persona distinta de quien limpió.

## Hospitalización

- **Ingresar paciente** abre el asistente de admisión. Desde la admisión: **Asignar cama**.
- **Autorizar excepción** cuando una admisión necesita autorización.
- **Cancelar admisión:** para una admisión que todavía espera cama. Pide un motivo.
- **Anular ingreso por error:** para un paciente hospitalizado por error. Cierra la ocupación y envía la cama a limpieza. Pide un motivo.
- **Solicitar alta al médico tratante:** al médico le llega un aviso en vivo. Solo el médico firma el alta, desde su app.
- **Reasignar médico tratante**, con motivo.
- **Revocar alta**, con motivo, mientras el paciente no haya salido.
- **Trasladar** a otra cama.
- Nada se borra: cancelar y anular dejan la admisión `cancelada` con autor, fecha y motivo.

## Ambulancia

- **Solicitudes:** **Confirmar y despachar** o **Descartar**.
- **Despachar traslado sin solicitud:** para un traslado que no vino de una solicitud.
- **Tripulación:** al despachar eliges paramédico y motorista entre quienes tienen turno; la propuesta viene llena.
  - El despacho se rechaza si el paramédico no tiene cuenta en la app o si falta motorista de turno.
  - Si falta personal, la pantalla ofrece **Planificar turno**.
- **Cierre administrativo → Cerrar servicio:** cierra un servicio activo cuando la tripulación no puede hacerlo. Pide un motivo; el servicio termina `Cancelado` y la unidad vuelve a `Disponible`.
- **Poner en mantenimiento** y **Sacar de mantenimiento:** solo sin servicio activo.
- **Ver reporte prehospital.** La entrega del paciente en el hospital la marcan ENF o MED desde la app; la web la muestra como "Paciente recibido por …".

## Bitácora de ambulancia

Vista de **Tarjetas** o **Tabla**, filtros (incluido "Estado final"), **Quitar filtros** y **Exportar**. Los estados finales posibles son Completado, Cancelado, Sin traslado, Paciente rechaza traslado, Paciente fallecido y Desviado a otro centro.

## Inventario

**Registrar movimiento** (entradas, salidas, ajustes y traslados de todas las categorías), **Nuevo artículo**, **Editar artículo**, **Nuevo lote** y mínimos. Al bajar del mínimo aparece una alerta en vivo.

## Avisos

- **Publicar aviso**, para el público o para roles internos.
- **Editar → Guardar cambios**. Si otra persona lo cambió antes, la web te pide volver a cargarlo.
- **Retirar → Retirar aviso**, con un motivo de 10 caracteres o más. Un aviso retirado desaparece de `/publico` y ya no se puede cambiar.

## Pacientes, Fila del día y Citas

- En **Pacientes** buscas pacientes y revisas los posibles duplicados.
- **Fila del día** y **Citas** son de consulta para ti; las operan Recepción y el consultorio.

## Métricas

Igual que el administrador: indicador, rango de días, **Exportar** y **Exportar todo**.
