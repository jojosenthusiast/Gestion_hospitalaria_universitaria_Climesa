# Reglas de negocio

Una sola lista de las reglas que el sistema hace cumplir. Cada spec las referencia por ID (`RN-xx`). Fuente entre paréntesis.

## Infraestructura y camas
- **RN-01** Planta 3: 5 habitaciones VIP individuales (VIP-301 a VIP-305). Planta 2: 6 habitaciones semiprivadas de 2 camas (HAB-201 a HAB-206), 12 camas. Total de hospitalización: 17 camas. Son datos de configuración (REQ-HAB-01, 02, 07).
- **RN-02** Ninguna cama tiene dos ocupaciones que se traslapen; ninguna habitación supera su capacidad (REQ-HAB-03, D-013).
- **RN-03** Estados de cama: libre, reservada (asignada a una admisión que aún no llega, vence a las 2 h), ocupada, en limpieza, bloqueada (motivo obligatorio). Solo "libre" se puede asignar.
- **RN-04** Al registrar la salida física la cama pasa a "en limpieza"; vuelve a "libre" cuando otra persona verifica la lista de limpieza (D-013, R03).

## Algoritmo de asignación de cama (D-036)
- **RN-05** Filtros duros, en orden:
  1. categoría pedida (VIP o semiprivada) según solicitud o cobertura; si no hay VIP libre, se ofrece semiprivada y se avisa; nunca al revés sin autorización del Jefe de Operaciones;
  2. cama libre (no reservada, ocupada, en limpieza ni bloqueada);
  3. en semiprivada, el otro ocupante de la habitación (si lo hay) es del mismo sexo;
  4. paciente con aislamiento: solo habitación vacía, y la otra cama queda bloqueada mientras dure;
  5. si el otro ocupante está aislado, la habitación no se ofrece.
- **RN-06** Orden de preferencia entre las que pasan: en semiprivada, primero habitaciones con un ocupante compatible (consolida y deja habitaciones vacías para aislados y para el otro sexo); después habitaciones vacías; desempate por menor número de habitación. En VIP, menor número libre.
- **RN-07** El algoritmo devuelve una lista ordenada con el motivo de cada sugerencia. La persona confirma; la base de datos decide si la cama sigue libre en ese instante. Si no, el cliente recibe "otra persona tomó esta cama" y la siguiente sugerencia (D-063).
- **RN-08** Traslados: quien ocupa VIP no se traslada; quien ocupa semiprivada puede ir a otra semiprivada o a una VIP libre, con los mismos filtros. El traslado cierra una ocupación y abre otra en la misma transacción (D-037).

## Admisión
- **RN-09** Orígenes: consulta (indicación del médico), emergencia, ambulancia (servicio finalizado en el hospital), programada (fecha futura). Cada admisión guarda su origen y la referencia (D-038).
- **RN-10** No se admite a un paciente que ya tiene una admisión activa.
- **RN-11** El alta la firma el médico tratante con inscripción vigente; cada pendiente tiene responsable; el alta voluntaria exige constancia. La salida física es un acto distinto del alta (legado 002).

## Turnos del personal (D-054)
- **RN-12** Sin traslape por persona. Duración 4 a 12 h; guardia médica hasta 24 h.
- **RN-13** Descanso mínimo 8 h entre cualquier par de turnos; 12 h después de una guardia de 24 h (y hasta el fin del día en que termina). Dos noches seguidas con 12 h entre ellas se permiten. Un turno pertenece a la jornada del día en que empieza. La base lo garantiza (`descanso_insuficiente`, 20261120003000).
- **RN-13a** Carga (CARGA-01): máximo 72 h en cualquier ventana de 7 días y 6 días seguidos (política `turnos.carga`). Solo se supera con un motivo de emergencia de 10 caracteres o más, que queda en el turno y en la auditoría. La base aplica el tope de horas (`carga_semanal_excedida`).
- **RN-14** Más de 44 h semanales diurnas genera aviso (Código de Trabajo Art. 161), no bloqueo; se exige justificación.
- **RN-15** Cobertura mínima: Emergencia 1 médico y 1 enfermero las 24 h; 1 enfermero por planta con camas ocupadas; 1 recepcionista en horario de atención; 1 laboratorista en horario de laboratorio. Publicar con huecos muestra advertencia y queda registrado quién publicó.
- **RN-16** Roles clínicos solo con inscripción vigente durante todo el turno.
- **RN-17** Médicos de turno se publican como información pública: nombre, especialidad, área.
- **RN-17a** Asistencia (ASIS-01): "de turno" es un turno publicado o en curso que **no** está `ausente`. La persona marca su entrada desde 30 min antes del inicio (o JOP la marca); pasado el margen de 15 min sin entrada, el turno queda "sin entrada marcada" y se avisa a JOP en vivo (política `turnos.asistencia`). JOP registra la ausencia con tipo (justificada o injustificada) y motivo; un turno ausente no cuenta para la agenda de citas, la fila, los médicos de turno, el contexto de área, RN-30 (paramédico y motorista) ni la cobertura. La base rechaza citas en el horario de un médico ausente (`medico_ausente`) y una persona ausente en una tripulación (`tripulante_ausente`).
- **RN-17b** Estados del turno (MA-TUR-01 a 05): un turno nace publicado; solo se mueve o cancela antes de empezar (`turno_iniciado`); cancelar no lo mueve a la vez; el turno de un médico con citas vivas no se cancela ni se mueve fuera de ellas (`turno_con_citas`, las citas se reprograman o cancelan primero). Nadie devuelve a borrador un turno en curso.

