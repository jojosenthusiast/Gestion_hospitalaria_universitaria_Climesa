# Manual del Paramédico (PAR)

**Plataforma:** app Android (solo móvil). La web muestra "Tu rol no usa esta aplicación".
**Qué hace:** forma parte de la tripulación de la única ambulancia: registra los hitos del servicio, la ubicación en vivo y el reporte prehospital, y registra pacientes sin identidad confirmada.

Antes de leer esta página, revisa [lo que vale para todos los roles](README.md#lo-que-vale-para-todos-los-roles).

Para que te puedan despachar necesitas un turno publicado y tu cuenta activa en la app. Un servicio también necesita un motorista de turno.

## Secciones

Inicio, Servicio, Bitácora, Mis turnos, Hospital y Perfil. La barra inferior muestra Inicio, Servicio y Bitácora.

## Servicio

Cuando te despachan, el servicio aparece aquí. Cada paso es un botón grande que se confirma con **Registrar**:

1. **Salí hacia el lugar**
2. **Llegué al lugar**
3. **Salgo con el paciente**
4. **Llegué al hospital**
5. **Finalizar servicio**: termina `Completado` y la unidad vuelve a `Disponible`.

Los hitos van en orden: la API rechaza un hito fuera de secuencia. Cada uno llega en vivo a la web de Jefatura y Recepción.

### Terminar sin llegar al hospital

**Terminar sin llegar al hospital** ofrece los estados finales posibles según los hitos que ya registraste, con un motivo, y se confirma con **Finalizar servicio**:

| Estado final | Cuándo se permite |
|---|---|
| Sin traslado | Antes de salir con el paciente |
| Paciente rechaza traslado | Antes de salir con el paciente |
| Paciente fallecido | Antes de llegar al hospital |
| Desviado a otro centro | Durante el traslado |
| Cancelado | Antes de llegar al hospital |

Con la llegada al hospital registrada, el único final es `Completado`. La base rechaza un estado final que no corresponde a los hitos.

### Reporte prehospital

**Reporte prehospital → Enviar reporte prehospital.** El personal de Emergencia lo ve antes de que llegues. Si no hay señal, queda "Reporte en cola: se enviará una sola vez al volver la señal."

### Paciente sin identidad

**Paciente sin identidad → Crear paciente provisional** registra a un paciente cuya identidad no se puede confirmar, sin inventar datos.

### Ubicación

**Enviar mi ubicación** comparte la posición de la ambulancia mientras hay un servicio activo.

### Entrega en el hospital

La entrega del paciente la marca el personal de Emergencia (ENF o MED) con **Marcar recibido**. Si la tripulación no puede cerrar el servicio, Jefatura tiene un cierre administrativo.

## Bitácora

Tus servicios, con **Buscar en la bitácora**, **Filtros** y **Quitar filtros**.

## Mis turnos

Tus turnos publicados y **Marcar mi entrada**.
