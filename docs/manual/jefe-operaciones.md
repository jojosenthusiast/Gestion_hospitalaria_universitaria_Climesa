# Manual del Jefe de Operaciones (JOP)

**Plataforma:** web (https://sghu-web.onrender.com). La app Android muestra "Tu rol no usa esta aplicación".
**Qué hace:** opera el día: turnos y asistencia, camas, autorizaciones y cierre de hospitalización, ambulancia, inventario, avisos y métricas. No ve contenido clínico por su rol.

Antes de leer esta página, revisa [lo que vale para todos los roles](README.md#lo-que-vale-para-todos-los-roles).

## Menú

| Módulo | Para qué |
|---|---|
| Inicio | Tablero "Operación del hospital" |
| Pacientes | Buscar pacientes y revisar posibles duplicados |
| Personal | Consultar el personal y quién está de turno hoy (solo lectura) |
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
- **Lista por día** (la vista inicial en el teléfono) sirve para revisar: empieza por **Hoy** y los días que vienen, con los turnos ordenados por hora de inicio. Los días pasados de la semana quedan plegados al final en **Días anteriores de esta semana**, el más reciente primero.
- En **Semana**, **Toda la semana** y **Día** cambian la escala: **Día** muestra un solo día más ancho y los botones con el día de la semana eligen cuál.
- Las flechas cambian de semana; **Esta semana** vuelve a la actual.

### Planificar

- Crea el turno con persona, área y horario. **Guardia 24 h** llena en un clic una guardia de 24 horas (misma hora de inicio y fin) con su tipo.
- El formulario muestra "Carga con este turno". La API rechaza el turno si:
  - se traslapa con otro de la misma persona;
  - deja menos de 8 horas de descanso (12 horas después de un turno de 24 horas);
  - supera 72 horas en 7 días o 6 días seguidos.
- En una emergencia, escribe el **Motivo de la emergencia**: el turno se acepta por encima del límite y queda auditado.
- **Cancelar turno** pide un motivo. Un turno ya iniciado o con citas no se cancela.

### Planificar en el calendario

- **Crear:** haz clic en una hora de un día (propone 8 horas desde ahí) o arrastra sobre las horas para marcar el tramo. Sin ratón, usa el botón **+** de cada día ("Asignar turno el …"). Se abre **Asignar turno** con la fecha y la hora puestas.
- **Mover y estirar:** arrastra un bloque a otra hora u otro día; el borde inferior lo alarga o acorta. Con el teclado, sobre el bloque: **Alt + ↑/↓** lo mueve 30 minutos, **Alt + ←/→** lo cambia de día y **Alt + Mayús + ↑/↓** mueve la hora de fin. También puedes abrir el turno y usar **Editar**.
- Cada cambio lo valida la API con las mismas reglas de un turno suelto (descanso, tope de 7 días, ausencias). Si lo rechaza, el bloque se queda donde estaba y el motivo aparece arriba del calendario.
- Un **borrador** se mueve sin pedir motivo. Un turno **publicado** abre **Mover turno** con el horario de antes y el de después, y pide el **Motivo del cambio**.
- **Deshacer** devuelve el último movimiento a su horario anterior.
- Al crear o mover, la semana se queda donde estaba y el turno queda resaltado.
- Los huecos de cobertura se ven como bandas rayadas en su día y hora.

### Planificar la semana en lote

Todo lote termina en **Vista previa de los borradores**. Ahí cada turno muestra **Sin conflictos** o el mismo motivo que daría un turno suelto. Puedes **Quitar** un turno o cambiar la persona y luego **Validar de nuevo**. **Crear N borradores** se activa solo cuando ningún turno tiene conflicto. Se crean todos o ninguno.

- **Generar rotación:** elige el área, las personas (o una función para usar a todo su grupo del área), el patrón y las fechas (hasta 31 días). Los patrones son:
  - **Mañana, tarde y noche rotativo:** 8 horas; 5 días de trabajo y 2 de descanso.
  - **12 h de trabajo y 36 h de descanso.**
  - **Guardia 24 h con 72 h de descanso.**
  - **Personalizado:** horas por turno, días de trabajo y de descanso.

  El sistema reparte las vueltas respetando el descanso mínimo, el tope de 7 días y la cobertura. Si alguien no puede un día, propone a otra persona del grupo y lo indica con "Reemplaza a …".
- **Copiar semana anterior:** repite los turnos de la semana pasada siete días después, sin los cancelados ni las ausencias. Si hay un área filtrada, copia solo esa área.
- **Asignación masiva:** el mismo horario a varias personas en uno o más días. Si la hora de fin es anterior a la de inicio, el turno termina al día siguiente.
- **Plantillas:** **Guardar esta semana como plantilla** guarda los turnos de un área con un nombre. **Aplicar** lleva una plantilla a la semana que estás viendo. **Retirar** la quita de la lista.
- Si un turno supera 44 horas diurnas en la semana, la vista previa pide la justificación antes de crear.

### Publicar semana

- Los borradores no los ve el personal: no salen en **Mis turnos** ni en su calendario.
- **Publicar semana (N borradores)** aparece cuando la semana tiene borradores. Si hay un área filtrada, publica solo esa área.
- Se publican todos o ninguno. Al publicar, la base vuelve a revisar el descanso y el tope de horas de cada persona.
- Si quedan huecos de cobertura, el aviso los cuenta.

### Asistencia

- El estado sigue al reloj: a la hora de inicio el turno pasa solo a **En curso** con la entrada confirmada, y al terminar pasa a **Completado**. Nadie presiona un botón y ya no hay alertas de "sin entrada". Los turnos que empezaron antes de este cambio y no tenían entrada se muestran como **Sin registro de entrada**; no se confirman hacia atrás.
- **Asistencia** registra solo lo que fue distinto, siempre con motivo: una ausencia justificada o injustificada (antes o durante el turno), la hora real de entrada de quien llegó tarde, o deshacer una ausencia equivocada.
- La **Lista por día** muestra todos los días de la semana. Un turno de noche o una guardia de 24 h aparece también en el día al que llega, marcado **Viene del día anterior**. Cuando un turno empieza, la pantalla deja de ofrecer editarlo o cancelarlo.

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

## Personal

Consulta del directorio, sin cambios. Filtros: **Mostrar** (personal activo, inactivo o todo el directorio), **Filtrar por función**, **Área** (incluye "Sin área asignada") y **Turno de hoy**: De turno ahora, Turno más tarde, Ausentes o Libres, cada uno con su conteo. Cada persona activa muestra en la lista su turno de hoy. El turno de hoy lo calcula la API con los turnos del día local.

## Pacientes, Fila del día y Citas

- En **Pacientes** buscas pacientes y revisas los posibles duplicados. La lista se filtra en el servidor:
  - **Expediente:** Vigentes (por omisión), Provisionales, Inactivos o Todos.
  - **Hoy:** Hospitalizados, Esperan cama, Con alta firmada, En la fila de hoy o Con cita hoy.
  - **Área de la cama:** pacientes que ocupan ahora una cama en esa área (o en una habitación dentro de ella).
  - **Médico tratante:** pacientes con una admisión activa a cargo de ese médico.
- **Fila del día** y **Citas** son de consulta para ti; las operan Recepción y el consultorio.

## Métricas

Igual que el administrador: indicador, rango de días, **Exportar** y **Exportar todo**.
