# Manual del Laboratorista (LAB)

**Plataforma:** web (https://sghu-web.onrender.com). La app Android muestra "Tu rol no usa esta aplicación".
**Qué hace:** procesa las órdenes de laboratorio: toma de muestra, resultados con rangos, validación y corrección; registra los reactivos del inventario.

Antes de leer esta página, revisa [lo que vale para todos los roles](README.md#lo-que-vale-para-todos-los-roles).

## Menú

Inicio, Pacientes, Turnos, Laboratorio, Inventario y Perfil.

## Inicio

Accesos rápidos: **Tomar muestra** y **Ver inventario**.

## Laboratorio

La cola muestra todas las órdenes con su estado: `Pendiente`, `En Proceso`, `Completado` o `Cancelado`. Los filtros **Solo urgentes** y **Con valores críticos** acotan la lista. Las filas con un valor crítico llevan la marca "Crítico".

1. **Tomar muestra → Confirmar identidad.** La doble identificación exige el expediente y el nombre completo del paciente. Si no coinciden, la API lo rechaza. La orden pasa a `En Proceso`.
2. **Capturar resultados.** La API calcula la marca de cada valor (por ejemplo normal, alto o crítico) con el rango vigente del examen.
3. **Completar.** La orden pasa a `Completado`. Si hay un valor crítico, el aviso llega en vivo a Laboratorio, al médico que pidió la orden y al médico tratante; nunca al paciente.
4. **Corregir resultado → Guardar corrección.** Pide un motivo de 10 caracteres o más. Se guarda el valor anterior, la orden sigue `Completado` y vuelve a revisión médica: el paciente deja de ver los valores hasta la nueva revisión.
5. **Cancelar orden**, con motivo.

La revisión médica (**Revisar y liberar**) no es de tu rol: la hace el médico desde su app.

## Pacientes

Solo ves a los pacientes que tienen una orden de laboratorio. De la fecha de nacimiento ves el rango de edad necesario para elegir el rango de referencia. La lista se filtra solo por estado del expediente (Vigentes, Provisionales, Inactivos o Todos): los filtros de la atención de hoy exigen permisos que tu rol no tiene, y la web no los muestra.

## Inventario

**Registrar movimiento** solo de reactivos. Las otras categorías se ven, pero no se mueven.

## Turnos

Consulta de la planificación de turnos.

## Catálogo de exámenes

El catálogo (exámenes, rangos y límites críticos) lo configura el Administrador en **Catálogo de laboratorio**.