## Fila del día y citas
- **RN-18** El número de fila es único por servicio y día, empieza en 1 cada día y no tiene huecos (D-035).
- **RN-19** Estados del número: en espera, llamado, en atención, atendido, no se presentó y cerrado sin atender. "No se presentó" solo después de `fila.llamados_para_ausencia` llamados (3); nunca desde "en espera". Al terminar el día, los números abiertos se cierran solos (fase 0/1, FILA-01 y FILA-03).
- **RN-20** Un médico no tiene dos citas a la vez. La cita pedida por el paciente queda "solicitada" hasta que recepción la confirma (D-033).
- **RN-21** El paciente puede cancelar su cita, o pedir reprogramarla, hasta 2 h antes (`citas.cancelacion_horas`). Recepción, hasta la hora de inicio. La API devuelve el plazo (`cancelableUntil`) y las acciones válidas (`allowedActions`).

## Consulta y laboratorio
- **RN-22** Se consulta desde un número llamado o una cita. Iniciar la consulta crea la relación de atención.
- **RN-23** Firmar exige inscripción vigente en el instante (D-012). Lo firmado no se edita: se corrige con addendum que conserva el original.
- **RN-24** Estados de orden: Pendiente, En Proceso (muestra tomada), Completado (todos los valores capturados y validados por el laboratorista), Cancelado (con motivo). Revisado es una marca aparte (D-059).
- **RN-25** Rango de referencia según sexo y edad vigentes a la fecha de la muestra. Valor fuera de rango: alto o bajo; fuera del rango crítico: crítico, con aviso inmediato al médico: el evento `laboratorio.critico` va solo al rol de laboratorio y al canal `usuario:` del médico que pidió la orden y del tratante de la admisión activa; los demás canales de rol reciben solo `laboratorio.actualizado` y el paciente nunca recibe el aviso crítico (tampoco al enmendar un resultado ya liberado). Los móviles lo muestran como franja de aviso a quien puede revisar esa orden (`allowedActions`).
- **RN-26** El paciente ve siempre el estado; los valores solo después de la revisión médica (D-040). Revisa y libera el médico que pidió la orden, el tratante de la admisión activa, un médico con relación de atención vigente o un suplente: médico de turno (publicado o en curso) en el área de origen de la orden (área del turno de quien la pidió al crearla o área del consultorio de la consulta), y solo cuando la orden lleva sin revisar el plazo de la política `laboratorio.revision_suplente_horas` (2 horas por omisión) desde que se completó o enmendó (`laboratorio.puede_revisar`; siempre persona tipo médico activa). Enfermería con relación de atención no ve valores sin liberar. Un resultado de una orden completada se enmienda con motivo de 10 caracteres o más (D-13 de la auditoría final): el valor anterior queda en el historial y la orden vuelve a revisión médica.
- **RN-27** Un panel se expande a sus exámenes hoja de forma recursiva, sin ciclos (D-062).

## Ambulancia
- **RN-28** Existe una sola unidad. Estados: Disponible, En Servicio, En Mantenimiento (REQ-AMB-01, 02).
- **RN-29** Solo se despacha si está Disponible; despachar la pasa a En Servicio en la misma transacción. Dos despachos simultáneos: uno gana, el otro recibe "la ambulancia ya fue despachada" (D-063).
- **RN-30** No puede estar Disponible ni despacharse sin un paramédico **y** un motorista con turno en curso (D-054; motorista agregado por decisión del dueño el 2026-11-14). Códigos: `sin_paramedico_de_turno`, `sin_motorista_de_turno`, `sin_tripulacion_de_turno` (faltan los dos). La base rechaza pasar la unidad a En Servicio si la tripulación del servicio no tiene paramédico y motorista (`tripulacion_incompleta`, 20261119002000).
- **RN-31** Mantenimiento solo sin servicio activo; lo pone y lo quita el Jefe de Operaciones con motivo.
- **RN-32** Hitos en orden: salida, en escena, trasladando, en hospital, finalizado. Se puede finalizar sin traslado indicando motivo. Al finalizar vuelve a Disponible. El estado final depende de los hitos (MA-AMB-03): `completado` solo después de llegar al hospital; antes de salir con el paciente, sin traslado, rechazo, fallecimiento o cancelación; durante el traslado, fallecimiento, desvío a otro centro o cancelación, siempre con motivo y sin registrar una llegada falsa. La API los entrega en `activeService.finalStates` y la base los valida. Después de la llegada, el personal clínico marca recibido al paciente (`POST /ambulancia/servicios/{id}/recepcion`, una vez; MA-AMB-04).
- **RN-33** Solicitud del paciente: "por confirmar" hasta que despacho llama y confirma; la app muestra el aviso del 911 (D-058).
- **RN-34** Reporte prehospital: se guarda en el teléfono si no hay señal y se reenvía con la misma clave de idempotencia (D-041).
- **RN-35** Bitácora filtrable por fecha, tipo, estado final, prioridad, tripulación, municipio y tiempos; paciente oculto sin relación de atención (D-056).

## Inventario
- **RN-36** Ninguna existencia queda negativa; todo cambio de existencia es un movimiento con motivo y autor (D-057).
- **RN-37** Al bajar del mínimo se avisa en tiempo real. Lotes vencidos no se pueden usar.

## Cuentas y privacidad
- **RN-38** Nadie se asigna roles a sí mismo.
- **RN-39** La cuenta de paciente sin verificar no ve nada personal ni clínico (D-032). La verificación compara DUI y fecha de nacimiento con el expediente; si no hay expediente, recepción lo crea siguiendo "buscar antes de crear".
- **RN-40** (retirada) El acceso excepcional dejó de existir en la ronda 1; no hay lectura clínica sin relación de atención (D-031).
