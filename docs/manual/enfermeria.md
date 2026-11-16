# Manual de Enfermería (ENF)

**Plataforma:** app Android. La web muestra "Tu rol no usa esta aplicación".
**Qué hace:** cuida al paciente hospitalizado de su área: signos vitales, notas de enfermería, limpieza de camas, consumo de insumos, salida física y recepción de la ambulancia.

Antes de leer esta página, revisa [lo que vale para todos los roles](README.md#lo-que-vale-para-todos-los-roles).

Lo que ves de un paciente depende de tu turno: necesitas un turno en curso en su área, o una relación de atención con él.

## Secciones

AST y ENF comparten un catálogo de estación de cuidado; cada cuenta ve solo las secciones que permiten sus permisos. Para ENF: Inicio, Signos vitales, Mi planta, Limpieza de camas, Consumo de insumos, Recepción de ambulancia, Mis turnos, Hospital y Perfil.

## Mi planta

- Lista a los hospitalizados de tu área. Al abrir uno ves sus datos y sus **Notas de enfermería**.
- **Registrar salida**: aparece cuando el médico firmó el alta. Muestra cuántos pendientes tiene el alta. La cama pasa a limpieza.
- Otras acciones (por ejemplo **Trasladar de cama** o **Solicitar alta al médico tratante**) aparecen solo si tu cuenta tiene el permiso correspondiente; con el rol ENF las hacen Recepción y Jefatura.

## Signos vitales

Elige al paciente (o **Cambiar paciente**), registra los signos y pulsa **Guardar signos**.

## Limpieza de camas

- Solicita, completa y verifica la limpieza de una cama.
- La verificación debe hacerla una persona distinta de quien limpió.

## Consumo de insumos

**Registrar movimiento** de consumo de los insumos de tu área. Solo registras consumos; las entradas y ajustes los hace Jefatura. Si un artículo baja de su mínimo, aparece una alerta.

## Recepción de ambulancia

- "Servicios por recibir" lista las llegadas, con la prioridad, la llegada estimada y el motivo. Al abrir uno ves el reporte prehospital.
- Cuando la ambulancia llega al hospital, **Entrega del paciente → Marcar recibido**. Queda "Recibido por *tu nombre* · *hora*". La entrega es única.
- Para marcar recibido necesitas un turno en curso en Emergencia (`P1-EMG`) o una relación de atención con el paciente. Si no lo tienes, la app lo explica.

## Mis turnos

Tus turnos publicados, agrupados por día y por hora. La entrada se confirma sola a la hora de inicio. La lista abre en Hoy, seguida de los próximos días; los días ya pasados quedan debajo, en "Turnos anteriores".
