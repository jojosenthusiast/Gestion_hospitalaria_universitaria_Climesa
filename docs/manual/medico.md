# Manual del Médico (MED)

**Plataformas:** app Android y app iOS. La web muestra "Tu rol no usa esta aplicación".
**Qué hace:** atiende la consulta general (signos, diagnósticos CIE-10, recetas, órdenes de laboratorio y firma), revisa resultados, indica hospitalización, firma y revoca el alta, acepta reprogramaciones y recibe la ambulancia. La especialidad (alergista, emergenciólogo) es un atributo, no otro rol.

Antes de leer esta página, revisa [lo que vale para todos los roles](README.md#lo-que-vale-para-todos-los-roles).

Lo clínico se abre solo con relación de atención: el paciente de tu cita o tu número de fila, tu hospitalizado o tu orden. Si abres un paciente sin relación, la API responde "sin permiso" y el intento queda en la auditoría.

## Android

### Secciones

Inicio, Avisos, Mi día, Resultados por revisar, Mis hospitalizados, Expediente, Signos vitales (solo consulta), Llegada de ambulancia, Unidad, Bitácora, Mis turnos, Hospital y Perfil. La barra inferior muestra Inicio, Mi día, Resultados e Internados; el resto está en **Más**.

### Mi día (consulta)

- Ves tu agenda y tu fila. Llamas al paciente desde la tarjeta de la fila e inicias la consulta.
- Si dejaste una consulta sin firmar, aparece **Reanudar**.
- En la consulta: **Registrar signos**, **Registrar diagnóstico** (CIE-10; solo un diagnóstico principal), **Emitir receta** y **Ordenar exámenes**.
- **Firmar** cierra la consulta: la cita pasa a `Atendida` y la consulta ya no se edita. **Salir sin guardar** descarta los cambios no guardados.
- La consulta sigue cuatro pasos: **1. Consulta** (motivo y examen), **2. Procedimientos y plan**, **3. Receta y exámenes** y **4. Cerrar consulta** (firmar).
- Al firmar aparece **Quién pasa después**: el siguiente número de tu área según la regla de la fila (*emergencias primero; luego urgentes; luego citas dentro de su ventana de 15 min antes a 15 min después; luego el resto en orden de llegada*), con el motivo. **Llamar a CON 4** lo llama; **Ahora no** lo cierra. Recepción ve la misma propuesta.
- En la fila: cada número muestra el código del área junto al número (**CON 7**), la prioridad y si tiene cita (**Cita 10:30**) o no (**Sin cita**). El menú **Mover o cambiar prioridad** ofrece solo lo que el servidor acepta, y después de llamar puedes **Deshacer** el llamado.
- Un número que llamó otro médico (una cuenta que puede iniciar consultas) muestra su estado y no ofrece **Iniciar consulta**; en la web (Mi consultorio) se lee **Llamado desde otro consultorio**. Si lo llamó recepción o un asistente, o no consta quién, sigues pudiendo iniciar la consulta. La API nunca dice quién llamó.

### Resultados por revisar

- **Revisar** libera el resultado al paciente: antes de tu revisión el paciente ve el estado, pero no los valores.
- **Cancelar orden**: solo las órdenes que tú pediste.
- Pueden revisar el médico que pidió la orden, el médico tratante de la admisión activa o un médico con relación de atención vigente. Si nadie revisa en 2 horas, puede revisarla un médico con turno en el área de origen (revisión suplente, auditada).
- Si el laboratorio corrige un resultado ya revisado, la orden vuelve a esta lista.
- Arriba está la bandeja **Resultados por revisar**: un pendiente por orden con valor crítico (marca roja "Valor crítico") o con una observación que el laboratorio marcó como relevante. Los críticos van primero. Léelo y pulsa **Marcar como revisado**; si llega otro hallazgo de la misma orden, se suma al mismo pendiente.
- **Se realiza en otro sitio**: en una orden tuya pendiente, indica dónde se hace el examen y las instrucciones para el paciente. El paciente las ve en "Mis exámenes".
- **Cargar resultado externo** (Android): elige el PDF o la foto del informe (hasta 10 MB) y escribe el valor clave de cada examen. Al guardar, primero quedan los valores y enseguida el archivo sube al almacenamiento clínico privado. Un archivo de más de 10 MB se rechaza antes de enviar nada. Si el archivo no sube, la app dice "Los valores se guardaron, pero el archivo no se subió" y lo puedes subir después desde **Informe externo**.
- **Informe externo** (Android y web): en una orden externa completada, cada archivo muestra si es PDF o foto, su tamaño, la fecha y quién lo cargó. En Android, **Abrir archivo** pide un enlace nuevo que dura 5 minutos y lo abre con la app del teléfono; en la web, **Descargar**. Cada apertura queda en la auditoría. Si solo existe la referencia, lo dice ("Solo hay la referencia del archivo") y puedes subir ahí la foto o el PDF. El paciente nunca ve el archivo.
- La lista se agrupa por etapa; las órdenes liberadas y canceladas empiezan plegadas. Las tarjetas sin acciones muestran solo el resumen: **Ver exámenes y avance** abre el detalle.

### Avisos

**Avisos** (en **Más**) reúne los avisos vigentes para tu rol o tu área, con filtros **Todos**, **Sin leer** y **Críticos**. Al abrir uno, **Enterado** es la acción principal; en un crítico dirigido a ti también aparece **Recordarme en 4 h**. Inicio ya no lista avisos: solo muestra arriba el aviso **Crítico** pendiente hasta que das **Enterado** (ver `README.md`, "Avisos").

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

Mi día, Pacientes, Resultados, Turnos y **Más** (Avisos, Agenda, Mis hospitalizados, Ambulancia, Llegada de ambulancia, Información del hospital, Ubicación y Perfil).

| Pantalla | Qué haces |
|---|---|
| Mi día | **Quién pasa después** (número propuesto y su motivo), **Llamar siguiente**, **Deshacer** el llamado, **Mover o cambiar prioridad**, **Llamar de nuevo**, **Atender**, **Retomar consulta** o **Reanudar**. En "Solicitudes de reprogramación": **Aceptar nuevo horario** o **Rechazar**. Un solo botón resalta: **Retomar consulta** del paciente que ya atiendes o **Atender** un número de consulta general ya llamado; si no hay, **Llamar siguiente**. Los números de otros servicios y los que atiende otro médico no se resaltan. En la agenda, **Iniciar consulta** o **Retomar consulta** |
| Consulta | **Iniciar consulta**, **Guardar borrador**, **Agregar diagnóstico**, **Emitir receta**, **Ordenar exámenes**, **Firmar consulta**, en cuatro pasos (consulta, procedimientos y plan, receta y exámenes, cerrar). **Firmar consulta** es el botón principal y pide confirmación con un resumen; si hay notas sin guardar, se guardan antes de firmar. Al firmar puedes **Indicar hospitalización** o elegir **Ahora no**, y ves **Quién pasa después** con **Llamar a CON 4** |
| Pacientes | Expediente e historial de tus pacientes |
| Resultados | Bandeja **Resultados por revisar** (críticos y observaciones relevantes) con **Marcar como revisado**. En cada orden: **Marcar revisado**, **Se realiza en otro sitio**, **Cancelar orden**. Un aviso indica cuántos resultados con valor crítico esperan tu revisión. En una orden externa completada, **Informe externo** lista la foto o el PDF: **Ver archivo** pide un enlace que dura 5 minutos y abre el archivo en el iPhone (cada apertura queda en la auditoría). Si solo hay la referencia, dice "Solo hay la referencia del archivo: no se guardó en el sistema." Cargar o subir un resultado externo no está en iOS: hazlo desde Android o la web |
| Mis hospitalizados | **Firmar alta** (pide confirmación con el tipo y los pendientes), **Revocar alta** (en rojo, con motivo y confirmación) |
| Ambulancia | Estado de la unidad y **Bitácora**: prioridad, estado y fechas se aplican al elegirlos; el texto se busca con **Buscar** del teclado; **Quitar filtros** |
| Llegada de ambulancia | "Servicios por recibir", "Entrega del paciente" y **Marcar recibido** |
| Turnos | Consultar tus turnos por día, desde hoy; los días pasados quedan debajo, en "Turnos anteriores" (la entrada es automática) |
| Avisos (Más) | Todos los avisos vigentes para tu rol o tu área, con los filtros **Todos**, **Sin leer** y **Críticos**. Cada aviso muestra su nivel (Informativo, Importante o Crítico), para quién es (por ejemplo "Medicina" o "Tu área") y hasta cuándo; al abrirlo, **Enterado** es el botón principal. En un crítico dirigido a ti también está **Recordarme en 4 h** |
| Aviso crítico en Mi día | Arriba de Mi día solo sale el aviso **Crítico** dirigido a tu rol o tu área que todavía no marcaste: tarjeta roja con **Enterado**, **Recordarme en 4 h** y **Ver en Avisos**. Se queda hasta que das **Enterado**; si lo pospones, vuelve solo a la hora indicada. Los demás avisos ya no salen en Mi día ni en Información del hospital |

La app iOS compila y pasa sus pruebas en CI, pero no se ha probado en un iPhone.

## Lo que no está disponible

Una consulta firmada no se puede corregir: el addendum está pendiente.
