# Manual del Médico (MED)

**Plataformas:** app Android y app iOS. La web muestra "Tu rol no usa esta aplicación".
**Qué hace:** atiende la consulta general (signos, diagnósticos CIE-10, recetas, órdenes de laboratorio y firma), revisa resultados, indica hospitalización, firma y revoca el alta, acepta reprogramaciones y recibe la ambulancia. La especialidad (alergista, emergenciólogo) es un atributo, no otro rol.

Antes de leer esta página, revisa [lo que vale para todos los roles](README.md#lo-que-vale-para-todos-los-roles).

Lo clínico se abre solo con relación de atención: el paciente de tu cita o tu número de fila, tu hospitalizado o tu orden. Si abres un paciente sin relación, la API responde "sin permiso" y el intento queda en la auditoría.

## Android

### Secciones

Inicio, Mi día, Resultados por revisar, Mis hospitalizados, Expediente, Signos vitales (solo consulta), Llegada de ambulancia, Unidad, Bitácora, Mis turnos, Hospital y Perfil. La barra inferior muestra Inicio, Mi día, Resultados e Internados; el resto está en **Más**.

### Mi día (consulta)

- Ves tu agenda y tu fila. Llamas al paciente desde la tarjeta de la fila e inicias la consulta.
- Si dejaste una consulta sin firmar, aparece **Reanudar**.
- En la consulta: **Registrar signos**, **Registrar diagnóstico** (CIE-10; solo un diagnóstico principal), **Emitir receta** y **Ordenar exámenes**.
- **Firmar** cierra la consulta: la cita pasa a `Atendida` y la consulta ya no se edita. **Salir sin guardar** descarta los cambios no guardados.

### Resultados por revisar

- **Revisar** libera el resultado al paciente: antes de tu revisión el paciente ve el estado, pero no los valores.
- **Cancelar orden**: solo las órdenes que tú pediste.
- Pueden revisar el médico que pidió la orden, el médico tratante de la admisión activa o un médico con relación de atención vigente. Si nadie revisa en 2 horas, puede revisarla un médico con turno en el área de origen (revisión suplente, auditada).
- Si el laboratorio corrige un resultado ya revisado, la orden vuelve a esta lista.

### Aviso de valor crítico

Cuando llega un resultado con valor crítico de tu paciente aparece, sobre cualquier sección: "Llegó un resultado con valor crítico. Revísalo cuanto antes.", con **Revisar** o **Cerrar aviso**. El aviso llega al médico que pidió la orden y al tratante; nunca al paciente.

### Mis hospitalizados

- **Firmar alta**: solo el médico firma el alta. Recepción o Jefatura pueden pedírtela; te llega un aviso en vivo.
- **Revocar alta**, con motivo, mientras el paciente no haya salido.

### Expediente

Historial clínico completo de un paciente con relación de atención.

### Llegada de ambulancia

- "Servicios por recibir" lista las llegadas: "Despachado *HH:MM* · en camino" o "· llegó, falta la entrega". Ves el reporte prehospital antes de que llegue el paciente.
- **Entrega del paciente → Marcar recibido** cuando la ambulancia llegó. Necesitas un turno en curso en Emergencia (`P1-EMG`) o relación de atención con el paciente.

### Unidad y Bitácora

- **Unidad** muestra el estado de la ambulancia y la tripulación de turno.
- **Bitácora** lista los servicios.

### Mis turnos

Tus turnos publicados, agrupados por día y por hora. La entrada se confirma sola a la hora de inicio. La lista abre en Hoy, seguida de los próximos días; los días ya pasados quedan debajo, en "Turnos anteriores".

## iOS

### Pestañas

Mi día, Pacientes, Resultados, Turnos y **Más** (Agenda, Mis hospitalizados, Ambulancia, Llegada de ambulancia, Información del hospital, Ubicación y Perfil).

| Pantalla | Qué haces |
|---|---|
| Mi día | **Llamar siguiente**, **Llamar de nuevo**, **Atender**, **Retomar consulta** o **Reanudar**. En "Solicitudes de reprogramación": **Aceptar nuevo horario** o **Rechazar** |
| Consulta | **Iniciar consulta**, **Guardar borrador**, **Agregar diagnóstico**, **Emitir receta**, **Ordenar exámenes**, **Firmar consulta**. Al firmar puedes **Indicar hospitalización** o elegir **Ahora no** |
| Pacientes | Expediente e historial de tus pacientes |
| Resultados | **Marcar revisado**, **Cancelar orden**. Un aviso indica cuántos resultados con valor crítico esperan tu revisión |
| Mis hospitalizados | **Firmar alta**, **Revocar alta** |
| Llegada de ambulancia | "Servicios por recibir", "Entrega del paciente" y **Marcar recibido** |
| Turnos | Consultar tus turnos por día, desde hoy; los días pasados quedan debajo, en "Turnos anteriores" (la entrada es automática) |

La app iOS compila y pasa sus pruebas en CI, pero no se ha probado en un iPhone.

## Lo que no está disponible

Una consulta firmada no se puede corregir: el addendum está pendiente.
