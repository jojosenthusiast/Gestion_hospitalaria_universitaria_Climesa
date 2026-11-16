# Manual del Paciente (PAC)

**Plataformas:** app Android y app iOS. La web no tiene cuenta de paciente: su página `/registro` solo indica que la cuenta se crea en la app.
**Qué hace:** ve su turno en la fila, sus citas, el estado de sus exámenes, sus resultados revisados y su historial; pide citas y ambulancia; sabe quién vio su expediente.

Antes de leer esta página, revisa [lo que vale para todos los roles](README.md#lo-que-vale-para-todos-los-roles).

## Crear la cuenta

1. En la app, **Crear cuenta de paciente** (Android) o **Crear cuenta** (iOS).
2. Abre el correo de confirmación. El enlace abre la web, que dice "Tu correo quedó confirmado" y que ya puedes ingresar en la app.
3. Si no llegó, **Reenviar correo de confirmación** (hay una espera entre reenvíos). Después, **Ya confirmé, iniciar sesión**.

## Vincular tu expediente

Hasta vincular la cuenta con tu expediente no ves datos clínicos.

1. **Vincular expediente**: escribe tu DUI y tu fecha de nacimiento y **Enviar solicitud** (en iOS, **Enviar**).
2. Recepción revisa y aprueba. Al aprobarse, tu historial aparece sin cerrar la app.
3. Si te la rechazan, **Corregir y volver a pedir**.

Tú no eliges el expediente: lo confirma una persona de Recepción.

## Android

Secciones: Inicio, Avisos, Mi turno, Mis citas, Mis exámenes, Vincular expediente, Mi historial, Pedir ambulancia, Hospital, Quién vio mi expediente y Perfil. La barra inferior muestra Inicio, Mi turno, Mis citas y Exámenes.

## iOS

Pestañas: Inicio, Fila, Citas, Exámenes y **Más** (Vincular expediente, si todavía no lo vinculaste; Mis datos, Mi historial, Mi habitación, Pedir ambulancia, Información del hospital, Ubicación, Quién vio mi expediente y Perfil).

En **Inicio**, cada tarjeta (fila, próxima cita, exámenes) abre su pestaña al tocarla. Si tu cuenta no está vinculada, **Vincular expediente** abre el formulario directamente.

## Mi turno (Fila)

Muestra tu número y su estado: "Esperando a que el médico llame", "Llamado N de M". En iOS, cuando te llaman: "¡Es tu turno! Pasa al *consultorio*". Si no te presentas después de los llamados exigidos, el número se marca como ausente.

## Mis citas

- **Pedir una cita**: eliges el motivo, no el médico. Toca una o hasta tres categorías con ícono (por ejemplo **Piel**,
  **Corazón y presión** o **Consulta general** si no sabes cuál) o escribe en **Buscar motivo** ("fiebre",
  "embarazo"). Elige tu **Franja preferida** (mañana, tarde o cualquier hora), deja una **Nota** breve si quieres y
  **Enviar solicitud**. Recepción te asigna médico y hora; la verás en **Mis solicitudes** y en tus citas.
- **Ya tengo médico (opcional)**: si ya conoces a tu médico, búscalo por su nombre; Recepción intentará darte cita con
  él o ella.
- **Retirar solicitud** mientras siga "Por asignar". Si Recepción la rechaza, ves el motivo.
- En la app Android, **Pedir una cita** abre una página con los motivos, la franja, la nota y **Ya tengo médico (opcional)**; **Mis solicitudes** aparece debajo, en **Mis citas**.
- En iOS, **Pedir cita** abre la misma hoja: motivos con ícono, **Buscar motivo**, **Franja preferida**, la nota y **Ya tengo médico (opcional)**; **Enviar solicitud**. **Mis solicitudes** aparece arriba de tus citas, con **Retirar solicitud**.
- Puedes tener hasta 2 solicitudes esperando a la vez (por motivo o con médico y hora). Una solicitud por motivo deja de contar para ese límite a los 14 días, aunque Recepción todavía puede asignarla.
- **Solicitar reprogramación** (en iOS, **Reprogramar → Pedir el cambio**): tu cita original sigue vigente hasta que Recepción o tu médico acepten el cambio.
- **Cancelar** (en iOS, **Cancelar cita → Confirmar cancelación**).
- La cita muestra "Puedes cancelar o reprogramar hasta las …": puedes hacerlo hasta 2 horas antes.
- Puedes tener como máximo 2 solicitudes pendientes. Una solicitud que nadie confirmó antes de su hora queda vencida.

## Mis exámenes

Ves el estado de cada orden siempre. Los **valores** aparecen solo después de que tu médico revisa el resultado. Si el laboratorio corrige un valor, vuelve a esperar la revisión.

Si un examen se hace en otro lugar, la orden dice "Se realiza en otro sitio" con el lugar y las instrucciones (preparación, qué llevar). Hazte el examen allí y trae el informe (foto o PDF) a tu próxima cita o al laboratorio. Cuando tu médico revisa el resultado, lo ves aquí como cualquier otro. Después puede que Recepción te llame para agendar una cita de seguimiento.

## Mi historial

Tu historial clínico revisado: consultas firmadas, diagnósticos, recetas y resultados liberados.

## Pedir ambulancia

- **Pedir ambulancia** con el motivo y la ubicación. La app recuerda: "Si hay riesgo de vida, llama al 911."
- En iOS, la dirección y el teléfono vienen llenos con los de **Mis datos**; cámbialos si estás en otro lugar.
- Ves el estado de tu solicitud. **Cancelar solicitud** solo mientras está por confirmar.

## Hospital

Información pública: ocupación por planta, médicos de turno y avisos. En iOS, **Ubicación** ofrece **Llamar al hospital** y **Abrir en Mapas**; **Mi habitación** muestra tu cama si estás hospitalizado.

## Quién vio mi expediente

Lista quién consultó tus datos: rol, qué vio, motivo y fecha, sin el nombre de la persona. En Android, **Actualizar** vuelve a cargar la lista.

## Mis datos (Perfil)

Puedes corregir tu teléfono, tu correo y tu dirección (en iOS, **Editar mis datos → Guardar cambios**). Los demás datos los corrige Recepción.
