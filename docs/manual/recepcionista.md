# Manual del Recepcionista (REC)

**Plataformas:** web (https://sghu-web.onrender.com) y app Android.
**Qué hace:** registra y verifica pacientes, maneja la fila del día y las citas, aprueba vinculaciones de cuenta, crea admisiones con su cama, registra la salida física y despacha la ambulancia.

Antes de leer esta página, revisa [lo que vale para todos los roles](README.md#lo-que-vale-para-todos-los-roles).

## Web

### Menú

Inicio, Pacientes, Vinculaciones, Camas, Edificio, Ambulancia, Bitácora de ambulancia, Turnos, Hospitalización, Fila del día, Citas y Perfil.

### Inicio

Accesos rápidos: **Registrar paciente**, **Agendar cita**, **Emitir número** y **Solicitar ambulancia**.

### Pacientes

- Busca siempre antes de registrar: por nombre (también por sonido), DUI o expediente.
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

- **Emitir número** para un paciente y un servicio.
- **Llamar siguiente** llama al primer número en espera. En cada número: **Llamar** o **Llamar de nuevo**, **Iniciar atención** y **Completar**.
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
| Mis turnos | Tus turnos publicados y **Marcar mi entrada** cuando el turno lo permite |
| Hospital | Información pública del hospital |
