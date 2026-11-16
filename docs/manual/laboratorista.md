# Manual del Laboratorista (LAB)

**Plataforma:** web (https://sghu-web.onrender.com). La app Android muestra "Tu rol no usa esta aplicación".
**Qué hace:** procesa las órdenes de laboratorio: toma de muestra, resultados con rangos, validación y corrección; registra los reactivos del inventario.

Antes de leer esta página, revisa [lo que vale para todos los roles](README.md#lo-que-vale-para-todos-los-roles).

## Menú

Inicio, Pacientes, Turnos, Laboratorio, Inventario, Avisos y Perfil.

**Avisos**: tus avisos, con los críticos primero, y **Enterado**. Un aviso crítico para Laboratorio sale arriba en Inicio hasta que pulsas **Enterado** (ver `README.md`, "Avisos").

## Inicio

Accesos rápidos: **Tomar muestra** y **Ver inventario**.

## Laboratorio

La cola agrupa las órdenes por lo que toca hacer, en este orden: "En proceso", "Por tomar muestra", "Externas: esperan el informe", "Esperan revisión médica", "Liberadas" y "Canceladas". Los dos últimos grupos empiezan plegados: ábrelos con **Mostrar liberadas** o **Mostrar canceladas**. Al buscar o filtrar por etapa se ven todos. Los filtros **Solo urgentes** y **Con valores críticos** acotan la lista. La prioridad urgente se marca en ámbar; el rojo y la marca "Crítico" son solo para valores críticos.

El detalle de la orden muestra primero quién actúa y las acciones; las fechas quedan plegadas en **Datos de la orden**.

1. **Tomar muestra → Confirmar identidad.** La doble identificación exige el expediente y el nombre completo del paciente. Si no coinciden, la API lo rechaza. La orden pasa a `En Proceso`.
2. **Capturar resultados.** La API calcula la marca de cada valor (por ejemplo normal, alto o crítico) con el rango vigente del examen.
3. **Completar.** La orden pasa a `Completado`. Si hay un valor crítico, el aviso llega en vivo a Laboratorio, al médico que pidió la orden y al médico tratante; nunca al paciente.
4. **Corregir resultado → Guardar corrección.** Pide un motivo de 10 caracteres o más. Se guarda el valor anterior, la orden sigue `Completado` y vuelve a revisión médica: el paciente deja de ver los valores hasta la nueva revisión.
5. **Cancelar orden**, con motivo.

**Observación.** Al capturar un valor puedes escribir una **Observación (opcional)**. Si marcas **Es relevante**, el médico que pidió la orden recibe un pendiente en "Resultados por revisar". Un valor crítico crea ese pendiente siempre, sin marcar nada.

**Completar por lote.** Las órdenes con todos sus valores capturados tienen una casilla. Marca las que quieras (o **Seleccionar todas**) y pulsa **Completar N seleccionadas**. Cada orden se completa por separado: si una falla, el aviso dice cuál y por qué, y las demás quedan completadas.

**Órdenes externas.**

1. **Se realiza en otro sitio.** En una orden pendiente, escribe dónde se hace el examen y las instrucciones para el paciente (el texto trae una plantilla que puedes editar). La orden ya no pide muestra aquí y el paciente ve el lugar y las instrucciones en "Mis exámenes".
2. **Cargar resultado externo.** Cuando el paciente trae el informe, adjunta el PDF o la foto (hasta 10 MB) y escribe el valor clave de cada examen. La marca la calcula el sistema y la orden queda `Completado`, esperando la revisión médica.
3. En la web, al guardar, el archivo sube al **almacenamiento clínico privado** y queda en el expediente. El sistema revisa que de verdad sea un PDF o una foto (no basta el nombre) y calcula su huella. Si el archivo no sube, los valores ya quedaron guardados y el aviso lo dice.
4. En el detalle de una orden externa completada, **Informe externo** muestra cada archivo: **Descargar** baja el archivo con un enlace que dura 5 minutos y queda registrado en la auditoría. Si solo existe la referencia (por ejemplo, se cargó con una versión anterior de la app Android o la subida falló), lo dice y puedes subir ahí la foto o el PDF. Un archivo guardado no se reemplaza.
5. El paciente nunca ve ni descarga el archivo.

Al completarse una orden de una consulta (sin hospitalización activa), el sistema propone a Recepción una cita de seguimiento con el médico que pidió los exámenes.

La revisión médica (**Revisar y liberar**) no es de tu rol: la hace el médico desde su app.

## Pacientes

Solo ves a los pacientes que tienen una orden de laboratorio. De la fecha de nacimiento ves el rango de edad necesario para elegir el rango de referencia. La lista se filtra solo por estado del expediente (Vigentes, Provisionales, Inactivos o Todos): los filtros de la atención de hoy exigen permisos que tu rol no tiene, y la web no los muestra.

## Inventario

**Registrar movimiento** solo de reactivos. Las otras categorías se ven, pero no se mueven.

## Turnos

Consulta de la planificación de turnos.

## Catálogo de exámenes

El catálogo (exámenes, rangos y límites críticos) lo configura el Administrador en **Catálogo de laboratorio**.
