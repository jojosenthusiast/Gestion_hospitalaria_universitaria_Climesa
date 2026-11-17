# Manual del Recepcionista (REC)

**Plataformas:** web (https://sghu-web.onrender.com) y app Android.
**Qué hace:** registra y verifica pacientes, maneja la fila del día y las citas, aprueba vinculaciones de cuenta, crea admisiones con su cama, registra la salida física y despacha la ambulancia.

Antes de leer esta página, revisa [lo que vale para todos los roles](README.md#lo-que-vale-para-todos-los-roles).

## Web

### Menú

Inicio, Pacientes, Vinculaciones, Camas, Edificio, Ambulancia, Bitácora de ambulancia, Turnos, Hospitalización, Fila del día, Citas, Avisos y Perfil.

**Avisos**: tus avisos, con los críticos primero, y **Enterado**. Un aviso crítico para Recepción sale arriba en Inicio hasta que pulsas **Enterado** (ver `README.md`, "Avisos").

### Inicio

Accesos rápidos: **Registrar paciente**, **Agendar cita**, **Emitir número**, **Llamar siguiente** y **Solicitar ambulancia**. **Emitir número** abre directamente el formulario de la fila.

**Citas de seguimiento por confirmar.** Cuando se completan los exámenes de una consulta, el sistema propone una cita con el médico que los pidió. Ves el paciente, el médico y la fecha de los resultados, nunca los exámenes ni los valores.

1. **Agendar cita**: elige el día (por defecto, dentro de una semana) y una de las horas libres del médico. **Confirmar cita** agenda la cita como siempre y la enlaza a la propuesta.
2. Si la cita quedó agendada pero no se pudo enlazar, pulsa **Enlazar la cita**: no se agenda otra.
3. **Descartar**: escribe el motivo (10 caracteres o más), por ejemplo que el paciente ya tiene control agendado.

### Pacientes

- Busca siempre antes de registrar: por nombre (también por sonido), DUI o expediente.
- Filtros de la lista: **Expediente** (Vigentes, Provisionales, Inactivos o Todos), **Hoy** (Hospitalizados, Esperan cama, Con alta firmada, En la fila de hoy o Con cita hoy), **Área de la cama** y **Médico tratante**. Quedan en la dirección de la página; lo que escribes en la búsqueda no.
- **Registrar paciente** abre un solo formulario: arriba la búsqueda y abajo los datos. Lo que buscas se copia a los campos vacíos y el aviso dice cuáles llenó. Si no buscaste, el sistema busca al registrar; si encuentra expedientes parecidos, se detiene para que los revises y el segundo clic registra. Si detecta un posible duplicado, lo avisa. Solo si es otra persona, regístrala con el botón que lo confirma.
- **Editar datos** corrige los datos personales con motivo; el historial guarda la versión anterior.
- Ves datos personales y de contacto, nunca diagnósticos ni resultados.

### Vinculaciones

Un paciente que creó su cuenta en la app pide vincularla a su expediente con su DUI y su fecha de nacimiento.

- Revisa que la solicitud corresponda a la persona y apruébala, o usa **Rechazar con motivo** → **Rechazar solicitud**.
- Una solicitud ya resuelta no se puede volver a resolver.

### Citas

- **Solicitudes por asignar** (arriba de la agenda): los pacientes piden cita por motivo (por ejemplo "Piel" o
  "Corazón y presión"), con su franja preferida (mañana, tarde o cualquier hora) y una nota. No eligen médico. La
  bandeja muestra primero las más antiguas, con el expediente, la nota y, si lo dijo, el médico que prefiere.
  - **Asignar** abre la asignación en la misma fila, ya prellenada: el médico que prefiere el paciente o el primero con
    turno de las especialidades sugeridas, y la primera franja libre de 20 minutos dentro de la franja pedida. Puedes
    cambiar fecha, médico o franja (**Ver todo el día**) y luego **Confirmar cita**. Se crea una cita confirmada con las
    reglas de siempre (franja de la jornada del médico, sin traslapes) y el paciente la ve en su app.
  - **Rechazar** pide un motivo de 10 caracteres o más; el paciente lo ve.
  - Bandeja vacía: "Al día: no hay solicitudes por asignar". El inicio también las muestra en **Requiere tu atención**.
- **Agendar cita** crea una cita de 20 minutos, ya confirmada, en una franja libre del médico.
- Las solicitudes de los pacientes llegan en vivo. Para cada cita, la fila muestra solo las acciones permitidas:
  - **Confirmar** o **Rechazar** una solicitud.
  - **Reprogramar**: aplica el cambio de inmediato. La cita original queda `reprogramada` y enlazada a la nueva. Máximo 2 reprogramaciones por cadena.
  - **Aceptar nuevo horario** o **Rechazar nuevo horario**: cuando el paciente pidió el cambio.
  - **Cancelar**.
  - **No asistió**: solo desde la hora de inicio y si no hubo consulta.
- Las solicitudes cuya hora ya pasó quedan `Vencidas` solas; el sistema hace ese barrido cada minuto.

### Fila del día

- **Emitir número** para un paciente y un servicio, con su **prioridad** (Rutina, Urgente o Emergencia; por omisión Rutina). El número cuenta desde 1 en cada área y se muestra grande junto al código del área: **CON 7** (consulta general), **EMG** (emergencia), **LAB** (laboratorio), **REC** (admisiones).
- Cada tarjeta dice si el paciente tiene cita hoy (**Cita 10:30**) o llegó sin cita (**Sin cita**), y muestra la prioridad cuando no es rutina.
- Arriba está la fila y abajo el tablero por estado: **En espera**, **Llamados**, **En atención** y **Terminados**.
- Elige un área: el recuadro **Quién pasa después** muestra el número propuesto, el paciente y el motivo. **Llamar siguiente** llama exactamente a ese número; si eliges un **Consultorio**, el número queda llamado hacia ese consultorio. La regla es fija y la decide el servidor: *emergencias primero; luego urgentes; luego citas dentro de su ventana (de 15 min antes a 15 min después de la hora, por hora de cita); luego el resto en orden de llegada (número del área).*
- Mueve una tarjeta arrastrándola a otra columna o, sin arrastrar, con su menú **Mover o cambiar prioridad** (sirve con teclado y en el celular). Solo aparecen los cambios que el servidor acepta ahora; si sueltas una tarjeta donde no se puede, el tablero explica por qué y no cambia nada. El menú también cambia la prioridad mientras el número espera o está llamado.
- Después de llamar aparece **Llamaste CON 7.** con **Deshacer**: el número vuelve a la espera (si ya tenía otros llamados, solo se resta uno). Un número llamado una sola vez también vuelve a **En espera** arrastrándolo o desde su menú; con 2 o más llamados el menú ofrece **Quitar un llamado**, que resta uno y lo deja en **Llamados**. Lo demás no se deshace: iniciar la atención, completar y "no se presentó" son definitivos.
- Un número en espera se llama antes de atenderlo. En cada número: **Llamar** o **Llamar de nuevo**, **Iniciar atención** y **Completar**.
- **No se presentó** aparece solo después de los llamados exigidos (3 por omisión).
- Al día siguiente, el sistema cierra solo los números que quedaron abiertos.

### Hospitalización

- **Ingresar paciente** abre el asistente de admisión: paciente, origen y motivo, fecha y médico, habitación (categoría, requisitos y visitas en un paso), cama y resumen. Sin permiso de cama o con ingreso para más adelante no aparece el paso de cama.
- **Asignar cama** muestra de una vez las camas que sugiere la API (sexo de la habitación, aislamiento), con la primera ya elegida. Con excepción autorizada se ven las dos categorías, la solicitada primero.
- Si otra persona toma la misma cama al mismo tiempo, una asignación gana y la otra recibe el aviso de que la cama ya no está libre: elige otra.
- **Cancelar admisión**, con motivo, mientras espera cama.
- **Solicitar alta al médico tratante**: el médico firma el alta desde su app.
- **Registrar salida** aparece cuando el alta está firmada. El formulario "Registrar salida física" muestra cuántos pendientes tiene el alta, sin su contenido clínico. La cama pasa a limpieza.
- **Trasladar** a otra cama.

### Camas y Edificio

Consulta del tablero de camas y del árbol del edificio. El bloqueo y la limpieza los hacen JOP y ENF.

### Ambulancia

- **Registrar llamada**: crea una solicitud a nombre de quien llama. **Solicitar ambulancia** del inicio la abre directamente. Si la llamada es por un paciente con expediente, elígelo en **Paciente · opcional**: se copian quien llama, el teléfono y la dirección a los campos vacíos, y el aviso dice cuáles.
- **Confirmar y despachar** o **Descartar** una solicitud. Al despachar eliges paramédico y motorista de turno; la propuesta viene llena. El despacho se rechaza si el paramédico no tiene cuenta en la app o si falta motorista.
- **Ver reporte prehospital**.

### Bitácora de ambulancia y Turnos

Consulta de los servicios y de la planificación de turnos.

## Android

### Secciones

Inicio, Avisos, Fila del día, Pacientes, Citas, Vinculaciones, Admisión y cama, Tablero de camas, Despacho, Mis turnos, Hospital y Perfil. La barra inferior muestra Inicio y tres tareas; el resto está en **Más**. **Avisos** funciona igual que en la web; un aviso crítico para Recepción sale arriba en Inicio hasta que das **Enterado** (ver `README.md`, "Avisos").

| Sección | Qué haces |
|---|---|
| Fila del día | **Emitir número** → eliges el servicio, buscas y eliges al **paciente** (obligatorio) y la **Prioridad** → **Emitir**. Debajo está la fila; al elegir un servicio aparece **Quién pasa después** (Calculando…, el número propuesto o "Nadie espera") con **Llamar siguiente**, donde puedes elegir el **Consultorio** (opcional) para que el paciente vea a dónde pasar. Después de llamar aparece **Deshacer**. En cada número, **Mover o cambiar prioridad** ofrece solo los cambios que acepta el servidor. Cada número muestra su área (**CON 7**), su prioridad, **Cita** o **Sin cita** y la espera |
| Pacientes | **Buscar paciente** y registrar después de buscar |
| Citas | **Solicitudes por asignar**: **Asignar** (médico y franja ya prellenados; **Ver todo el día** si no hay libres en la franja pedida) → **Confirmar cita**, o **Rechazar** con motivo. **Agendar cita** → **Confirmar cita**. **Citas de seguimiento por confirmar**: **Agendar cita** (eliges día y hora libre del médico que pidió los exámenes) → **Confirmar cita**, o **Descartar** con motivo de al menos 10 caracteres. En cada cita: **Confirmar**, **Rechazar**, **Reprogramar**, **Cancelar cita**, **No asistió**, **Aceptar nuevo horario**, **Rechazar nuevo horario**, según lo que permita el servidor |
| Vinculaciones | **Aprobar**, **Rechazar con motivo** |
| Admisión y cama | **Ingresar paciente**, **Asignar cama** → **Confirmar cama**, **Cancelar admisión**. Si el origen, el médico tratante o la categoría tienen una sola opción, la app la elige y lo dice ("Elegimos por ti … porque solo había una opción") |
| Tablero de camas | Estado de las camas |
| Despacho | **Confirmar y despachar** o **Descartar** (con motivo). En el despacho eliges tipo (emergencia a domicilio o traslado interhospitalario), prioridad (roja, naranja, amarilla o verde), destino y **Tripulación**. Un paramédico sin cuenta aparece marcado "sin cuenta en la app" y no se puede elegir como único paramédico |
| Mis turnos | Tus turnos publicados por día y hora, desde hoy (los días pasados quedan debajo, en "Turnos anteriores"); la entrada se confirma sola al iniciar |
| Hospital | Información pública del hospital |
