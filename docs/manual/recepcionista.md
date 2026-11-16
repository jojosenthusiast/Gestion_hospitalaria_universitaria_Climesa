# Manual del Recepcionista (REC)

**Plataformas:** web (https://sghu-web.onrender.com) y app Android.
**Qué hace:** registra y verifica pacientes, maneja la fila del día y las citas, aprueba vinculaciones de cuenta, crea admisiones con su cama, registra la salida física y despacha la ambulancia.

Antes de leer esta página, revisa [lo que vale para todos los roles](README.md#lo-que-vale-para-todos-los-roles).

## Web

### Menú

Inicio, Pacientes, Vinculaciones, Camas, Edificio, Ambulancia, Bitácora de ambulancia, Turnos, Hospitalización, Fila del día, Citas y Perfil.

### Inicio

Accesos rápidos: **Registrar paciente**, **Agendar cita**, **Emitir número**, **Llamar siguiente** y **Solicitar ambulancia**. **Emitir número** abre directamente el formulario de la fila.

### Pacientes

- Busca siempre antes de registrar: por nombre (también por sonido), DUI o expediente.
- Filtros de la lista: **Expediente** (Vigentes, Provisionales, Inactivos o Todos), **Hoy** (Hospitalizados, Esperan cama, Con alta firmada, En la fila de hoy o Con cita hoy), **Área de la cama** y **Médico tratante**. Quedan en la dirección de la página; lo que escribes en la búsqueda no.
- **Registrar paciente** crea el expediente. Si el sistema detecta un posible duplicado, lo avisa. Solo si es otra persona, regístrala con el botón que lo confirma.
- **Editar datos** corrige los datos personales con motivo; el historial guarda la versión anterior.
- Ves datos personales y de contacto, nunca diagnósticos ni resultados.

### Vinculaciones

Un paciente que creó su cuenta en la app pide vincularla a su expediente con su DUI y su fecha de nacimiento.

- Revisa que la solicitud corresponda a la persona y apruébala, o usa **Rechazar con motivo** → **Rechazar solicitud**.
- Una solicitud ya resuelta no se puede volver a resolver.

### Citas

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
- Después de llamar aparece **Llamaste CON 7.** con **Deshacer**: el número vuelve a la espera (si ya tenía otros llamados, solo se resta uno). Lo demás no se deshace: iniciar la atención, completar y "no se presentó" son definitivos.
- Un número en espera se llama antes de atenderlo. En cada número: **Llamar** o **Llamar de nuevo**, **Iniciar atención** y **Completar**.
- **No se presentó** aparece solo después de los llamados exigidos (3 por omisión).
- Al día siguiente, el sistema cierra solo los números que quedaron abiertos.

### Hospitalización

- **Ingresar paciente** abre el asistente de admisión. Luego **Asignar cama** con las camas que sugiere la API (sexo de la habitación, aislamiento).
- Si otra persona toma la misma cama al mismo tiempo, una asignación gana y la otra recibe el aviso de que la cama ya no está libre: elige otra.
- **Cancelar admisión**, con motivo, mientras espera cama.
- **Solicitar alta al médico tratante**: el médico firma el alta desde su app.
- **Registrar salida** aparece cuando el alta está firmada. El formulario "Registrar salida física" muestra cuántos pendientes tiene el alta, sin su contenido clínico. La cama pasa a limpieza.
- **Trasladar** a otra cama.

### Camas y Edificio

Consulta del tablero de camas y del árbol del edificio. El bloqueo y la limpieza los hacen JOP y ENF.

### Ambulancia

- **Registrar llamada**: crea una solicitud a nombre de quien llama.
- **Confirmar y despachar** o **Descartar** una solicitud. Al despachar eliges paramédico y motorista de turno; la propuesta viene llena. El despacho se rechaza si el paramédico no tiene cuenta en la app o si falta motorista.
- **Ver reporte prehospital**.

### Bitácora de ambulancia y Turnos

Consulta de los servicios y de la planificación de turnos.

## Android

### Secciones

Inicio, Emitir número, Pacientes, Citas, Vinculaciones, Admisión y cama, Tablero de camas, Despacho, Mis turnos, Hospital y Perfil. La barra inferior muestra Inicio y tres tareas; el resto está en **Más**.

| Sección | Qué haces |
|---|---|
| Emitir número | **Emitir número** → eliges el servicio → **Emitir** |
| Pacientes | **Buscar paciente** y registrar después de buscar |
| Citas | **Agendar cita** → **Confirmar cita**. En cada cita: **Confirmar**, **Rechazar**, **Reprogramar**, **Cancelar cita**, **No asistió**, **Aceptar nuevo horario**, **Rechazar nuevo horario**, según lo que permita el servidor |
| Vinculaciones | **Aprobar**, **Rechazar con motivo** |
| Admisión y cama | **Ingresar paciente**, **Asignar cama** → **Confirmar cama**, **Cancelar admisión** |
| Tablero de camas | Estado de las camas |
| Despacho | **Confirmar y despachar** o **Descartar** (con motivo). En el despacho eliges tipo (emergencia a domicilio o traslado interhospitalario), prioridad (roja, naranja, amarilla o verde), destino y **Tripulación**. Un paramédico sin cuenta aparece marcado "sin cuenta en la app" y no se puede elegir como único paramédico |
| Mis turnos | Tus turnos publicados por día y hora, desde hoy (los días pasados quedan debajo, en "Turnos anteriores"); la entrada se confirma sola al iniciar |
| Hospital | Información pública del hospital |
